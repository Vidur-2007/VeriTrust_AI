from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app import audit, db
from app.sse import sse_response

router = APIRouter(tags=["audit"])


@router.post("/audit/manuals")
async def scan_manuals() -> StreamingResponse:
    """Server-sent events: `progress` per manual, `finding` per stale section, then `result`."""
    return sse_response(audit.run_audit())


@router.get("/audit/latest")
def latest_audit() -> dict[str, Any] | None:
    return db.latest_audit()
