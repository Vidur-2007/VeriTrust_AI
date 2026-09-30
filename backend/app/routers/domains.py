import json
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db, domains
from app.config import DEFAULT_DOMAIN, get_settings
from app.domains import Domain

router = APIRouter(tags=["domains"])


def _db_file(d: Domain) -> Path:
    base = get_settings().data_dir
    return (base if d.id == DEFAULT_DOMAIN else base / "packs" / d.id) / "veritrust.sqlite3"


def _facts(d: Domain) -> int:
    """Verified facts loaded for a pack, read without switching to it. 0 = not seeded yet."""
    path = _db_file(d)
    if not path.exists():
        return 0
    try:
        with sqlite3.connect(path) as conn:
            return int(conn.execute("SELECT COUNT(*) FROM facts").fetchone()[0])
    except sqlite3.Error:
        return 0


def _demo_attacks(d: Domain) -> list[str]:
    """The attacks the "demo set" runs: the pack's own pick, else all of its attacks."""
    if d.demo_attacks is not None:
        return d.demo_attacks
    try:
        return [a["id"] for a in json.loads(d.attacks_file.read_text(encoding="utf-8"))]
    except OSError:
        return []


def describe(d: Domain) -> dict[str, Any]:
    return {
        "id": d.id, "name": d.name, "industry": d.industry, "facts": _facts(d),
        "categories": [{"id": c, "label": label} for c, label in d.categories.items()],
        "high_risk": d.high_risk, "has_site": d.has_site, "demo_attacks": _demo_attacks(d),
        "examples": d.examples(),
    }


def _listing() -> dict[str, Any]:
    return {"active": domains.active().id, "domains": [describe(d) for d in domains.DOMAINS.values()]}


@router.get("/domains")
def list_domains() -> dict[str, Any]:
    return _listing()


class DomainSwitch(BaseModel):
    id: str


@router.put("/domains/active")
def switch_domain(body: DomainSwitch) -> dict[str, Any]:
    """Swap the knowledge base (facts, manuals, attacks, eval set, history) without a restart.
    The next request is answered from the new pack."""
    d = domains.DOMAINS.get(body.id)
    if d is None:
        raise HTTPException(404, f"Unknown domain pack {body.id!r}. "
                                 f"Available: {', '.join(domains.DOMAINS)}.")
    if _facts(d) == 0:
        raise HTTPException(409, f"The {d.name} pack isn't loaded yet. From the backend folder "
                                 f"run: python scripts/seed.py --domain {d.id}")
    config.set_active_domain(d.id)
    db.init_db()  # additive migrations for a pack created by an earlier version
    return _listing()
