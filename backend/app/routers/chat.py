import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.events import bus
from app.graph.run import run_chat
from app.schemas import ChatRequest, ChatResult

router = APIRouter(tags=["chat"])
log = logging.getLogger("veritrust.chat")

_tasks: set[asyncio.Task[ChatResult]] = set()  # strong refs so running chats aren't GC'd


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat", response_model=ChatResult)
async def chat(req: ChatRequest) -> ChatResult:
    return await run_chat(req)


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Server-sent events: `start`, then one `node` per node start/end, then `result`
    (or `error` if something unexpected broke). Read with fetch + ReadableStream."""
    rid = uuid.uuid4().hex
    bus.open(rid)
    task = asyncio.create_task(run_chat(req, rid))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    task.add_done_callback(lambda _: bus.close(rid))

    async def events() -> AsyncIterator[str]:
        yield _sse("start", {"request_id": rid})
        async for ev in bus.stream(rid):
            yield _sse("node", ev.model_dump())
        try:
            result = await task
        except Exception:
            log.exception("Chat %s failed", rid)
            yield _sse("error", {"request_id": rid,
                                 "message": "Something went wrong. Please try again."})
            return
        yield _sse("result", result.model_dump(mode="json"))

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
