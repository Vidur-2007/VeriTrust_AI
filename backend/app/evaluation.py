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
"""

import asyncio
import json
import re
import time
from collections import Counter, defaultdict
from collections.abc import AsyncIterator
from typing import Any, Literal

from pydantic import BaseModel, Field

from app import analytics, db, guard, llm, pii, retrieval, rules
from app.config import DATA_SOURCE_DIR
from app.graph import nodes, prompts
from app.graph.run import run_chat
from app.schemas import ChatRequest, Claim, JudgeOut, MakerOut

Mode = Literal["baseline", "guarded", "injected"]
RunMode = Literal["baseline", "guarded", "injected", "all"]
MODES: tuple[Mode, ...] = ("baseline", "guarded", "injected")
QUESTIONS_FILE = DATA_SOURCE_DIR / "eval" / "questions.jsonl"
GRADER_NOTE = "\n\n(Evaluation grading pass.)"  # keeps grader calls apart in the LLM cache


class EvalQuestion(BaseModel):
    id: str
    type: Literal["answerable", "stale_trap", "adversarial", "out_of_scope"]
    category: str
    question: str
    gold_fact_ids: list[str] = Field(default_factory=list)
    language: str = "en"


def load_questions(limit: int | None = None, ids: list[str] | None = None) -> list[EvalQuestion]:
    lines = QUESTIONS_FILE.read_text(encoding="utf-8").splitlines()
    qs = [EvalQuestion(**json.loads(ln)) for ln in lines if ln.strip()]
    if ids:
        qs = [q for q in qs if q.id in set(ids)]
    return qs[:limit] if limit else qs


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


async def grade(q: EvalQuestion, answer: str, gemini_only: bool = False) -> list[Claim]:
    facts = grading_facts(q, answer)
    r = await llm.generate_json_result(
        prompts.judge_prompt(draft=answer, facts=[f.model_dump() for f in facts]) + GRADER_NOTE,
        JudgeOut, system=prompts.JUDGE_SYSTEM, temperature=0.0, allow_long_wait=True)
    require_gemini({r.provider}, gemini_only, "The grade")
    by_id = {f.id: f for f in facts}
    claims = [nodes.enrich_claim(jc, answer, by_id, [])
              for jc in r.data.claims if jc.text.strip()]
    return rules.apply_rules(claims, by_id, q.question)


def _claim_summary(claims: list[Claim]) -> list[dict[str, Any]]:
    return [{"verdict": c.verdict, "category": c.category, "text_en": c.text_en,
             "evidence_fact_ids": c.evidence_fact_ids, "caught_by": c.caught_by}
            for c in claims]


async def evaluate(q: EvalQuestion, mode: Mode, high_risk: list[str],
                   gemini_only: bool = False) -> dict[str, Any]:
    """One question in one mode. Raises Skip or llm.LLMError when it can't be scored."""
    started = time.perf_counter()
    record: dict[str, Any] = {"id": q.id, "type": q.type, "category": q.category, "mode": mode,
                              "question": q.question, "gold_fact_ids": q.gold_fact_ids}
    if mode == "baseline":
        answer, provider, cached = await baseline_answer(q, gemini_only)
        ms = round((time.perf_counter() - started) * 1000)
        record |= {"answer": answer, "status": "unguarded", "retries": 0,
                   "first_draft_blocked": False, "ms": ms, "models": [provider],
                   "cached": cached}
    else:
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
        # False block check: was the blocked first draft actually fine?
        if mode == "guarded" and record["first_draft_blocked"] and r.drafts:
            first = await grade(q, r.drafts[0].text, gemini_only)
            record["first_draft_hallucinated"] = is_hallucination(first, high_risk)

    if record["status"] == "escalated":  # the customer got the safe hand-off message
        claims: list[Claim] = []
    else:
        claims = await grade(q, record["answer"], gemini_only)
    record["hallucinated"] = is_hallucination(claims, high_risk)
    record["graded_claims"] = _claim_summary(claims)
    return record


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
            if r.get("skipped") or r.get("ms") is None:
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

async def run_eval(mode: RunMode, *, limit: int | None = None,
                   question_ids: list[str] | None = None, types: list[str] | None = None,
                   gemini_only: bool = False) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Yields ("start" | "question" | "done", data). Stores an eval_runs row at the end.
    Each question goes through every mode before the next one starts."""
    questions = [q for q in load_questions(None, question_ids) if not types or q.type in types]
    questions = questions[:limit] if limit else questions
    run_modes = modes_for(mode)
    high_risk = list(db.get_settings_map()["high_risk_categories"])
    total = len(questions) * len(run_modes)
    yield "start", {"mode": mode, "questions": len(questions), "total": total}
    live_ms = previous_live_ms(db.eval_run_records())
    records: list[dict[str, Any]] = []
    for q in questions:
        for m in run_modes:
            for attempt in range(MAX_ATTEMPTS):
                try:
                    rec = await evaluate(q, m, high_risk, gemini_only)
                    break
                except (llm.LLMError, Skip) as e:
                    wait = retry_wait(e)
                    if wait is None or attempt == MAX_ATTEMPTS - 1:
                        rec = {"id": q.id, "type": q.type, "category": q.category, "mode": m,
                               "question": q.question, "gold_fact_ids": q.gold_fact_ids,
                               "error": getattr(e, "message", None) or str(e), "skipped": True}
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
    metrics = summarize(graded) | {
        "skipped": len(skipped),
        "skipped_by_mode": dict(Counter(r["mode"] for r in skipped)),
        "gemini_only": gemini_only,
        "question_set": len(load_questions()),
    }
    run_id = db.insert_eval_run(mode, metrics, records)
    yield "done", {"eval_run_id": run_id, "metrics": metrics}
