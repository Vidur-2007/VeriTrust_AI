from collections import defaultdict
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app import redteam
from app.redteam import RunRequest
from app.sse import sse_response

router = APIRouter(tags=["redteam"])


@router.get("/redteam/attacks")
def attacks() -> dict[str, Any]:
    items = redteam.load_attacks()
    by_type: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for a in items:
        by_type[a["type"]].append(a)
    return {"count": len(items), "types": dict(by_type), "items": items}


@router.post("/redteam/run")
async def run(req: RunRequest) -> StreamingResponse:
    """Server-sent events: `start`, then `attack_start` and `attack_result` (with the running
    scoreboard) per attack, then `done`. Attacks run one at a time, within the LLM rate limit."""
    if not redteam.select_attacks(req):
        raise HTTPException(400, "No attacks match those ids or types.")
    return sse_response(redteam.run_attacks(req))
