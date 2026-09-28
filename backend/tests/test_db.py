import json
from pathlib import Path

from app import db
from app.config import DATA_SOURCE_DIR


def test_init_is_idempotent(tmp_path: Path) -> None:
    p = tmp_path / "t.sqlite3"
    db.init_db(p)
    db.set_setting("strictness", "strict", p)
    db.init_db(p)  # must not reset user settings or fail
    assert db.get_settings_map(p)["strictness"] == "strict"
    assert set(db.table_counts(p)) == set(db.TABLES)


def test_default_settings(tmp_path: Path) -> None:
    p = tmp_path / "t.sqlite3"
    db.init_db(p)
    s = db.get_settings_map(p)
    assert s["max_retries"] == 2
    assert "fees" in s["high_risk_categories"]


def test_facts_file_loads_and_upserts(tmp_path: Path) -> None:
    p = tmp_path / "t.sqlite3"
    db.init_db(p)
    facts = [db.Fact(**f) for f in json.loads((DATA_SOURCE_DIR / "facts.json").read_text("utf-8"))]
    assert 55 <= len(facts) <= 100
    assert len({f.id for f in facts}) == len(facts)
    db.upsert_facts(facts, p)
    db.upsert_facts(facts, p)
    assert db.table_counts(p)["facts"] == len(facts)
    assert db.get_fact("BAG-007", p).value == "650"
