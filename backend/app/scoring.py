"""Deterministic trust score: 100, -40 per contradicted, -15 per unsupported, -10 per retry."""

from typing import Any

from app.schemas import Claim

CONTRADICTED_PENALTY = 40
UNSUPPORTED_PENALTY = 15
RETRY_PENALTY = 10


def trust_score(claims: list[Claim], retries: int, status: str) -> tuple[int, dict[str, Any]]:
    """Score the final answer's claims. Returns (score, breakdown for the UI hover)."""
    contradicted = sum(c.verdict == "contradicted" for c in claims)
    unsupported = sum(c.verdict == "unsupported" for c in claims)
    escalated = status == "escalated"
    raw = 100 - CONTRADICTED_PENALTY * contradicted - UNSUPPORTED_PENALTY * unsupported \
        - RETRY_PENALTY * retries
    score = 0 if escalated else max(0, min(100, raw))
    return score, {
        "base": 100,
        "contradicted": contradicted,
        "unsupported": unsupported,
        "retries": retries,
        "penalties": {
            "contradicted": -CONTRADICTED_PENALTY * contradicted,
            "unsupported": -UNSUPPORTED_PENALTY * unsupported,
            "retries": -RETRY_PENALTY * retries,
        },
        "escalated": escalated,
    }
