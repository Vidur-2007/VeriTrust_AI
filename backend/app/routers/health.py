from typing import Any

from fastapi import APIRouter

from app import db, domains, llm, retrieval
from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, Any]:
    s = get_settings()
    counts = db.table_counts()
    return {
        "status": "ok",
        "domain": domains.active().id,
        "provider": llm.provider_status(),
        "models": {
            "gemini": s.gemini_model,
            "gemini_embed": s.gemini_embed_model,
            "ollama": s.ollama_model,
            "ollama_embed": s.ollama_embed_model,
        },
        "ollama_reachable": await llm.ollama_reachable(),
        "db": {"facts": counts["facts"], "interactions": counts["interactions"]},
        "chroma": retrieval.collection_info(),
    }
