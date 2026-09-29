from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import db, scoring
from app.schemas import Channel, Claim, Status

router = APIRouter(tags=["interactions"])


def summary(r: dict[str, Any]) -> dict[str, Any]:
    claims = r.get("claims") or []
    return {
        "id": r["id"], "ts": r["ts"], "channel": r["channel"], "question": r["question"],
        "language": r["language"], "status": r["status"], "trust_score": r["trust_score"],
        "retries": r["retries"], "injected": r["injected"], "attack_id": r["attack_id"],
        "review_status": r["review_status"], "strictness": r.get("strictness"),
        "flags": r.get("input_flags") or [],
        "total_ms": (r.get("timings") or {}).get("total_ms"),
        "contradicted": sum(c["verdict"] == "contradicted" for c in claims),
        "unsupported": sum(c["verdict"] == "unsupported" for c in claims),
    }


def get_or_404(interaction_id: int) -> dict[str, Any]:
    row = db.get_interaction(interaction_id)
    if row is None:
        raise HTTPException(404, f"Interaction {interaction_id} not found.")
    return row


@router.get("/interactions")
def list_interactions(status: Status | None = None, channel: Channel | None = None,
                      review_status: str | None = None, q: str | None = None,
                      limit: int = Query(50, ge=1, le=500),
                      offset: int = Query(0, ge=0)) -> dict[str, Any]:
    filters: dict[str, Any] = {"channels": [channel] if channel else None, "status": status,
                               "review_status": review_status, "q": q}
    rows = db.select_interactions(limit=limit, offset=offset, **filters)
    return {"total": db.count_interactions(**filters), "limit": limit, "offset": offset,
            "items": [summary(r) for r in rows]}


@router.get("/interactions/{interaction_id}")
def get_interaction(interaction_id: int) -> dict[str, Any]:
    return get_or_404(interaction_id)


def _evidence(claim: dict[str, Any], asked_at: str) -> list[dict[str, Any]]:
    """Evidence as the Judge saw it, next to the fact's value today."""
    out = []
    for e in claim.get("evidence") or []:
        fact = db.get_fact(e["fact_id"])
        out.append({
            "fact_id": e["fact_id"], "statement_at_answer_time": e["statement"],
            "current_value": fact.value if fact else None,
            "current_statement": fact.statement if fact else None,
            "changed_since": bool(fact and fact.updated_at > asked_at),
        })
    return out


@router.get("/interactions/{interaction_id}/report")
def report(interaction_id: int) -> dict[str, Any]:
    """Everything an auditor needs for one conversation."""
    r = get_or_404(interaction_id)
    drafts = [{
        "retry": d["retry"], "text": d["text"], "injected_detail": d.get("injected_detail"),
        "claims": [{**{k: c.get(k) for k in ("text", "text_en", "category", "verdict",
                                             "correction", "caught_by", "rule_note",
                                             "manual_section", "span_start", "span_end")},
                    "evidence": _evidence(c, r["ts"])} for c in d.get("claims") or []],
    } for d in r.get("drafts") or []]
    final_claims = [Claim(**c) for c in r.get("claims") or []]
    score, breakdown = scoring.trust_score(final_claims, r["retries"], r["status"])
    timings = r.get("timings") or {}
    return {
        "interaction": summary(r),
        "question": r["question"],
        "final_answer": r["final_answer"],
        "drafts": drafts,
        "decision": {
            "status": r["status"], "retries": r["retries"], "strictness": r.get("strictness"),
            "input_flags": r.get("input_flags") or [],
            "explanation": {
                "approved": "Every blocking claim was supported on the first draft.",
                "corrected": f"Blocked, rewritten {r['retries']} time(s), then approved.",
                "escalated": "Still failing after the retry limit; the customer got the safe "
                             "hand-off message and a human reviews it.",
            }.get(r["status"]),
        },
        "trust": {"score": score, "breakdown": breakdown},
        "timings": {"total_ms": timings.get("total_ms"), "nodes": timings.get("nodes"),
                    "spans": timings.get("spans")},
        "review": {"status": r["review_status"], "reviewer_text": r["reviewer_text"]},
        "pii_redacted": "pii_redacted" in (r.get("input_flags") or []),
    }
