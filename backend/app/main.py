import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import (alerts, audit, chat, domains, eval, export, facts, health, interactions,
                         metrics, redteam, review, settings)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="VeriTrust AI", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
for module in (health, chat, metrics, interactions, facts, audit, redteam, review, settings,
               alerts, export, eval, domains):
    app.include_router(module.router, prefix="/api")
