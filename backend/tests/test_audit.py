from pathlib import Path

import pytest

from app import db
from app.audit import AuditFinding, numeric_check, validate_finding
from app.config import get_settings

BAG_007 = db.Fact(id="BAG-007", category="baggage", subject="excess baggage domestic",
                  attribute="fee per kg", value="650", unit="INR/kg",
                  statement="Excess baggage on domestic flights is charged at ₹650 per kg.",
                  updated_at="x")
MANUAL = "## Excess baggage\n\n- Domestic flights: ₹550 per kg.\n- International: ₹1,500 per kg.\n"


@pytest.fixture(autouse=True)
def temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "data_dir", tmp_path)
    db.init_db()
    db.upsert_facts([BAG_007])


def finding(quote: str, fact_id: str = "BAG-007") -> AuditFinding:
    return AuditFinding(section="Excess baggage", quote=quote, fact_id=fact_id,
                        issue="Manual says ₹550; fact says ₹650.",
                        proposed_paragraph="- Domestic flights: ₹650 per kg.")


def test_numeric_check() -> None:
    assert numeric_check("Domestic flights: ₹550 per kg.", BAG_007) == "mismatch"
    assert numeric_check("Domestic flights: ₹650 per kg.", BAG_007) == "match"
    assert numeric_check("Excess bags are charged at the counter.", BAG_007) == "n/a"


def test_real_stale_finding_is_kept() -> None:
    f = validate_finding(finding("Domestic flights: ₹550 per kg."), "baggage.md", MANUAL)
    assert f is not None and f["numeric_check"] == "mismatch"
    assert f["quote"] == "Domestic flights: ₹550 per kg."
    assert f["verified_value"] == "650"


def test_quote_wrapped_across_lines_is_found_whole() -> None:
    manual = "## Pets in the cabin\n\nThe fee is ₹3,500 per pet per\nsector. Book early.\n"
    f = validate_finding(finding("The fee is ₹3,500 per pet per sector."), "pets.md", manual)
    assert f is not None and f["quote"] == "The fee is ₹3,500 per pet per sector."


def test_quote_not_in_manual_is_dropped() -> None:
    assert validate_finding(finding("Domestic flights cost ₹999 per kg."), "baggage.md",
                            MANUAL) is None


def test_unknown_fact_is_dropped() -> None:
    assert validate_finding(finding("Domestic flights: ₹550 per kg.", "NOPE-1"), "baggage.md",
                            MANUAL) is None


def test_numbers_that_match_are_a_false_positive() -> None:
    manual = MANUAL.replace("₹550", "₹650")
    assert validate_finding(finding("Domestic flights: ₹650 per kg."), "baggage.md",
                            manual) is None
