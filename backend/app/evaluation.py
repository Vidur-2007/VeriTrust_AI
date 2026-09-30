"""Evaluation: how often do customers get a wrong answer, with and without the guardrail?

Modes
  baseline  the Maker alone (manual only, no Judge): a plain RAG support bot
  guarded   the full guardrail
  injected  the full guardrail with one false detail injected into each first draft
  all       all three

Grading: every final answer is checked by one Judge call against the question's gold facts
(plus lexically similar facts), then the rule layer. An answer is a hallucination if it has a
contradicted claim, or an unsupported claim in a high-risk category. The grader is the same
model family as the Judge, so hand-check a sample (Phase 8) before quoting the numbers.

Honest partial runs: a question whose answer or grade could not be produced (every model
failed, or a Gemini-only run was answered by the local model) is recorded as skipped, never
scored. Questions run one at a time through every mode, so the finished ones stay comparable,
and baseline vs guarded is compared only on questions finished in both.

Model comparison (FEATURES #26): a run with provider="ollama" has the local model as Maker and
Judge while Gemini still grades, so its rates can be set against the Gemini run's. An answer
Gemini couldn't grade yet (quota) is kept as ungraded, with its time, and graded by a rerun.
"""

import asyncio
import json
import re
import time
from collections import Counter, defaultdict
from collections.abc import AsyncIterator
from typing import Any, Literal

from pydantic import BaseModel, Field

from app import analytics, db, domains, guard, llm, pii, retrieval, rules
from app.config import get_settings
from app.graph import nodes, prompts
from app.graph.run import run_chat
from app.llm import Provider
from app.schemas import ChatRequest, Claim, MakerOut

Mode = Literal["baseline", "guarded", "injected"]
RunMode = Literal["baseline", "guarded", "injected", "all"]
MODES: tuple[Mode, ...] = ("baseline", "guarded", "injected")
GRADER_NOTE = "\n\n(Evaluation grading pass.)"  # keeps grader calls apart in the LLM cache


class EvalQuestion(BaseModel):
    id: str
    type: Literal["answerable", "stale_trap", "adversarial", "out_of_scope"]
    category: str
    question: str
    gold_fact_ids: list[str] = Field(default_factory=list)
    language: str = "en"


def load_questions(limit: int | None = None, ids: list[str] | None = None) -> list[EvalQuestion]:
    lines = domains.active().questions_file.read_text(encoding="utf-8").splitlines()
    qs = [EvalQuestion(**json.loads(ln)) for ln in lines if ln.strip()]
    if ids:
        qs = [q for q in qs if q.id in set(ids)]
    return qs[:limit] if limit else qs


