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
        _migrate(conn)
        conn.executemany(
            "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
            [(k, json.dumps(v)) for k, v in DEFAULT_SETTINGS.items()],
        )


def _migrate(conn: sqlite3.Connection) -> None:
    """Additive migrations for databases created by earlier phases."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(interactions)")}
    if "strictness" not in cols:
        conn.execute("ALTER TABLE interactions ADD COLUMN strictness TEXT")


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
                       "timings", "review_status", "reviewer_text", "strictness")


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


JSON_COLUMNS = ("input_flags", "drafts", "claims", "timings")


def _parse_interaction(row: sqlite3.Row) -> dict[str, Any]:
    out = dict(row)
    for c in JSON_COLUMNS:
        out[c] = json.loads(out[c]) if out[c] else None
    out["injected"] = bool(out["injected"])
    return out


def get_interaction(interaction_id: int, db_path: Path | None = None) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM interactions WHERE id = ?", (interaction_id,)).fetchone()
    return _parse_interaction(row) if row else None


def _interaction_filter(*, channels: list[str] | None = None,
                        exclude_channels: list[str] | None = None, status: str | None = None,
                        review_status: str | None = None, since: str | None = None,
                        q: str | None = None) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    args: list[Any] = []
    if channels:
        clauses.append(f"channel IN ({', '.join('?' * len(channels))})")
        args += channels
    if exclude_channels:
        clauses.append(f"channel NOT IN ({', '.join('?' * len(exclude_channels))})")
        args += exclude_channels
    for col, val in (("status", status), ("review_status", review_status)):
        if val:
            clauses.append(f"{col} = ?")
            args.append(val)
    if since:
        clauses.append("ts >= ?")
        args.append(since)
    if q:
        clauses.append("question LIKE ?")
        args.append(f"%{q}%")
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", args


def select_interactions(*, limit: int | None = None, offset: int = 0, ascending: bool = False,
                        db_path: Path | None = None, **filters: Any) -> list[dict[str, Any]]:
    """Interactions matching the filters (see _interaction_filter), newest first by default."""
    where, args = _interaction_filter(**filters)
    sql = f"SELECT * FROM interactions{where} ORDER BY id {'ASC' if ascending else 'DESC'}"
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        args += [limit, offset]
    with connect(db_path) as conn:
        return [_parse_interaction(r) for r in conn.execute(sql, args)]


def count_interactions(db_path: Path | None = None, **filters: Any) -> int:
    where, args = _interaction_filter(**filters)
    with connect(db_path) as conn:
        return int(conn.execute(f"SELECT COUNT(*) FROM interactions{where}", args).fetchone()[0])


def resolve_review(interaction_id: int, reviewer_text: str, db_path: Path | None = None) -> None:
    with connect(db_path) as conn:
        conn.execute("UPDATE interactions SET review_status = 'resolved', reviewer_text = ? "
                     "WHERE id = ?", (reviewer_text, interaction_id))


# ---------------------------------------------------------------- drift, audits, eval runs

def insert_drift_event(fact_id: str, old_value: str | None, new_value: str, source: str,
                       db_path: Path | None = None) -> dict[str, Any]:
    with connect(db_path) as conn:
        cur = conn.execute("INSERT INTO drift_events(fact_id, old_value, new_value, source) "
                           "VALUES (?, ?, ?, ?)", (fact_id, old_value, new_value, source))
        row = conn.execute("SELECT * FROM drift_events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


def list_drift_events(limit: int = 100, db_path: Path | None = None) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT d.*, f.subject, f.attribute, f.category, f.unit FROM drift_events d "
            "LEFT JOIN facts f ON f.id = d.fact_id ORDER BY d.id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]


def last_drift_by_fact(db_path: Path | None = None) -> dict[str, str]:
    with connect(db_path) as conn:
        rows = conn.execute("SELECT fact_id, MAX(ts) AS ts FROM drift_events GROUP BY fact_id")
        return {r["fact_id"]: r["ts"] for r in rows}


def insert_audit(findings: list[dict[str, Any]], db_path: Path | None = None) -> dict[str, Any]:
    with connect(db_path) as conn:
        cur = conn.execute("INSERT INTO manual_audits(findings) VALUES (?)",
                           (json.dumps(findings, ensure_ascii=False),))
        row = conn.execute("SELECT * FROM manual_audits WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {**dict(row), "findings": findings}


def latest_audit(db_path: Path | None = None) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM manual_audits ORDER BY id DESC LIMIT 1").fetchone()
    return {**dict(row), "findings": json.loads(row["findings"])} if row else None


def insert_eval_run(mode: str, metrics: dict[str, Any], per_question: list[dict[str, Any]],
                    db_path: Path | None = None) -> int:
    with connect(db_path) as conn:
        cur = conn.execute("INSERT INTO eval_runs(mode, metrics, per_question) VALUES (?, ?, ?)",
                           (mode, json.dumps(metrics, ensure_ascii=False),
                            json.dumps(per_question, ensure_ascii=False)))
        return int(cur.lastrowid or 0)


def latest_eval_run(db_path: Path | None = None) -> dict[str, Any] | None:
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM eval_runs ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        return None
    return {**dict(row), "metrics": json.loads(row["metrics"]),
            "per_question": json.loads(row["per_question"])}


def table_counts(db_path: Path | None = None) -> dict[str, int]:
    with connect(db_path) as conn:
        return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
