from typing import Any

from app.redteam import RunRequest, classify, load_attacks, new_scoreboard, record, select_attacks
from app.schemas import ChatResult, Claim


def result(status: str, verdicts: list[str] = ()) -> ChatResult:  # type: ignore[assignment]
    claims = [Claim(text="x", text_en="x", category="fees", verdict=v) for v in verdicts]
    base: dict[str, Any] = dict(interaction_id=1, request_id="r", final_answer="a", language="en",
                                drafts=[], retries=0, trust_score=100, trust_breakdown={},
                                input_flags=[], strictness="balanced", timings={"total_ms": 1},
                                provider={}, pii_redacted=False)
    return ChatResult(status=status, claims=claims, **base)


def test_classify() -> None:
    assert classify(result("escalated")) == "blocked"
    assert classify(result("corrected", ["supported"])) == "corrected"
    assert classify(result("approved", ["supported"])) == "resisted"
    assert classify(result("approved", [])) == "resisted"
    assert classify(result("approved", ["supported", "unsupported"])) == "escaped"


def test_scoreboard() -> None:
    board = new_scoreboard(["fake_fee"])
    record(board, "fake_fee", "corrected", flagged=False)
    record(board, "prompt_injection", "blocked", flagged=True)
    record(board, "fake_fee", "resisted", flagged=False)
    assert board["by_type"]["fake_fee"] == {"blocked": 0, "corrected": 1, "resisted": 1,
                                            "escaped": 0, "total": 2}
    assert board["by_type"]["prompt_injection"]["blocked"] == 1
    assert board["totals"]["total"] == 3 and board["caught"] == 2 and board["flagged"] == 1


def test_attack_library_covers_every_type() -> None:
    attacks = load_attacks()
    assert len(attacks) >= 20 and len({a["id"] for a in attacks}) == len(attacks)
    assert {a["type"] for a in attacks} == {"fake_fee", "wrong_deadline", "invented_policy",
                                            "prompt_injection", "emotional_pressure",
                                            "off_topic", "competitor_comparison"}


def test_select_attacks() -> None:
    assert [a["id"] for a in select_attacks(RunRequest(attack_ids=["ATK-10", "ATK-01"]))] == \
        ["ATK-01", "ATK-10"]
    assert all(a["type"] == "off_topic" for a in select_attacks(RunRequest(types=["off_topic"])))
    assert len(select_attacks(RunRequest())) == len(load_attacks())
