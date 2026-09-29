"""Pydantic models for LLM I/O and the chat API."""

from typing import Any, Literal

from pydantic import BaseModel, Field

Language = Literal["en", "hi", "te"]
Verdict = Literal["supported", "contradicted", "unsupported"]
FactCategory = Literal["baggage", "fees", "refunds", "cancellations", "check_in", "loyalty",
                       "special_assistance", "pets"]
Category = Literal[FactCategory, "other"]  # claims can be about anything
Channel = Literal["console", "site", "redteam", "eval"]
Status = Literal["approved", "corrected", "escalated"]
Strictness = Literal["strict", "balanced", "lenient"]


# ---------------------------------------------------------------- LLM structured outputs

class MakerOut(BaseModel):
    language: Language
    answer: str
    injected_detail: str | None = None


class JudgeClaim(BaseModel):
    text: str
    text_en: str
    category: Category
    verdict: Verdict
    evidence_fact_ids: list[str] = Field(default_factory=list)
    correction: str | None = None


class JudgeOut(BaseModel):
    claims: list[JudgeClaim] = Field(default_factory=list)


# ---------------------------------------------------------------- claims and drafts

class Evidence(BaseModel):
    fact_id: str
    statement: str


class Claim(JudgeClaim):
    """A Judge claim enriched by the server: spans, evidence text, and who caught it."""

    span_start: int | None = None
    span_end: int | None = None
    caught_by: Literal["judge", "rules"] | None = None
    rule_note: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    manual_section: str | None = None


class Draft(BaseModel):
    retry: int
    text: str
    claims: list[Claim] = Field(default_factory=list)
    injected_detail: str | None = None


# ---------------------------------------------------------------- API

class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    channel: Channel = "console"
    inject: bool = False
    attack_id: str | None = None


class ChatResult(BaseModel):
    interaction_id: int | None
    request_id: str
    status: Status
    final_answer: str
    language: Language
    claims: list[Claim]
    drafts: list[Draft]
    retries: int
    trust_score: int
    trust_breakdown: dict[str, Any]
    input_flags: list[str]
    strictness: Strictness
    timings: dict[str, Any]
    provider: dict[str, Any]
    pii_redacted: bool
    error: dict[str, Any] | None = None
