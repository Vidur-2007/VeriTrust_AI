from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import analytics, db, facts_service
from app.facts_service import FactError, FactUpdate

router = APIRouter(tags=["facts"])

RECENT_MIN = 24 * 60


@router.get("/facts")
def list_facts(category: str | None = None) -> dict[str, Any]:
    last = db.last_drift_by_fact()
    cutoff = analytics.minutes_ago(RECENT_MIN)
    items = [f.model_dump() | {"last_changed_at": last.get(f.id),
                               "recently_changed": bool(last.get(f.id) and last[f.id] >= cutoff)}
             for f in db.list_facts(category)]
    return {"count": len(items), "items": items}


@router.get("/facts/{fact_id}")
def get_fact(fact_id: str) -> dict[str, Any]:
    fact = db.get_fact(fact_id)
    if fact is None:
        raise HTTPException(404, f"Fact {fact_id} not found.")
    return fact.model_dump()


@router.patch("/facts/{fact_id}")
async def update_fact(fact_id: str, change: FactUpdate) -> dict[str, Any]:
    """Edit a verified fact. Changing only `value` rewrites the number in the statement too.
    Writes a drift event and re-embeds the fact so retrieval sees the new statement."""
    try:
        return await facts_service.update_fact(fact_id, change, "edit")
    except FactError as e:
        raise HTTPException(e.status, e.message) from e


@router.get("/drift/events")
def drift_events(limit: int = Query(100, ge=1, le=1000)) -> dict[str, Any]:
    items = db.list_drift_events(limit)
    return {"count": len(items), "items": items}
