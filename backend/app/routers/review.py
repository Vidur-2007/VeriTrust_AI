from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db, facts_service, pii
from app.facts_service import FactError, NewFact

router = APIRouter(tags=["review"])


class ReviewAction(BaseModel):
    action: Literal["approve", "edit"]
    text: str | None = None
    save_as_fact: NewFact | None = None


@router.get("/review")
def queue() -> dict[str, Any]:
    """Escalated conversations waiting for a human, with the full trace. `count` feeds the badge."""
    items = db.select_interactions(review_status="pending")
    return {"count": len(items), "items": items}


@router.post("/review/{interaction_id}")
async def resolve(interaction_id: int, body: ReviewAction) -> dict[str, Any]:
    row = db.get_interaction(interaction_id)
    if row is None:
        raise HTTPException(404, f"Interaction {interaction_id} not found.")
    if row["review_status"] != "pending":
        raise HTTPException(409, f"Interaction {interaction_id} is not waiting for review.")

    if body.action == "edit":
        if not (body.text or "").strip():
            raise HTTPException(422, "Write the reply to send when the action is edit.")
        text = body.text.strip()  # type: ignore[union-attr]
    else:
        drafts = row.get("drafts") or []
        if not drafts:
            raise HTTPException(422, "There is no draft to approve; use edit instead.")
        text = drafts[-1]["text"]
    text = pii.redact(text).text

    fact_result = None
    if body.save_as_fact is not None:  # save first: if it fails, the case stays pending
        try:
            fact_result = await facts_service.save_fact(body.save_as_fact, "review")
        except FactError as e:
            raise HTTPException(e.status, e.message) from e

    db.resolve_review(interaction_id, text)
    return {"id": interaction_id, "review_status": "resolved", "reviewer_text": text,
            "fact": fact_result, "pending": db.count_interactions(review_status="pending")}
