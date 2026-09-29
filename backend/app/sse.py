"""Server-sent events helpers shared by the streaming endpoints."""

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi.responses import StreamingResponse

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def sse_response(events: AsyncIterator[tuple[str, Any]]) -> StreamingResponse:
    """Stream (event, data) pairs from an async generator as text/event-stream."""
    async def body() -> AsyncIterator[str]:
        async for event, data in events:
            yield sse(event, data)

    return StreamingResponse(body(), media_type="text/event-stream", headers=SSE_HEADERS)
