import pytest

from app.db import Fact
from app.rules import apply_rules, check_claim, extract_quantities, numbers_in
from app.schemas import Claim

FACTS = {f.id: f for f in [
    Fact(id="BAG-007", category="baggage", subject="excess baggage domestic",
         attribute="fee per kg", value="650", unit="INR/kg",
         statement="Excess baggage on domestic flights is charged at ₹650 per kg at the airport.",
         updated_at="x"),
    Fact(id="BAG-004", category="baggage", subject="checked baggage domestic Saver fare",
         attribute="free allowance", value="15", unit="kg",
         statement="Domestic Saver fares include a free checked baggage allowance of 15 kg per passenger.",
         updated_at="x"),
    Fact(id="CAN-001", category="cancellations", subject="domestic cancellation",
         attribute="fee", value="3500", unit="INR",
         statement="Cancelling a domestic booking more than 72 hours before departure costs ₹3,500 per passenger per sector.",
         updated_at="x"),
    Fact(id="CAN-003", category="cancellations", subject="cutoff", attribute="latest time",
         value="2", unit="hours",
         statement="Domestic bookings can be cancelled up to 2 hours before departure.",
         updated_at="x"),
    Fact(id="PET-001", category="pets", subject="pets in cabin", attribute="routes",
         value="domestic only", unit=None,
         statement="Pets are allowed in the cabin on domestic flights only.", updated_at="x"),
    Fact(id="REF-001", category="refunds", subject="refund", attribute="processing time",
         value="7", unit="working days",
         statement="Refunds to cards and UPI are processed within 7 working days of the cancellation.",
         updated_at="x"),
]}


def claim(text_en: str, ids: list[str], verdict: str = "supported", text: str | None = None) -> Claim:
    return Claim(text=text or text_en, text_en=text_en, category="baggage", verdict=verdict,
                 evidence_fact_ids=ids)


@pytest.mark.parametrize("text,expected", [
    ("costs ₹3,000 per sector", [(3000.0, "currency")]),
    ("Rs. 650 per kg", [(650.0, "currency")]),
    ("INR 650", [(650.0, "currency")]),
    ("within 48 hours", [(48.0, "hours")]),
    ("7 working days", [(7.0, "days")]),
    ("a 25% bonus", [(25.0, "percent")]),
    ("15 kg allowance", [(15.0, "kg")]),
    ("₹४,५००", [(4500.0, "currency")]),     # Devanagari digits
    ("₹౪,౫౦౦", [(4500.0, "currency")]),     # Telugu digits
    ("up to 3 minimum", []),                # "min" inside a word is not a unit
])
def test_extract_quantities(text: str, expected: list[tuple[float, str]]) -> None:
    assert sorted((q.value, q.unit_class) for q in extract_quantities(text)) == sorted(expected)


def test_stale_value_flips_with_rules() -> None:
    [c] = apply_rules([claim("Excess baggage costs ₹550 per kg", ["BAG-007"])], FACTS, "")
    assert c.verdict == "contradicted"
    assert c.caught_by == "rules"
    assert "₹550" in c.rule_note and "BAG-007" in c.rule_note


def test_correct_value_passes() -> None:
    [c] = apply_rules([claim("Excess baggage costs ₹650 per kg", ["BAG-007"])], FACTS, "")
    assert (c.verdict, c.caught_by) == ("supported", "judge")


def test_derived_total_passes() -> None:
    c = claim("For 3 extra kg you will pay ₹1,950 at ₹650 per kg", ["BAG-007"])
    assert check_claim(c, FACTS, "I'm 3 kg over") is None


def test_number_from_question_passes() -> None:
    c = claim("Your 18 kg bag is over the 15 kg allowance", ["BAG-004"])
    assert check_claim(c, FACTS, "My bag weighs 18 kg") is None


def test_number_in_fact_statement_passes() -> None:
    # 72 hours only appears in CAN-001's statement; CAN-003 (2 hours) is also cited.
    c = claim("Cancelling more than 72 hours before departure costs ₹3,500",
              ["CAN-001", "CAN-003"])
    assert check_claim(c, FACTS, "") is None


def test_other_unit_class_is_skipped() -> None:
    c = claim("Pets are allowed in cabin for 3 hours flights", ["BAG-007"])  # hours vs currency
    assert check_claim(c, FACTS, "") is None


def test_non_numeric_fact_is_skipped() -> None:
    c = claim("Pets up to 10 kg fly in the cabin", ["PET-001"])
    assert check_claim(c, FACTS, "") is None


def test_wrong_days_flips() -> None:
    [c] = apply_rules([claim("Refunds take 14 working days", ["REF-001"])], FACTS, "")
    assert c.verdict == "contradicted"


def test_non_supported_claims_are_untouched() -> None:
    claims = [claim("Excess is ₹550 per kg", ["BAG-007"], verdict="contradicted"),
              claim("Birthday upgrades are free", [], verdict="unsupported")]
    out = apply_rules(claims, FACTS, "")
    assert [c.verdict for c in out] == ["contradicted", "unsupported"]
    assert all(c.caught_by == "judge" for c in out)


def test_unknown_evidence_ids_are_ignored() -> None:
    assert check_claim(claim("costs ₹1", ["NOPE-1"]), FACTS, "") is None


def test_numbers_in_handles_commas() -> None:
    assert numbers_in("₹10,000 and 2.5") == {10000.0, 2.5}
