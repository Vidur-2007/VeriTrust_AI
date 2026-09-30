"""Domain packs (FEATURES #25): pack data is consistent, and switching swaps data, not logic."""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException

from app import config, db, domains
from app.config import get_settings
from app.graph import prompts

BANK = domains.BANK


@pytest.fixture
def pack(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Any:
    """Run as a given pack against an empty data dir (nothing touches backend/var)."""
    monkeypatch.delenv("VERITRUST_DOMAIN", raising=False)
    monkeypatch.setattr(get_settings(), "data_dir", tmp_path)
    monkeypatch.setattr(config, "_active_domain", "airline")

    def use(domain_id: str) -> None:
        monkeypatch.setattr(config, "_active_domain", domain_id)
    return use


def bank_facts() -> list[dict[str, Any]]:
    return json.loads(BANK.facts_file.read_text(encoding="utf-8"))


def test_bank_pack_data_is_consistent() -> None:
    facts = bank_facts()
    ids = {f["id"] for f in facts}
    assert len(ids) == len(facts) >= 40
    for f in facts:
        assert f["category"] in BANK.categories, f["id"]
        assert f["id"].startswith(BANK.prefixes[f["category"]] + "-"), f["id"]
    questions = [json.loads(ln) for ln in BANK.questions_file.read_text("utf-8").splitlines() if ln]
    attacks = json.loads(BANK.attacks_file.read_text(encoding="utf-8"))
    assert len(questions) == 20 and len(attacks) == 10
    assert all(set(q["gold_fact_ids"]) <= ids for q in questions)
    assert all(set(a["target_fact_ids"]) <= ids for a in attacks)
    assert {q["type"] for q in questions} == {"answerable", "stale_trap", "adversarial", "out_of_scope"}
    assert set(BANK.examples()) >= {"en", "hi", "te", "inject"}
    assert set(BANK.high_risk) <= set(BANK.categories)


@pytest.mark.parametrize("fact_id, manual, verified, stale", [
    ("ACC-003", "accounts_and_fees.md", "₹300 per quarter", "₹200 per quarter"),
    ("CRD-001", "cards.md", "withdrawal limit: ₹40,000", "withdrawal limit: ₹50,000"),
    ("LON-001", "loans.md", "8.90%", "8.40%"),
])
def test_bank_manuals_have_the_three_planted_stale_values(fact_id: str, manual: str,
                                                          verified: str, stale: str) -> None:
    text = (BANK.manuals_dir / manual).read_text(encoding="utf-8")
    fact = next(f for f in bank_facts() if f["id"] == fact_id)
    assert stale in text and verified not in text
    assert fact["updated_at"].startswith("2026-09")  # changed after the manuals were written
    assert fact_id in (BANK.source_dir / "STALE.md").read_text(encoding="utf-8")


def test_each_pack_has_its_own_storage_and_prompts(pack: Any, tmp_path: Path) -> None:
    s = get_settings()
    assert s.db_path == tmp_path / "veritrust.sqlite3"  # the airline stays where it always was
    assert "Charminar Airways" in prompts.maker_system("en") and "baggage" in prompts.judge_system()
    assert domains.active().judge_schema.__name__ == "JudgeOut"

    pack("bank")
    assert s.db_path == tmp_path / "packs" / "bank" / "veritrust.sqlite3"
    assert s.cache_dir == tmp_path / "cache"  # the LLM cache is shared
    assert "Golconda Bank" in prompts.maker_system("hi") and "Charminar" not in prompts.judge_system()
    assert "accounts, cards, loans, kyc, transfers, other" in prompts.judge_system()
    assert domains.active().judge_schema.__name__ == "BankJudgeOut"
    assert domains.active().manuals_dir.name == "manuals" and len(list(BANK.manuals_dir.glob("*.md"))) == 4


def test_script_override_wins_over_the_saved_choice(pack: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    config.set_active_domain("bank")
    assert config.active_domain() == "bank" and config._domain_file().read_text() == "bank"
    monkeypatch.setenv("VERITRUST_DOMAIN", "airline")
    assert domains.active().id == "airline"


def test_categories_follow_the_active_pack(pack: Any) -> None:
    from pydantic import ValidationError

    from app.facts_service import NewFact
    from app.routers.settings import SettingsUpdate

    pack("bank")
    db.init_db()
    assert db.get_settings_map()["high_risk_categories"] == ["accounts", "cards", "loans"]
    fact = db.Fact(id="KYC-001", category="kyc", subject="s", attribute="a", value="1",
                   statement="x", updated_at="2026-01-01T00:00:00Z")
    assert db.upsert_facts([fact]) == 1  # a bank category passes the table's CHECK
    NewFact(category="loans", subject="s", attribute="a", value="1", statement="x")
    SettingsUpdate(high_risk_categories=["kyc"])
    with pytest.raises(ValidationError):
        NewFact(category="baggage", subject="s", attribute="a", value="1", statement="x")
    with pytest.raises(ValidationError):
        SettingsUpdate(high_risk_categories=["baggage"])

    pack("airline")
    db.init_db()
    assert db.list_facts() == []  # the bank's fact is in the bank's database
    assert db.get_settings_map()["high_risk_categories"] == ["fees", "refunds", "baggage"]
    NewFact(category="baggage", subject="s", attribute="a", value="1", statement="x")


def test_switching_needs_a_seeded_pack(pack: Any) -> None:
    from app.routers.domains import DomainSwitch, list_domains, switch_domain

    db.init_db()
    with pytest.raises(HTTPException) as unknown:
        switch_domain(DomainSwitch(id="telecom"))
    assert unknown.value.status_code == 404
    with pytest.raises(HTTPException) as unseeded:
        switch_domain(DomainSwitch(id="bank"))
    assert unseeded.value.status_code == 409 and "seed.py --domain bank" in unseeded.value.detail
    assert list_domains()["active"] == "airline"

    pack("bank")  # seed one fact, then go back and switch through the API
    db.init_db()
    db.upsert_facts([db.Fact(id="ACC-001", category="accounts", subject="s", attribute="a",
                             value="1", statement="x", updated_at="2026-01-01T00:00:00Z")])
    pack("airline")
    out = switch_domain(DomainSwitch(id="bank"))
    bank = next(d for d in out["domains"] if d["id"] == "bank")
    assert out["active"] == "bank" and bank["facts"] == 1 and domains.active().id == "bank"
    assert [c["id"] for c in bank["categories"]] == list(BANK.categories)
