"""run_chat(): redact, run the graph, score, log, and return the result. Never raises for LLM
failures: the customer gets the safe hand-off message and the case is escalated."""

import logging
import sqlite3
import time
import uuid
from typing import Any

from app import db, llm, pii, scoring
from app.events import bus
from app.graph.build import GRAPH
from app.graph.prompts import FALLBACK_MESSAGES
from app.graph.state import ChatState
from app.schemas import ChatRequest, ChatResult, Draft
from app.spans import locate

log = logging.getLogger("veritrust.chat")

RECURSION_LIMIT = 60


def _redact_draft(d: Draft) -> Draft:
    """Belt and braces: the Maker only sees a redacted question, but re-check its output.
    If redaction changes the text, recompute claim spans against the new text."""
    r = pii.redact(d.text)
    if not r.redacted:
        return d
    claims = []
    for c in d.claims:
        text = pii.redact(c.text).text
        start, end = locate(r.text, text)
        claims.append(c.model_copy(update={"text": text, "span_start": start, "span_end": end}))
    return d.model_copy(update={"text": r.text, "claims": claims})


def _timings(spans: list[dict[str, Any]], total_ms: int) -> dict[str, Any]:
    nodes: dict[str, int] = {}
    for s in spans:
        nodes[s["node"]] = nodes.get(s["node"], 0) + s["ms"]
    return {"total_ms": total_ms, "nodes": nodes, "spans": spans}


def _initial_state(req: ChatRequest, rid: str, question: str, redacted: bool) -> ChatState:
    settings = db.get_settings_map()
    return {
        "request_id": rid,
        "question": question,
        "channel": req.channel,
        "inject_hallucination": req.inject,
        "attack_id": req.attack_id,
        "t0": time.perf_counter(),
        "strictness": settings["strictness"],
        "max_retries": int(settings["max_retries"]),
        "high_risk_categories": list(settings["high_risk_categories"]),
        "input_flags": ["pii_redacted"] if redacted else [],
        "language": "en",
        "retries": 0,
        "drafts": [],
        "spans": [],
    }


async def run_chat(req: ChatRequest, request_id: str | None = None) -> ChatResult:
    rid = request_id or uuid.uuid4().hex
    red = pii.redact(req.question)  # the raw question never reaches the LLM or the log
    state: dict[str, Any] = dict(_initial_state(req, rid, red.text, red.redacted))
    t0 = state["t0"]
    error: dict[str, Any] | None = None

    try:
        async for snapshot in GRAPH.astream(state, {"recursion_limit": RECURSION_LIMIT},
                                            stream_mode="values"):
            state = snapshot
    except llm.LLMError as e:
        log.warning("Chat %s escalated after LLM failure: %s", rid, e.message)
        error = {"kind": e.kind, "message": e.message, "provider": e.provider}
        message = FALLBACK_MESSAGES[state.get("language", "en")]
        state = {**state, "status": "escalated", "final_answer": message}
        bus.emit(rid, "fallback", "start")
        bus.emit(rid, "fallback", "end", ms=0, payload={"message": message, "error": error})

    total_ms = round((time.perf_counter() - t0) * 1000)
    drafts = [_redact_draft(Draft(**d)) for d in state.get("drafts", [])]
    claims = drafts[-1].claims if drafts else []  # the claims of the last draft checked
    status = state.get("status", "escalated")
    retries = state.get("retries", 0)
    score, breakdown = scoring.trust_score(claims, retries, status)
    final_answer = pii.redact(state.get("final_answer", "")).text
    timings = _timings(state.get("spans", []), total_ms)
    flags = state.get("input_flags", [])
    language = state.get("language", "en")

    row = {
        "channel": req.channel, "question": red.text, "language": language,
        "injected": int(req.inject), "attack_id": req.attack_id, "input_flags": flags,
        "drafts": [d.model_dump() for d in drafts], "final_answer": final_answer,
        "status": status, "claims": [c.model_dump() for c in claims], "trust_score": score,
        "retries": retries, "timings": timings,
        "review_status": "pending" if status == "escalated" else "none",
    }
    try:
        interaction_id: int | None = db.insert_interaction(row)
    except sqlite3.Error:
        log.exception("Could not log interaction %s", rid)
        interaction_id = None

    st = llm.provider_status()
    return ChatResult(
        interaction_id=interaction_id, request_id=rid, status=status, final_answer=final_answer,
        language=language, claims=claims, drafts=drafts, retries=retries, trust_score=score,
        trust_breakdown=breakdown, input_flags=flags, strictness=state["strictness"],
        timings=timings,
        provider={k: st[k] for k in ("active", "active_model", "running_locally",
                                     "fallback_reason", "rate_limited_recently")},
        pii_redacted=red.redacted, error=error,
    )
