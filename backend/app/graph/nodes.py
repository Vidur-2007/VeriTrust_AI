"""Graph nodes. Each emits start/end events and records a timing span."""

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app import db, guard, llm, policy, retrieval, rules
from app.db import Fact
from app.events import bus
from app.graph import prompts
from app.graph.state import ChatState
from app.retrieval import Hit
from app.schemas import Claim, Draft, Evidence, JudgeClaim, JudgeOut, MakerOut
from app.spans import locate

log = logging.getLogger("veritrust.graph")

MANUAL_K = 4
FACTS_K = 8
MAX_JUDGE_FACTS = 24

NodeFn = Callable[[ChatState, dict[str, Any]], Awaitable[dict[str, Any]]]


def node(name: str) -> Callable[[NodeFn], Callable[[ChatState], Awaitable[dict[str, Any]]]]:
    """Wrap a node: emit start/end events and append a timing span to the state.

    The wrapped function gets `meta`, where it can set "payload" (sent with the end event),
    "provider" and "cached" (recorded on the span).
    """
    def deco(fn: NodeFn) -> Callable[[ChatState], Awaitable[dict[str, Any]]]:
        async def run(state: ChatState) -> dict[str, Any]:
            rid, attempt = state["request_id"], state.get("retries", 0)
            meta: dict[str, Any] = {"payload": {}, "provider": None, "cached": None}
            bus.emit(rid, name, "start", payload={"retry": attempt})
            start = time.perf_counter()
            try:
                update = await fn(state, meta)
            except Exception as e:
                ms = round((time.perf_counter() - start) * 1000)
                bus.emit(rid, name, "end", ms=ms, payload={"retry": attempt, "error": str(e)})
                raise
            ms = round((time.perf_counter() - start) * 1000)
            bus.emit(rid, name, "end", ms=ms, payload={"retry": attempt, **meta["payload"]})
            update["spans"] = [{
                "node": name, "attempt": attempt, "ms": ms,
                "offset_ms": round((start - state["t0"]) * 1000),
                "provider": meta["provider"], "cached": meta["cached"],
            }]
            return update

        run.__name__ = name  # no functools.wraps: LangGraph must see a one-argument node
        return run
    return deco


# ---------------------------------------------------------------- helpers

def chunk_from_hit(hit: Hit) -> dict[str, Any]:
    body = hit.document.split("\n\n", 1)[-1]  # drop the "title / ## section" prefix
    return {"id": hit.id, "section": hit.metadata.get("heading_path", hit.id), "text": body}


def _best_section(text: str, chunks: list[dict[str, Any]]) -> str | None:
    words = retrieval.tokens(text)
    best = max(chunks, key=lambda c: len(words & retrieval.tokens(c["text"])), default=None)
    if best is None or not words & retrieval.tokens(best["text"]):
        return None
    return str(best["section"])


def enrich_claim(jc: JudgeClaim, draft: str, facts: dict[str, Fact],
            chunks: list[dict[str, Any]]) -> Claim:
    ids = [i for i in dict.fromkeys(jc.evidence_fact_ids) if i in facts]
    # A verdict of supported/contradicted needs a real fact behind it; otherwise it's unsupported.
    verdict = jc.verdict if ids else "unsupported"
    correction = jc.correction if verdict == jc.verdict else "Remove this detail"
    start, end = locate(draft, jc.text)
    return Claim(
        **{**jc.model_dump(), "evidence_fact_ids": ids, "verdict": verdict,
           "correction": correction},
        span_start=start, span_end=end,
        evidence=[Evidence(fact_id=i, statement=facts[i].statement) for i in ids],
        manual_section=_best_section(f"{jc.text_en} {jc.text}", chunks),
    )


async def _facts_for(state: ChatState, draft: str) -> list[Fact]:
    """Top facts by question and by draft, deduplicated, read fresh from SQLite (the truth)."""
    q = state["question"]
    if state.get("retrieval_mode") == "lexical":
        hits = (retrieval.lexical_search("facts", q, FACTS_K)
                + retrieval.lexical_search("facts", draft, FACTS_K))
    else:
        q_hits, _ = await retrieval.search("facts", q, FACTS_K, state.get("question_vector"))
        d_hits, _ = await retrieval.search("facts", draft, FACTS_K)
        hits = q_hits + d_hits
    # On a retry keep the previous attempt's facts too, so a sentence that survives the rewrite
    # is judged against the same evidence (retrieval by the new draft can shift the top-k).
    previous = [f["id"] for f in state.get("facts_context", [])] if state.get("retries") else []
    ids = list(dict.fromkeys([*previous, *(h.id for h in hits)]))[:MAX_JUDGE_FACTS]
    return [f for i in ids if (f := db.get_fact(i)) is not None]


