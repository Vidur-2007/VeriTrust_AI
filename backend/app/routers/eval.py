import asyncio
import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import analytics, db, evaluation
from app.evaluation import RunMode

router = APIRouter(tags=["eval"])
log = logging.getLogger("veritrust.eval")

_state: dict[str, Any] = {}  # progress of the current (or last) run, in memory
_tasks: set[asyncio.Task[None]] = set()


class EvalRunRequest(BaseModel):
    mode: RunMode = "all"
    # Each question costs about 10 model calls across the three modes, so the page runs a
    # small sample by default; the full set belongs to scripts/run_eval.py.
    limit: int | None = Field(10, ge=1, le=500)
    question_ids: list[str] | None = None
    types: list[str] | None = None
    gemini_only: bool = True


async def _run(req: EvalRunRequest) -> None:
    try:
        async for event, data in evaluation.run_eval(req.mode, limit=req.limit,
                                                     question_ids=req.question_ids,
                                                     types=req.types,
                                                     gemini_only=req.gemini_only):
            if event == "question":
                rec = data["record"]
                _state.update(done=data["done"], last={k: rec.get(k) for k in (
                    "id", "mode", "status", "hallucinated", "error")})
            elif event == "done":
                _state["eval_run_id"] = data["eval_run_id"]
    except Exception as e:  # a background task must never die silently
        log.exception("Eval run failed")
        _state["error"] = str(e)
    finally:
        _state.update(running=False, finished_at=analytics.minutes_ago(0))


@router.post("/eval/run", status_code=202)
async def start_run(req: EvalRunRequest) -> dict[str, Any]:
    """Starts the eval in the background. Poll GET /eval/latest for progress."""
    if _state.get("running"):
        raise HTTPException(409, "An eval run is already in progress.")
    questions = [q for q in evaluation.load_questions(None, req.question_ids)
                 if not req.types or q.type in req.types][:req.limit]
    if not questions:
        raise HTTPException(400, "No eval questions match.")
    total = len(questions) * len(evaluation.modes_for(req.mode))
    _state.clear()
    _state.update(run_id=uuid.uuid4().hex[:8], running=True, mode=req.mode, done=0, total=total,
                  started_at=analytics.minutes_ago(0), eval_run_id=None, error=None, last=None)
    task = asyncio.create_task(_run(req))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"run_id": _state["run_id"], "mode": req.mode, "questions": len(questions),
            "total": total}


@router.get("/eval/latest")
def latest() -> dict[str, Any]:
    return {"current": dict(_state) or None, "latest": db.latest_eval_run()}
