from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.schemas import FactCategory, Strictness

router = APIRouter(tags=["settings"])


class SettingsUpdate(BaseModel):
    """Partial update. Changes apply to the next request."""
    model_config = ConfigDict(extra="forbid")

    strictness: Strictness | None = None
    max_retries: int | None = Field(None, ge=0, le=3)
    high_risk_categories: list[FactCategory] | None = None
    alert_threshold_pct: float | None = Field(None, ge=1, le=100)
    alert_window_min: int | None = Field(None, ge=1, le=1440)


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    return db.get_settings_map()


@router.put("/settings")
def update_settings(update: SettingsUpdate) -> dict[str, Any]:
    for key, value in update.model_dump(exclude_none=True).items():
        db.set_setting(key, sorted(set(value)) if isinstance(value, list) else value)
    return db.get_settings_map()