# ---------------------------------------------------------------- nodes

@node("guard_input")
async def guard_input(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    q = state["question"]
    flags = sorted(set(state.get("input_flags", [])) | guard.detect_flags(q))
    language = guard.detect_language(q)
    strictness = policy.effective_strictness(state["strictness"], flags)
    meta["payload"] = {"language": language, "flags": flags, "strictness": strictness}
    return {"input_flags": flags, "language": language, "strictness": strictness}


@node("retrieve_manual")
async def retrieve_manual(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    vector = await retrieval.embed_query(state["question"])
    hits, mode = await retrieval.search("manual_chunks", state["question"], MANUAL_K, vector)
    chunks = [chunk_from_hit(h) for h in hits]
    meta["payload"] = {"mode": mode,
                       "chunks": [{"id": c["id"], "section": c["section"]} for c in chunks]}
    return {"manual_context": chunks, "question_vector": vector, "retrieval_mode": mode}


@node("maker")
async def maker(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    retry = state.get("retries", 0)
    inject = bool(state.get("inject_hallucination")) and retry == 0
    prompt = prompts.maker_prompt(
        question=state["question"], language=state["language"],
        chunks=state.get("manual_context", []), inject=inject,
        previous_draft=state.get("draft") if retry else None,
        feedback=state.get("feedback") if retry else None,
        facts=state.get("facts_context") if retry else None,
    )
    r = await llm.generate_json_result(prompt, MakerOut, system=prompts.maker_system(
        state["language"]), temperature=0.3, allow_long_wait=bool(state.get("batch")))
    draft = r.data.answer.strip()
    meta.update(provider=r.provider, cached=r.cached, payload={"draft": draft})
    update: dict[str, Any] = {"draft": draft}
    if retry == 0:
        update["injected_detail"] = r.data.injected_detail if inject else None
    return update


@node("judge")
async def judge(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    draft = state["draft"]
    facts = await _facts_for(state, draft)
    facts_dump = [f.model_dump() for f in facts]
    r = await llm.generate_json_result(
        prompts.judge_prompt(draft=draft, facts=facts_dump), JudgeOut,
        system=prompts.JUDGE_SYSTEM, temperature=0.0, allow_long_wait=bool(state.get("batch")),
    )
    by_id = {f.id: f for f in facts}
    claims = [enrich_claim(jc, draft, by_id, state.get("manual_context", []))
              for jc in r.data.claims if jc.text.strip()]
    dumps = [c.model_dump() for c in claims]
    meta.update(provider=r.provider, cached=r.cached,
                payload={"claims": dumps, "fact_ids": [f.id for f in facts]})
    return {"claims": dumps, "facts_context": facts_dump}


@node("rule_check")
async def rule_check(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    retry = state.get("retries", 0)
    facts = {f["id"]: Fact(**f) for f in state.get("facts_context", [])}
    checked = rules.apply_rules([Claim(**c) for c in state.get("claims", [])], facts,
                                state["question"])
    dumps = [c.model_dump() for c in checked]
    draft = Draft(retry=retry, text=state["draft"], claims=checked,
                  injected_detail=state.get("injected_detail") if retry == 0 else None)
    meta["payload"] = {"flipped": sum(c.caught_by == "rules" for c in checked), "claims": dumps}
    return {"claims": dumps, "drafts": [draft.model_dump()]}


@node("decide")
async def decide(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    retry = state.get("retries", 0)
    claims = [Claim(**c) for c in state.get("claims", [])]
    d = policy.decide(claims, strictness=state["strictness"],
                      high_risk_categories=state["high_risk_categories"],
                      retries=retry, max_retries=state["max_retries"])
    meta["payload"] = {"action": d.action, "status": d.status,
                       "blocking": [claims[i].text_en for i in d.blocking]}
    update: dict[str, Any] = {"next": d.action}
    if d.action == "approve":
        update |= {"status": d.status, "final_answer": state["draft"]}
    elif d.action == "rewrite":
        update |= {"retries": retry + 1,
                   "feedback": [claims[i].model_dump() for i in d.blocking]}
    return update


@node("fallback")
async def fallback(state: ChatState, meta: dict[str, Any]) -> dict[str, Any]:
    message = prompts.FALLBACK_MESSAGES[state.get("language", "en")]
    meta["payload"] = {"message": message}
    return {"status": "escalated", "final_answer": message}
