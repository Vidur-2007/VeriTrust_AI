"""Per-request event queues so graph nodes can stream progress to the ops console."""

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Literal

from pydantic import BaseModel, Field

Phase = Literal["start", "end"]


class NodeEvent(BaseModel):
    node: str
    phase: Phase
    ms: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


_CLOSED = object()


class EventBus:
    def __init__(self) -> None:
        self._queues: dict[str, asyncio.Queue[Any]] = {}

    def open(self, request_id: str) -> None:
        self._queues[request_id] = asyncio.Queue()

    def emit(
        self,
        request_id: str,
        node: str,
        phase: Phase,
        ms: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        """Queue an event. No-op when no one is streaming this request (e.g. plain POST /chat)."""
        q = self._queues.get(request_id)
        if q is not None:
            q.put_nowait(NodeEvent(node=node, phase=phase, ms=ms, payload=payload or {}))

    def close(self, request_id: str) -> None:
        q = self._queues.get(request_id)
        if q is not None:
            q.put_nowait(_CLOSED)

    async def stream(self, request_id: str) -> AsyncIterator[NodeEvent]:
        """Yield events until close() is called, then drop the queue."""
        q = self._queues.get(request_id)
        if q is None:
            return
        try:
            while (item := await q.get()) is not _CLOSED:
                yield item
        finally:
            self._queues.pop(request_id, None)

    @asynccontextmanager
    async def node_span(self, request_id: str, node: str) -> AsyncIterator[dict[str, Any]]:
        """Emit start/end around a node. Put anything into the yielded dict to send it on end."""
        self.emit(request_id, node, "start")
        payload: dict[str, Any] = {}
        t0 = time.perf_counter()
        try:
            yield payload
        finally:
            ms = round((time.perf_counter() - t0) * 1000)
            payload.setdefault("ms", ms)
            self.emit(request_id, node, "end", ms=ms, payload=payload)


bus = EventBus()
