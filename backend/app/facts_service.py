"""Change the verified facts: update or create a fact, record a drift event, re-embed it."""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, model_validator

from app import db, llm, retrieval
from app.db import Fact
from app.schemas import FactCategory

log = logging.getLogger("veritrust.facts")

Source = Literal["edit", "review"]
CATEGORY_PREFIX = {"baggage": "BAG", "fees": "FEE", "refunds": "REF", "cancellations": "CAN",
                   "check_in": "CHK", "loyalty": "LOY", "special_assistance": "SPA", "pets": "PET"}


class FactError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status, self.message = status, message


class FactUpdate(BaseModel):
    value: str | None = None
    unit: str | None = None
    statement: str | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "FactUpdate":
        if self.value is None and self.unit is None and self.statement is None:
            raise ValueError("Send at least one of value, unit or statement.")
        return self


class NewFact(BaseModel):
    id: str | None = None
    category: FactCategory
    subject: str
    attribute: str
    value: str
    unit: str | None = None
    statement: str


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _number(text: str) -> float | None:
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def _formats(n: float) -> list[str]:
    """Ways a number can appear in a statement: 3000 -> ["3,000", "3000"]."""
    if n == int(n):
        return list(dict.fromkeys([f"{int(n):,}", str(int(n))]))
    return [str(n)]


def substitute_value(statement: str, old: str, new: str) -> str | None:
    """Replace the old value in a statement with the new one, keeping its number format
    ("₹3,000" -> "₹3,500"). Returns None if the old value isn't in the statement."""
    old_n, new_n = _number(old), _number(new)
    if old_n is None or new_n is None:
        pattern = re.compile(rf"(?<!\w){re.escape(old)}(?!\w)")
        return pattern.sub(new, statement, count=1) if pattern.search(statement) else None
    for fmt in _formats(old_n):
        pattern = re.compile(rf"(?<![\d.,]){re.escape(fmt)}(?![\d]|[.,]\d)")
        if pattern.search(statement):
            replacement = f"{int(new_n):,}" if "," in fmt and new_n == int(new_n) else new
            return pattern.sub(replacement, statement, count=1)
    return None


async def reembed(fact: Fact) -> bool:
    """Refresh the fact's vector with the provider the collection was built with.
    SQLite stays the source of truth even if this fails (retrieval just uses the old vector)."""
    col = retrieval.get_collection("facts")
    provider = (col.metadata or {}).get("embed_provider")
    try:
        [vector] = await llm.embed([fact.statement], task="document", provider=provider)
    except llm.LLMError as e:
        log.warning("Could not re-embed %s: %s", fact.id, e.message)
        return False
    col.upsert(ids=[fact.id], embeddings=[vector], documents=[fact.statement],
               metadatas=[{"fact_id": fact.id, "category": fact.category,
                           "subject": fact.subject, "attribute": fact.attribute}])
    return True


async def update_fact(fact_id: str, change: FactUpdate, source: Source) -> dict[str, Any]:
    fact = db.get_fact(fact_id)
    if fact is None:
        raise FactError(404, f"Fact {fact_id} not found.")
    value = change.value if change.value is not None else fact.value
    statement = change.statement
    if statement is None and value != fact.value:
        statement = substitute_value(fact.statement, fact.value, value)
        if statement is None:
            raise FactError(422, f"Couldn't find {fact.value!r} in the statement to update it. "
                                 "Send the new statement too.")
    updated = fact.model_copy(update={
        "value": value,
        "unit": change.unit if change.unit is not None else fact.unit,
        "statement": statement or fact.statement,
    })
    if updated == fact:
        return {"fact": fact.model_dump(), "drift_event": None, "reembedded": False}
    updated = updated.model_copy(update={"updated_at": _now()})
    db.upsert_facts([updated])
    drift = db.insert_drift_event(fact.id, fact.value, updated.value, source)
    reembedded = await reembed(updated) if updated.statement != fact.statement else False
    return {"fact": updated.model_dump(), "drift_event": drift, "reembedded": reembedded}


def _next_id(category: str) -> str:
    prefix = CATEGORY_PREFIX[category]
    numbers = [int(f.id.split("-")[1]) for f in db.list_facts() if f.id.startswith(prefix + "-")]
    return f"{prefix}-{max(numbers, default=0) + 1:03d}"


async def create_fact(new: NewFact, source: Source) -> dict[str, Any]:
    fact_id = new.id or _next_id(new.category)
    if db.get_fact(fact_id):
        raise FactError(409, f"Fact {fact_id} already exists.")
    fact = Fact(**{**new.model_dump(), "id": fact_id}, updated_at=_now())
    db.upsert_facts([fact])
    drift = db.insert_drift_event(fact.id, None, fact.value, source)
    return {"fact": fact.model_dump(), "drift_event": drift, "reembedded": await reembed(fact)}


async def save_fact(new: NewFact, source: Source) -> dict[str, Any]:
    """Update the fact if it exists (review corrections), otherwise create it."""
    if new.id and db.get_fact(new.id):
        return await update_fact(new.id, FactUpdate(value=new.value, unit=new.unit,
                                                    statement=new.statement), source)
    return await create_fact(new, source)
