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
"""

import json
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


# ---------------------------------------------------------------- answering and grading

async def baseline_answer(q: EvalQuestion) -> tuple[str, str]:
    """The Maker alone, with the same prompt the guarded run's first draft uses."""
    language = guard.detect_language(q.question)
    question = pii.redact(q.question).text
    hits, _ = await retrieval.search("manual_chunks", question, nodes.MANUAL_K)
    chunks = [nodes.chunk_from_hit(h) for h in hits]
    prompt = prompts.maker_prompt(question=question, language=language, chunks=chunks,
                                  inject=False)
    r = await llm.generate_json_result(prompt, MakerOut, system=prompts.maker_system(language),
                                       temperature=0.3, allow_long_wait=True)
    return r.data.answer.strip(), r.model


def is_hallucination(claims: list[Claim], high_risk: list[str]) -> bool:
    return any(c.verdict == "contradicted"
               or (c.verdict == "unsupported" and c.category in high_risk) for c in claims)


async def grade(q: EvalQuestion, answer: str) -> list[Claim]:
    gold = [f for i in q.gold_fact_ids if (f := db.get_fact(i)) is not None]
    similar = [f for h in retrieval.lexical_search("facts", answer, 6)
               if (f := db.get_fact(h.id)) is not None]
    facts = list({f.id: f for f in gold + similar}.values())
    r = await llm.generate_json_result(
        prompts.judge_prompt(draft=answer, facts=[f.model_dump() for f in facts]) + GRADER_NOTE,
        JudgeOut, system=prompts.JUDGE_SYSTEM, temperature=0.0, allow_long_wait=True)
    by_id = {f.id: f for f in facts}
    claims = [nodes.enrich_claim(jc, answer, by_id, [])
              for jc in r.data.claims if jc.text.strip()]
    return rules.apply_rules(claims, by_id, q.question)


def _claim_summary(claims: list[Claim]) -> list[dict[str, Any]]:
    return [{"verdict": c.verdict, "category": c.category, "text_en": c.text_en,
             "evidence_fact_ids": c.evidence_fact_ids, "caught_by": c.caught_by}
            for c in claims]


async def evaluate(q: EvalQuestion, mode: Mode, high_risk: list[str]) -> dict[str, Any]:
    started = time.perf_counter()
    record: dict[str, Any] = {"id": q.id, "type": q.type, "category": q.category, "mode": mode,
                              "question": q.question, "gold_fact_ids": q.gold_fact_ids}
    if mode == "baseline":
        answer, model = await baseline_answer(q)
        ms = round((time.perf_counter() - started) * 1000)
        record |= {"answer": answer, "status": "unguarded", "retries": 0,
                   "first_draft_blocked": False, "ms": ms, "models": [model]}
    else:
        r = await run_chat(ChatRequest(question=q.question, channel="eval",
                                       inject=mode == "injected"), batch=True)
        record |= {
            "answer": r.final_answer, "status": r.status, "retries": r.retries,
            "trust_score": r.trust_score, "interaction_id": r.interaction_id,
            "first_draft_blocked": r.retries > 0 or r.status == "escalated",
            "injected_detail": r.drafts[0].injected_detail if r.drafts else None,
            "ms": r.timings["total_ms"], "error": r.error,
            "models": sorted({s["provider"] for s in r.timings["spans"] if s["provider"]}),
        }
        # False block check: was the blocked first draft actually fine?
        if mode == "guarded" and record["first_draft_blocked"] and r.drafts:
            first = await grade(q, r.drafts[0].text)
            record["first_draft_hallucinated"] = is_hallucination(first, high_risk)

    if record["status"] == "escalated":  # the customer got the safe hand-off message
        claims: list[Claim] = []
    else:
        claims = await grade(q, record["answer"])
    record["hallucinated"] = is_hallucination(claims, high_risk)
    record["graded_claims"] = _claim_summary(claims)
    return record


# ---------------------------------------------------------------- metrics

def _rate(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_mode: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        by_mode[r["mode"]].append(r)

    modes: dict[str, Any] = {}
    for mode, rs in by_mode.items():
        lat = [r["ms"] for r in rs]
        m: dict[str, Any] = {
            "n": len(rs),
            "hallucinations": sum(r["hallucinated"] for r in rs),
            "hallucination_rate_pct": _rate(sum(r["hallucinated"] for r in rs), len(rs)),
            "latency_ms": {"p50": analytics.percentile(lat, 50),
                           "p95": analytics.percentile(lat, 95)},
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
        b, g = modes["baseline"], modes["guarded"]
        comparison = {
            "baseline_hallucination_rate_pct": b["hallucination_rate_pct"],
            "guarded_hallucination_rate_pct": g["hallucination_rate_pct"],
            "reduction_pts": round((b["hallucination_rate_pct"] or 0)
                                   - (g["hallucination_rate_pct"] or 0), 1),
            "latency_cost_p50_ms": (g["latency_ms"]["p50"] or 0) - (b["latency_ms"]["p50"] or 0),
        }
    return {"modes": modes, "comparison": comparison, "per_category": breakdown("category"),
            "per_type": breakdown("type"),
            "questions": len({r["id"] for r in records}),
            "models_used": dict(Counter(m for r in records for m in r.get("models", [])))}


# ---------------------------------------------------------------- runner

async def run_eval(mode: RunMode, *, limit: int | None = None,
                   question_ids: list[str] | None = None
                   ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Yields ("start" | "question" | "done", data). Stores an eval_runs row at the end."""
    questions = load_questions(limit, question_ids)
    run_modes = modes_for(mode)
    high_risk = list(db.get_settings_map()["high_risk_categories"])
    total = len(questions) * len(run_modes)
    yield "start", {"mode": mode, "questions": len(questions), "total": total}
    records: list[dict[str, Any]] = []
    for m in run_modes:
        for q in questions:
            try:
                rec = await evaluate(q, m, high_risk)
            except llm.LLMError as e:
                rec = {"id": q.id, "type": q.type, "category": q.category, "mode": m,
                       "question": q.question, "error": e.message, "skipped": True}
            records.append(rec)
            yield "question", {"done": len(records), "total": total, "record": rec}
    graded = [r for r in records if not r.get("skipped")]
    metrics = summarize(graded) | {"skipped": len(records) - len(graded)}
    run_id = db.insert_eval_run(mode, metrics, records)
    yield "done", {"eval_run_id": run_id, "metrics": metrics}
