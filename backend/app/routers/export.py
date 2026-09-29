import csv
import io
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app import db
from app.schemas import Channel, Status

router = APIRouter(tags=["export"])

CSV_COLUMNS = ["id", "ts", "channel", "status", "trust_score", "retries", "total_ms", "injected",
               "attack_id", "language", "strictness", "review_status", "flags", "contradicted",
               "unsupported", "question", "final_answer", "reviewer_text"]


def _rows(channel: Channel | None, status: Status | None, since: str | None
          ) -> list[dict[str, Any]]:
    return db.select_interactions(channels=[channel] if channel else None, status=status,
                                  since=since, ascending=True)


def _flat(r: dict[str, Any]) -> list[Any]:
    claims = r.get("claims") or []
    return [r["id"], r["ts"], r["channel"], r["status"], r["trust_score"], r["retries"],
            (r.get("timings") or {}).get("total_ms"), int(r["injected"]), r["attack_id"],
            r["language"], r.get("strictness"), r["review_status"],
            ";".join(r.get("input_flags") or []),
            sum(c["verdict"] == "contradicted" for c in claims),
            sum(c["verdict"] == "unsupported" for c in claims),
            r["question"], r["final_answer"], r["reviewer_text"]]


@router.get("/export/interactions.csv")
def export_csv(channel: Channel | None = None, status: Status | None = None,
               since: str | None = None) -> StreamingResponse:
    """Questions and answers are stored PII-redacted, so the export is too."""
    rows = _rows(channel, status, since)

    def lines() -> Iterator[str]:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(CSV_COLUMNS)
        for r in rows:
            writer.writerow(_flat(r))
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()
        yield buf.getvalue()

    return StreamingResponse(lines(), media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": 'attachment; filename="interactions.csv"'})


@router.get("/export/interactions.json")
def export_json(channel: Channel | None = None, status: Status | None = None,
                since: str | None = None) -> dict[str, Any]:
    rows = _rows(channel, status, since)
    return {"count": len(rows), "items": rows}
