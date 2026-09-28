import pytest

from app.policy import decide, effective_strictness
from app.schemas import Claim

HIGH_RISK = ["fees", "refunds", "baggage"]


def c(verdict: str, category: str = "fees") -> Claim:
    return Claim(text="x", text_en="x", category=category, verdict=verdict)


def run(claims: list[Claim], strictness: str, retries: int = 0, max_retries: int = 2):
    return decide(claims, strictness=strictness, high_risk_categories=HIGH_RISK,
                  retries=retries, max_retries=max_retries)


@pytest.mark.parametrize("strictness,claim,blocks", [
    ("strict", c("contradicted"), True),
    ("strict", c("unsupported", "loyalty"), True),
    ("balanced", c("contradicted", "loyalty"), True),
    ("balanced", c("unsupported", "fees"), True),        # high-risk category
    ("balanced", c("unsupported", "loyalty"), False),    # low-risk category
    ("lenient", c("contradicted"), True),
    ("lenient", c("unsupported", "fees"), False),
    ("strict", c("supported"), False),
])
def test_policy_matrix(strictness: str, claim: Claim, blocks: bool) -> None:
    d = run([claim], strictness)
    assert (d.action == "rewrite") is blocks
    assert d.blocking == ([0] if blocks else [])


def test_approved_first_try() -> None:
    d = run([c("supported")], "strict")
    assert (d.action, d.status) == ("approve", "approved")


def test_corrected_after_retry() -> None:
    d = run([c("supported")], "strict", retries=1)
    assert (d.action, d.status) == ("approve", "corrected")


def test_fallback_when_retries_exhausted() -> None:
    d = run([c("contradicted")], "balanced", retries=2, max_retries=2)
    assert (d.action, d.status) == ("fallback", "escalated")


def test_max_retries_zero_escalates_immediately() -> None:
    assert run([c("contradicted")], "balanced", max_retries=0).action == "fallback"


def test_no_claims_is_approved() -> None:
    assert run([], "strict").status == "approved"


def test_blocking_indices() -> None:
    d = run([c("supported"), c("contradicted"), c("unsupported", "pets")], "balanced")
    assert d.blocking == [1]


@pytest.mark.parametrize("flags,expected", [
    ([], "lenient"),
    (["pii_redacted"], "lenient"),
    (["prompt_injection"], "strict"),
    (["pressure"], "strict"),
])
def test_flagged_input_forces_strict(flags: list[str], expected: str) -> None:
    assert effective_strictness("lenient", flags) == expected
