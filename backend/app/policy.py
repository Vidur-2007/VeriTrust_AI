"""Strictness policy: which claims block an answer, and what happens next."""

from dataclasses import dataclass, field
from typing import Literal

from app.schemas import Claim

Action = Literal["approve", "rewrite", "fallback"]


@dataclass
class Decision:
    action: Action
    status: Literal["approved", "corrected", "escalated"] | None
    blocking: list[int] = field(default_factory=list)  # indices into claims


def effective_strictness(configured: str, input_flags: list[str]) -> str:
    """Flagged requests (prompt injection, pressure) always run strict."""
    risky = {"prompt_injection", "pressure"}
    return "strict" if risky & set(input_flags) else configured


def is_blocking(claim: Claim, strictness: str, high_risk_categories: list[str]) -> bool:
    if claim.verdict == "contradicted":
        return True
    if claim.verdict == "unsupported":
        if strictness == "strict":
            return True
        if strictness == "balanced":
            return claim.category in high_risk_categories
    return False


def decide(claims: list[Claim], *, strictness: str, high_risk_categories: list[str],
           retries: int, max_retries: int) -> Decision:
    blocking = [i for i, c in enumerate(claims)
                if is_blocking(c, strictness, high_risk_categories)]
    if not blocking:
        return Decision("approve", "corrected" if retries > 0 else "approved")
    if retries < max_retries:
        return Decision("rewrite", None, blocking)
    return Decision("fallback", "escalated", blocking)
