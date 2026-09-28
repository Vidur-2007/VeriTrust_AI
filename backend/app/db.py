"""SQLite helpers and schema. The facts table is the source of truth."""

import json
import sqlite3
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS facts (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL CHECK (category IN ('baggage','fees','refunds','cancellations',
                    'check_in','loyalty','special_assistance','pets')),
    subject     TEXT NOT NULL,
    attribute   TEXT NOT NULL,
    value       TEXT NOT NULL,
    unit        TEXT,
    statement   TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    channel       TEXT NOT NULL CHECK (channel IN ('console','site','redteam','eval')),
    question      TEXT NOT NULL,
    language      TEXT,
    injected      INTEGER NOT NULL DEFAULT 0,
    attack_id     TEXT,
    input_flags   TEXT NOT NULL DEFAULT '[]',
    drafts        TEXT NOT NULL DEFAULT '[]',
    final_answer  TEXT,
    status        TEXT CHECK (status IN ('approved','corrected','escalated')),
    claims        TEXT NOT NULL DEFAULT '[]',
    trust_score   INTEGER,
    retries       INTEGER NOT NULL DEFAULT 0,
    timings       TEXT NOT NULL DEFAULT '{}',
    review_status TEXT NOT NULL DEFAULT 'none' CHECK (review_status IN ('none','pending','resolved')),
    reviewer_text TEXT
);
CREATE INDEX IF NOT EXISTS ix_interactions_ts ON interactions(ts);
CREATE INDEX IF NOT EXISTS ix_interactions_status ON interactions(status);
CREATE INDEX IF NOT EXISTS ix_interactions_review ON interactions(review_status);

CREATE TABLE IF NOT EXISTS drift_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    fact_id    TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    old_value  TEXT,
    new_value  TEXT NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('edit','review'))
);
CREATE INDEX IF NOT EXISTS ix_drift_ts ON drift_events(ts);

CREATE TABLE IF NOT EXISTS manual_audits (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    findings TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    mode         TEXT NOT NULL,
    metrics      TEXT NOT NULL DEFAULT '{}',
    per_question TEXT NOT NULL DEFAULT '[]'
);
"""

# Values are stored JSON-encoded so types survive the round trip.
DEFAULT_SETTINGS: dict[str, Any] = {
    "strictness": "balanced",
    "max_retries": 2,
    "high_risk_categories": ["fees", "refunds", "baggage"],
    "alert_threshold_pct": 30,
    "alert_window_min": 10,
}

TABLES = ("facts", "interactions", "drift_events", "manual_audits", "settings", "eval_runs")


class Fact(BaseModel):
    id: str
    category: str
    subject: str
    attribute: str
    value: str
    unit: str | None = None
    statement: str
    updated_at: str


@contextmanager
def connect(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Open a connection, commit on success, roll back on error, always close."""
    conn = sqlite3.connect(db_path or get_settings().db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Path | None = None) -> None:
    """Create all tables and default settings. Safe to call repeatedly."""
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)
        conn.executemany(
            "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
            [(k, json.dumps(v)) for k, v in DEFAULT_SETTINGS.items()],
        )


def upsert_facts(facts: Iterable[Fact], db_path: Path | None = None) -> int:
    rows = [f.model_dump() for f in facts]
    with connect(db_path) as conn:
        conn.executemany(
            """INSERT INTO facts(id, category, subject, attribute, value, unit, statement, updated_at)
               VALUES (:id, :category, :subject, :attribute, :value, :unit, :statement, :updated_at)
               ON CONFLICT(id) DO UPDATE SET
                 category=excluded.category, subject=excluded.subject,
                 attribute=excluded.attribute, value=excluded.value, unit=excluded.unit,
                 statement=excluded.statement, updated_at=excluded.updated_at""",
            rows,
        )
    return len(rows)


def delete_facts_not_in(keep_ids: set[str], db_path: Path | None = None) -> list[str]:
    with connect(db_path) as conn:
        existing = {r["id"] for r in conn.execute("SELECT id FROM facts")}
        stale = sorted(existing - keep_ids)
        conn.executemany("DELETE FROM facts WHERE id = ?", [(i,) for i in stale])
    return stale


def list_facts(category: str | None = None, db_path: Path | None = None) -> list[Fact]:
    sql, args = "SELECT * FROM facts", ()
    if category:
        sql, args = sql + " WHERE category = ?", (category,)
    with connect(db_path) as conn:
        return [Fact(**dict(r)) for r in conn.execute(sql + " ORDER BY id", args)]


def get_fact(fact_id: str, db_path: Path | None = None) -> Fact | None:
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM facts WHERE id = ?", (fact_id,)).fetchone()
    return Fact(**dict(row)) if row else None


def get_settings_map(db_path: Path | None = None) -> dict[str, Any]:
    with connect(db_path) as conn:
        stored = {r["key"]: json.loads(r["value"]) for r in conn.execute("SELECT * FROM settings")}
    return {**DEFAULT_SETTINGS, **stored}


def set_setting(key: str, value: Any, db_path: Path | None = None) -> None:
    with connect(db_path) as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)),
        )


INTERACTION_COLUMNS = ("channel", "question", "language", "injected", "attack_id", "input_flags",
                       "drafts", "final_answer", "status", "claims", "trust_score", "retries",
                       "timings", "review_status", "reviewer_text")


def insert_interaction(row: dict[str, Any], db_path: Path | None = None) -> int:
    """Insert one interaction. Lists and dicts are stored as JSON. Returns the new id."""
    values = [json.dumps(row.get(c), ensure_ascii=False)
              if isinstance(row.get(c), (list, dict)) else row.get(c)
              for c in INTERACTION_COLUMNS]
    with connect(db_path) as conn:
        cur = conn.execute(
            f"INSERT INTO interactions({', '.join(INTERACTION_COLUMNS)}) "
            f"VALUES ({', '.join('?' * len(INTERACTION_COLUMNS))})",
            values,
        )
        return int(cur.lastrowid or 0)


def get_interaction(interaction_id: int, db_path: Path | None = None) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM interactions WHERE id = ?", (interaction_id,)).fetchone()
    if not row:
        return None
    out = dict(row)
    for c in ("input_flags", "drafts", "claims", "timings"):
        out[c] = json.loads(out[c]) if out[c] else None
    return out


def table_counts(db_path: Path | None = None) -> dict[str, int]:
    with connect(db_path) as conn:
        return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
