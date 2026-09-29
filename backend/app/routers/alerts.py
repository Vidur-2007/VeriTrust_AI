from typing import Any

from fastapi import APIRouter

from app import analytics, db

router = APIRouter(tags=["alerts"])


@router.get("/alerts")
def alerts() -> dict[str, Any]:
    """Blocked-answer rate over the rolling window from settings (eval runs excluded)."""
    s = db.get_settings_map()
    window = int(s["alert_window_min"])
    rows = db.select_interactions(exclude_channels=["eval"], since=analytics.minutes_ago(window))
    return analytics.compute_alert(rows, threshold_pct=float(s["alert_threshold_pct"]),
                                   window_min=window)
