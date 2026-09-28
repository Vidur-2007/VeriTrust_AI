from app.schemas import Claim
from app.scoring import trust_score


def c(verdict: str) -> Claim:
    return Claim(text="x", text_en="x", category="fees", verdict=verdict)


def test_clean_answer_scores_100() -> None:
    score, b = trust_score([c("supported"), c("supported")], 0, "approved")
    assert score == 100
    assert b["contradicted"] == b["unsupported"] == b["retries"] == 0


def test_penalties() -> None:
    score, b = trust_score([c("contradicted"), c("unsupported"), c("supported")], 1, "approved")
    assert score == 100 - 40 - 15 - 10
    assert b["penalties"] == {"contradicted": -40, "unsupported": -15, "retries": -10}


def test_corrected_answer_loses_retry_points_only() -> None:
    assert trust_score([c("supported")], 1, "corrected")[0] == 90


def test_clamped_at_zero() -> None:
    assert trust_score([c("contradicted")] * 4, 2, "approved")[0] == 0


def test_escalated_is_zero() -> None:
    score, b = trust_score([c("supported")], 0, "escalated")
    assert score == 0 and b["escalated"] is True


def test_no_claims() -> None:
    assert trust_score([], 0, "approved")[0] == 100
