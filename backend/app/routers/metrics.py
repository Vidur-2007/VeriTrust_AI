from typing import Any

from fastapi import APIRouter, Query

from app import analytics, db

router = APIRouter(tags=["metrics"])

LIVE_CHANNELS = ["console", "site", "redteam"]


def parse_channels(channels: str | None) -> list[str] | None:
    return [c.strip() for c in channels.split(",") if c.strip()] if channels else None


@router.get("/metrics")
def metrics(window_min: int | None = Query(None, ge=1, description="Only the last N minutes"),
            channels: str | None = Query(None, description="Comma-separated; default excludes eval"),
            series_min: int = Query(60, ge=5, le=1440)) -> dict[str, Any]:
    chosen = parse_channels(channels)
    rows = db.select_interactions(
        channels=chosen, exclude_channels=None if chosen else ["eval"],
        since=analytics.minutes_ago(window_min) if window_min else None)
    return {"window_min": window_min, "channels": chosen or LIVE_CHANNELS,
            **analytics.compute_metrics(rows, series_minutes=series_min)}
