import asyncio
from pathlib import Path

import pytest

from app import db, facts_service
from app.config import get_settings
from app.facts_service import FactError, FactUpdate, NewFact, substitute_value


@pytest.mark.parametrize("statement,old,new,expected", [
    ("Excess baggage is ₹650 per kg.", "650", "700", "Excess baggage is ₹700 per kg."),
    ("It costs ₹3,000 per passenger.", "3000", "3500", "It costs ₹3,500 per passenger."),
    ("Up to 7 kg including its carrier.", "7", "8", "Up to 8 kg including its carrier."),
    ("Valid for 12 months; 120 days max.", "12", "18", "Valid for 18 months; 120 days max."),
    ("Pets are allowed on domestic flights only.", "domestic only", "all", None),
    ("Aged 5 to 11 travelling alone.", "5-11", "5-12", None),
    ("Fee is ₹650.", "650", "650.5", "Fee is ₹650.5."),
])
def test_substitute_value(statement: str, old: str, new: str, expected: str | None) -> None:
    assert substitute_value(statement, old, new) == expected


@pytest.fixture
def temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    monkeypatch.setattr(get_settings(), "data_dir", tmp_path)
    db.init_db()
    db.upsert_facts([db.Fact(id="BAG-007", category="baggage", subject="excess baggage domestic",
                             attribute="fee per kg", value="650", unit="INR/kg",
                             statement="Excess baggage on domestic flights is charged at ₹650 per kg.",
                             updated_at="2026-07-01T00:00:00Z")])
    embedded: list[str] = []

    async def reembed(fact: db.Fact) -> bool:
        embedded.append(fact.statement)
        return True

    monkeypatch.setattr(facts_service, "reembed", reembed)
    return embedded


def test_value_edit_rewrites_statement_and_logs_drift(temp_db: list[str]) -> None:
    r = asyncio.run(facts_service.update_fact("BAG-007", FactUpdate(value="700"), "edit"))
    assert r["fact"]["statement"] == "Excess baggage on domestic flights is charged at ₹700 per kg."
    assert r["drift_event"]["old_value"] == "650" and r["drift_event"]["new_value"] == "700"
    assert r["drift_event"]["source"] == "edit" and r["reembedded"]
    assert temp_db == [r["fact"]["statement"]]
    assert db.get_fact("BAG-007").value == "700"
    assert r["fact"]["updated_at"] > "2026-07-01"


def test_value_not_in_statement_needs_new_statement(temp_db: list[str]) -> None:
    db.upsert_facts([db.Fact(id="PET-001", category="pets", subject="pets in cabin",
                             attribute="routes", value="domestic only", unit=None,
                             statement="Pets are allowed in the cabin on domestic flights only.",
                             updated_at="x")])
    with pytest.raises(FactError) as e:
        asyncio.run(facts_service.update_fact("PET-001", FactUpdate(value="all flights"), "edit"))
    assert e.value.status == 422
    r = asyncio.run(facts_service.update_fact("PET-001", FactUpdate(
        value="all flights", statement="Pets are allowed in the cabin on all flights."), "edit"))
    assert r["fact"]["statement"] == "Pets are allowed in the cabin on all flights."


def test_unknown_fact_is_404(temp_db: list[str]) -> None:
    with pytest.raises(FactError) as e:
        asyncio.run(facts_service.update_fact("NOPE-1", FactUpdate(value="1"), "edit"))
    assert e.value.status == 404


def test_no_change_writes_nothing(temp_db: list[str]) -> None:
    r = asyncio.run(facts_service.update_fact("BAG-007", FactUpdate(value="650"), "edit"))
    assert r["drift_event"] is None and db.list_drift_events() == [] and temp_db == []


def test_update_requires_a_field() -> None:
    with pytest.raises(ValueError):
        FactUpdate()


def test_create_fact_gets_next_id(temp_db: list[str]) -> None:
    r = asyncio.run(facts_service.save_fact(NewFact(
        category="baggage", subject="pram", attribute="fee", value="0", unit="INR",
        statement="Prams are carried free of charge."), "review"))
    assert r["fact"]["id"] == "BAG-008"
    assert r["drift_event"]["old_value"] is None and r["drift_event"]["source"] == "review"


def test_save_existing_fact_updates_it(temp_db: list[str]) -> None:
    r = asyncio.run(facts_service.save_fact(NewFact(
        id="BAG-007", category="baggage", subject="excess baggage domestic", attribute="fee per kg",
        value="675", unit="INR/kg", statement="Excess baggage on domestic flights is ₹675 per kg."),
        "review"))
    assert r["drift_event"]["old_value"] == "650" and r["drift_event"]["source"] == "review"
