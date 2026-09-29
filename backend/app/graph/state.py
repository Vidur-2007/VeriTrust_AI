"""LangGraph state. Plain JSON-friendly values so the state can be logged as-is."""

import operator
from typing import Annotated, Any, TypedDict


class ChatState(TypedDict, total=False):
    # request
    request_id: str
    question: str  # already PII-redacted; the raw question never enters the graph
    channel: str
    inject_hallucination: bool
    attack_id: str | None
    batch: bool  # red team / eval: wait out rate limits instead of falling back
    t0: float  # perf_counter at request start, for span offsets

    # policy (read from settings once per request)
    strictness: str  # effective: forced to strict when input is flagged
    max_retries: int
    high_risk_categories: list[str]

    # guard_input
    input_flags: list[str]
    language: str

    # retrieval
    manual_context: list[dict[str, Any]]  # [{id, section, text}]
    question_vector: list[float] | None
    retrieval_mode: str
    facts_context: list[dict[str, Any]]  # Fact dumps shown to the Judge

    # maker / judge loop
    draft: str
    injected_detail: str | None
    claims: list[dict[str, Any]]  # current draft's claims (Claim dumps)
    drafts: Annotated[list[dict[str, Any]], operator.add]  # Draft dumps, appended per attempt
    retries: int
    feedback: list[dict[str, Any]]  # blocking claims handed to the next Maker attempt
    next: str  # decide's routing: approve | rewrite | fallback

    # outcome
    status: str
    final_answer: str
    spans: Annotated[list[dict[str, Any]], operator.add]  # per-node timing, appended