def sample_ids(n: int) -> list[str]:
    """A fixed sample of n question ids with the same mix of question types as the full set,
    spread evenly through each type (so categories and languages are covered too)."""
    qs = load_questions()
    by_type: dict[str, list[str]] = defaultdict(list)
    for q in qs:
        by_type[q.type].append(q.id)
    share = {t: n * len(ids) / len(qs) for t, ids in by_type.items()}
    take = {t: int(v) for t, v in share.items()}
    # Hand out what rounding left over by largest remainder; ties go to the smaller type.
    for t in sorted(by_type, key=lambda t: (-(share[t] - take[t]), len(by_type[t]))):
        if sum(take.values()) >= min(n, len(qs)):
            break
        take[t] += 1
    picked = {ids[i * len(ids) // take[t]] for t, ids in by_type.items() for i in range(take[t])}
    return [q.id for q in qs if q.id in picked]


def modes_for(mode: RunMode) -> list[Mode]:
    return list(MODES) if mode == "all" else [mode]


class Skip(Exception):
    """This question can't be scored in this mode (no model answered, or the wrong one did)."""


def require_gemini(providers: set[str], gemini_only: bool, what: str) -> None:
    if gemini_only and "ollama" in providers:
        raise Skip(f"{what} came from the local model, and this run is Gemini only.")


# ---------------------------------------------------------------- answering and grading

async def baseline_answer(q: EvalQuestion,
                          gemini_only: bool = False) -> tuple[str, str, bool]:
    """The Maker alone, with the same prompt the guarded run's first draft uses.
    Returns (answer, provider, cached)."""
    language = guard.detect_language(q.question)
    question = pii.redact(q.question).text
    hits, _ = await retrieval.search("manual_chunks", question, nodes.MANUAL_K)
    chunks = [nodes.chunk_from_hit(h) for h in hits]
    prompt = prompts.maker_prompt(question=question, language=language, chunks=chunks,
                                  inject=False)
    r = await llm.generate_json_result(prompt, MakerOut, system=prompts.maker_system(language),
                                       temperature=0.3, allow_long_wait=True)
    require_gemini({r.provider}, gemini_only, "The baseline answer")
    return r.data.answer.strip(), r.provider, r.cached


def is_hallucination(claims: list[Claim], high_risk: list[str]) -> bool:
    return any(c.verdict == "contradicted"
               or (c.verdict == "unsupported" and c.category in high_risk) for c in claims)


def grading_facts(q: EvalQuestion, answer: str) -> list[Any]:
    """Facts the grader checks an answer against: the gold facts, facts that share words with
    the answer, and for Hindi or Telugu answers (where word matching against the English facts
    finds nothing) every fact in the gold facts' categories, so a true side detail such as
    "pay by card or UPI" isn't graded unsupported only because its fact wasn't shown."""
    gold = [f for i in q.gold_fact_ids if (f := db.get_fact(i)) is not None]
    similar = [f for h in retrieval.lexical_search("facts", answer, 6)
               if (f := db.get_fact(h.id)) is not None]
    same_topic = ([f for c in sorted({g.category for g in gold}) for f in db.list_facts(c)]
                  if guard.detect_language(answer) != "en" else [])
    return list({f.id: f for f in gold + similar + same_topic}.values())


async def grade(q: EvalQuestion, answer: str, gemini_only: bool = False,
                grader: Provider | None = None) -> list[Claim]:
    """`grader` forces the grading model (no fallback), whatever model wrote the answer."""
    facts = grading_facts(q, answer)
    r = await llm.generate_json_result(
        prompts.judge_prompt(draft=answer, facts=[f.model_dump() for f in facts]) + GRADER_NOTE,
        domains.active().judge_schema, system=prompts.judge_system(), temperature=0.0,
        allow_long_wait=True, provider=grader)
    require_gemini({r.provider}, gemini_only, "The grade")
    by_id = {f.id: f for f in facts}
    claims = [nodes.enrich_claim(jc, answer, by_id, [])
              for jc in r.data.claims if jc.text.strip()]
    return rules.apply_rules(claims, by_id, q.question)


def _claim_summary(claims: list[Claim]) -> list[dict[str, Any]]:
    return [{"verdict": c.verdict, "category": c.category, "text_en": c.text_en,
             "evidence_fact_ids": c.evidence_fact_ids, "caught_by": c.caught_by}
            for c in claims]


async def answer(q: EvalQuestion, mode: Mode,
                 gemini_only: bool = False) -> tuple[dict[str, Any], str | None]:
    """The answer to one question in one mode, not graded yet. Returns (record, first draft
    when the guardrail blocked it). Raises Skip or llm.LLMError when no answer was produced."""
    started = time.perf_counter()
    record: dict[str, Any] = {"id": q.id, "type": q.type, "category": q.category, "mode": mode,
                              "question": q.question, "gold_fact_ids": q.gold_fact_ids}
    if mode == "baseline":
        text, provider, cached = await baseline_answer(q, gemini_only)
        ms = round((time.perf_counter() - started) * 1000)
        return record | {"answer": text, "status": "unguarded", "retries": 0,
                         "first_draft_blocked": False, "ms": ms, "models": [provider],
                         "cached": cached}, None

    r = await run_chat(ChatRequest(question=q.question, channel="eval",
                                   inject=mode == "injected"), batch=True)
    if r.error:  # every model failed: the hand-off is an outage, not a caught hallucination
        raise Skip(r.error["message"])
    require_gemini({s["provider"] for s in r.timings["spans"] if s["provider"]},
                   gemini_only, "The guarded answer")
    record |= {
        "answer": r.final_answer, "status": r.status, "retries": r.retries,
        "trust_score": r.trust_score, "interaction_id": r.interaction_id,
        "first_draft_blocked": r.retries > 0 or r.status == "escalated",
        "injected_detail": r.drafts[0].injected_detail if r.drafts else None,
        "ms": r.timings["total_ms"], "error": r.error,
        "models": sorted({s["provider"] for s in r.timings["spans"] if s["provider"]}),
        # Replayed from the LLM cache: its time says nothing about real latency.
        "cached": all(s["cached"] for s in r.timings["spans"] if s["provider"]),
    }
    blocked_first = mode == "guarded" and record["first_draft_blocked"] and r.drafts
    return record, (r.drafts[0].text if blocked_first else None)


async def score(q: EvalQuestion, record: dict[str, Any], first_draft: str | None,
                high_risk: list[str], gemini_only: bool = False,
                grader: Provider | None = None) -> dict[str, Any]:
    """Grade an answered record. Raises Skip or llm.LLMError when the grader is unavailable."""
    out = dict(record)
    if first_draft is not None:  # false block check: was the blocked first draft actually fine?
        first = await grade(q, first_draft, gemini_only, grader)
        out["first_draft_hallucinated"] = is_hallucination(first, high_risk)
    if out["status"] == "escalated":  # the customer got the safe hand-off message
        claims: list[Claim] = []
    else:
        claims = await grade(q, out["answer"], gemini_only, grader)
    out["hallucinated"] = is_hallucination(claims, high_risk)
    out["graded_claims"] = _claim_summary(claims)
    return out


async def evaluate(q: EvalQuestion, mode: Mode, high_risk: list[str],
                   gemini_only: bool = False, grader: Provider | None = None) -> dict[str, Any]:
    """One question in one mode. Raises Skip or llm.LLMError when it can't be scored."""
    record, first_draft = await answer(q, mode, gemini_only)
    return await score(q, record, first_draft, high_risk, gemini_only, grader)


# ---------------------------------------------------------------- metrics

def _rate(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def live_latencies(records: list[dict[str, Any]]) -> list[int]:
    """Times of answers that made real model calls. A cached replay takes a few ms, so it
    counts only with the time measured when that answer was last produced live (`live_ms`)."""
    return [r["ms"] if not r.get("cached") else r["live_ms"] for r in records
            if not r.get("cached") or r.get("live_ms") is not None]


def previous_live_ms(runs: list[list[dict[str, Any]]]) -> dict[tuple[str, str], int]:
    """(question id, mode) -> the latest live (uncached) time from earlier eval runs."""
    out: dict[tuple[str, str], int] = {}
    for per_question in runs:  # oldest first, so later runs win
        for r in per_question:
            if r.get("ms") is None:  # no answer; an ungraded answer still has its time
                continue
            if r.get("cached") is False:
                out[(r["id"], r["mode"])] = r["ms"]
            elif r.get("cached") and r.get("live_ms") is not None:
                out[(r["id"], r["mode"])] = r["live_ms"]
    return out


def paired_comparison(baseline: list[dict[str, Any]],
                      guarded: list[dict[str, Any]]) -> dict[str, Any]:
    """Baseline vs guarded on the questions finished in both modes only."""
    both = {r["id"] for r in baseline} & {r["id"] for r in guarded}
    b = [r for r in baseline if r["id"] in both]
    g = [r for r in guarded if r["id"] in both]
    b_rate = _rate(sum(r["hallucinated"] for r in b), len(b))
    g_rate = _rate(sum(r["hallucinated"] for r in g), len(g))
    b_p50 = analytics.percentile(live_latencies(b), 50)
    g_p50 = analytics.percentile(live_latencies(g), 50)
    return {
        "paired_n": len(both),
        "baseline_hallucination_rate_pct": b_rate,
        "guarded_hallucination_rate_pct": g_rate,
        "reduction_pts": round((b_rate or 0) - (g_rate or 0), 1) if both else None,
        "latency_cost_p50_ms": (g_p50 - b_p50) if b_p50 is not None and g_p50 is not None else None,
    }


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_mode: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        by_mode[r["mode"]].append(r)

    modes: dict[str, Any] = {}
    for mode, rs in by_mode.items():
        lat = live_latencies(rs)
        m: dict[str, Any] = {
            "n": len(rs),
            "hallucinations": sum(r["hallucinated"] for r in rs),
            "hallucination_rate_pct": _rate(sum(r["hallucinated"] for r in rs), len(rs)),
            "latency_ms": {"p50": analytics.percentile(lat, 50),
                           "p95": analytics.percentile(lat, 95), "n": len(lat)},
        }
        if mode != "baseline":
            blocked = [r for r in rs if r["first_draft_blocked"]]
            recovered = [r for r in blocked if r["status"] != "escalated" and not r["hallucinated"]]
            m |= {
                "blocked_rate_pct": _rate(len(blocked), len(rs)),
                "escalation_rate_pct": _rate(sum(r["status"] == "escalated" for r in rs), len(rs)),
                "correction_success_pct": _rate(len(recovered), len(blocked)),
            }
        if mode == "guarded":
            answerable = [r for r in rs if r["type"] == "answerable"]
            false_blocks = [r for r in answerable
                            if r["first_draft_blocked"] and not r.get("first_draft_hallucinated")]
            m["false_block_rate_pct"] = _rate(len(false_blocks), len(answerable))
        if mode == "injected":
            injected = [r for r in rs if r.get("injected_detail")]
            m["catch_rate_pct"] = _rate(sum(r["first_draft_blocked"] for r in injected),
                                        len(injected))
            m["maker_skipped_injection"] = len(rs) - len(injected)
        modes[mode] = m

    def breakdown(key: str) -> dict[str, Any]:
        out: dict[str, Any] = defaultdict(dict)
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for r in records:
            groups[(r[key], r["mode"])].append(r)
        for (value, mode), rs in groups.items():
            out[value][mode] = {"n": len(rs), "hallucination_rate_pct":
                                _rate(sum(r["hallucinated"] for r in rs), len(rs))}
        return dict(out)

    comparison: dict[str, Any] = {}
    if "baseline" in modes and "guarded" in modes:
        comparison = paired_comparison(by_mode["baseline"], by_mode["guarded"])
    return {"modes": modes, "comparison": comparison, "per_category": breakdown("category"),
            "per_type": breakdown("type"),
            "questions": len({r["id"] for r in records}),
            "models_used": dict(Counter(m for r in records for m in r.get("models", [])))}


def compare_providers(gemini_run: dict[str, Any], local_run: dict[str, Any]) -> dict[str, Any]:
    """Gemini vs the local model on the answers graded in both runs (same question, same mode)."""
    def scored(run: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
        return {(r["id"], r["mode"]): r for r in run["per_question"] if not r.get("skipped")}

    g, o = scored(gemini_run), scored(local_run)
    pairs = sorted(g.keys() & o.keys())
    local = local_run["per_question"]

    def side(run: dict[str, Any], records: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any]:
        return {"run_id": run["id"], "ts": run["ts"], "model": run["metrics"].get("model"),
                "metrics": summarize([records[p] for p in pairs])}

    return {
        "paired_answers": len(pairs),
        "paired_questions": len({i for i, _ in pairs}),
        "questions": len({r["id"] for r in local}),
        "answers": len(local),
        "waiting_for_grade": sum(bool(r.get("ungraded")) for r in local),
        "failed": sum(bool(r.get("skipped")) and not r.get("ungraded") for r in local),
        "grader": local_run["metrics"].get("grader") or "gemini",
        "gemini": side(gemini_run, g),
        "ollama": side(local_run, o),
    }


# ---------------------------------------------------------------- checkpoint (CLI runs)

STALLED_AFTER_S = 45 * 60  # one local answer can take many minutes; longer than this is a stop


def checkpoint_path(provider: str) -> Any:
    return get_settings().domain_dir / f"eval_progress_{provider}.jsonl"


def read_checkpoint(provider: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """The checkpoint a CLI run appends to: every record ever written (their live times survive
    an interrupted run) and the progress of the latest run, or None if there is no file."""
    path = checkpoint_path(provider)
    if not path.exists():
        return [], None
    records: list[dict[str, Any]] = []
    header: dict[str, Any] = {}
    done, finished = 0, False
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:  # a line cut off by a kill
            continue
        if "run_started" in row:
            header, done, finished = row, 0, False
        elif "run_finished" in row:
            finished = True
        else:
            records.append(row)
            done += 1
    age_s = time.time() - path.stat().st_mtime
    state = "finished" if finished else "running" if age_s < STALLED_AFTER_S else "stopped"
    return records, {"state": state, "done": done, "total": header.get("total"),
                     "started_at": header.get("run_started"),
                     "updated_at": analytics.minutes_ago(age_s / 60)}


# ---------------------------------------------------------------- runner

MAX_ATTEMPTS = 3
SHORT_WAIT_S = 300.0  # longer than this (a used-up daily quota) isn't worth waiting for


def retry_wait(e: Exception) -> float | None:
    """Seconds to wait before trying a question again, or None when waiting won't help
    (daily quota gone, a Gemini-only run answered locally, invalid output).

    Without this, one short moment when every model is cooling down after 503s would mark
    the rest of the run as skipped within seconds."""
    if isinstance(e, llm.LLMError):
        wait = e.retry_after_s if e.kind in ("rate_limit", "unavailable") else None
    else:  # Skip from an escalated outage carries the model layer's "Retrying in N s."
        m = re.search(r"Retrying in (\d+(?:\.\d+)?) s", str(e))
        wait = float(m.group(1)) if m else None
    if wait is None or wait > SHORT_WAIT_S:
        return None
    return max(wait, 5.0) + 2.0

def _not_scored(q: EvalQuestion, mode: Mode, answered: dict[str, Any] | None,
                error: Exception) -> dict[str, Any]:
    """The record of a question that couldn't be scored. With an answer it is only ungraded:
    the answer and its time are kept, and a rerun grades it from the cache."""
    base = answered or {"id": q.id, "type": q.type, "category": q.category, "mode": mode,
                        "question": q.question, "gold_fact_ids": q.gold_fact_ids}
    message = getattr(error, "message", None) or str(error)
    return base | {"error": message, "skipped": True} | ({"ungraded": True} if answered else {})


async def run_eval(mode: RunMode, *, limit: int | None = None,
                   question_ids: list[str] | None = None, types: list[str] | None = None,
                   gemini_only: bool = False, provider: Provider = "gemini",
                   sample: int | None = None,
                   prior_records: list[dict[str, Any]] | None = None,
                   ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Yields ("start" | "waiting" | "question" | "done", data). Stores an eval_runs row at the
    end. Each question goes through every mode before the next one starts.

    `provider` is the model family answering in this process (the caller sets LLM_PROVIDER);
    a local run is graded by Gemini. `prior_records` are checkpoint records of an interrupted
    run, used for the live time of answers that now replay from the cache."""
    ids = question_ids or (sample_ids(sample) if sample else None)
    questions = [q for q in load_questions(None, ids) if not types or q.type in types]
    questions = questions[:limit] if limit else questions
    run_modes = modes_for(mode)
    grader: Provider | None = "gemini" if provider == "ollama" else None
    high_risk = list(db.get_settings_map()["high_risk_categories"])
    total = len(questions) * len(run_modes)
    yield "start", {"mode": mode, "questions": len(questions), "total": total}
    live_ms = previous_live_ms(db.eval_run_records(provider) + [prior_records or []])
    records: list[dict[str, Any]] = []
    for q in questions:
        for m in run_modes:
            answered: tuple[dict[str, Any], str | None] | None = None
            for attempt in range(MAX_ATTEMPTS):
                try:
                    if answered is None:  # keep the first answer: a retry would replay it cached
                        answered = await answer(q, m, gemini_only)
                    rec = await score(q, *answered, high_risk, gemini_only, grader)
                    break
                except (llm.LLMError, Skip) as e:
                    wait = retry_wait(e)
                    if wait is None or attempt == MAX_ATTEMPTS - 1:
                        rec = _not_scored(q, m, answered[0] if answered else None, e)
                        break
                    yield "waiting", {"id": q.id, "mode": m, "seconds": round(wait),
                                      "attempt": attempt + 1}
                    await asyncio.sleep(wait)
            if rec.get("cached") and (q.id, m) in live_ms:
                rec["live_ms"] = live_ms[(q.id, m)]
            records.append(rec)
            yield "question", {"done": len(records), "total": total, "record": rec}
    graded = [r for r in records if not r.get("skipped")]
    skipped = [r for r in records if r.get("skipped")]
    settings = get_settings()
    metrics = summarize(graded) | {
        "skipped": len(skipped),
        "skipped_by_mode": dict(Counter(r["mode"] for r in skipped)),
        "ungraded": sum(bool(r.get("ungraded")) for r in skipped),
        "gemini_only": gemini_only,
        "provider": provider,
        "model": settings.ollama_model if provider == "ollama" else settings.gemini_model,
        "grader": grader or provider,
        "question_set": len(load_questions()),
    }
    run_id = db.insert_eval_run(mode, metrics, records)
    yield "done", {"eval_run_id": run_id, "metrics": metrics}
