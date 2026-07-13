"""Work Signals — application entry point.

Start the server:
    uvicorn main:app --reload

Or run directly:
    python main.py
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.workSignalsRoutes import router as work_signals_router
from config import DEFAULT_CORS_ORIGINS, auth_disabled, csv_env
from storage.workSignalStore import init_store, shutdown_store, store

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("work_signals")


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """Run startup logic before the server begins accepting requests,
    and teardown logic after it stops."""
    # ── Startup ─────────────────────────────────────────────────────────────
    logger.info("Work Signals service starting up.")

    github_repo = os.getenv("GITHUB_REPO", "(not set)")
    linear_team = os.getenv("LINEAR_TEAM_ID", "(not set)")
    logger.info("Config  GITHUB_REPO=%s  LINEAR_TEAM_ID=%s", github_repo, linear_team)

    missing: list[str] = []
    if not os.getenv("OPS_RECORDER_API_KEY") and not auth_disabled():
        missing.append("OPS_RECORDER_API_KEY")
    if not os.getenv("GITHUB_TOKEN"):
        missing.append("GITHUB_TOKEN")
    if not os.getenv("LINEAR_API_KEY"):
        missing.append("LINEAR_API_KEY")
    if missing:
        logger.warning(
            "The following environment variables are not set: %s. "
            "Sync endpoints for those sources will return 422.",
            ", ".join(missing),
        )

    # ── Storage backend ──────────────────────────────────────────────────────
    # Selects Postgres when a database URL + asyncpg are available, otherwise
    # falls back to the in-memory store (logged inside init_store).
    await init_store()
    logger.info("WorkSignal storage backend: %s", store.backend_name)

    logger.info("Work Signals service is ready.")
    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("Work Signals service shutting down.")
    await shutdown_store()


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Work Signals",
    description=(
        "Detects stuck or blocked work across GitHub and Linear and packages "
        "each problem into a structured WorkSignal with an AI-ready handoff prompt."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=csv_env("CORS_ORIGINS", DEFAULT_CORS_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(work_signals_router, prefix="/work-signals")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    """Quick liveness probe — returns 200 if the service is running."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Dev runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=True,
        log_level="info",
    )
