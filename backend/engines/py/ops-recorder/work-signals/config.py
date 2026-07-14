"""Runtime configuration helpers for Work Signals."""

from __future__ import annotations

import os
import re
import secrets
import uuid
from typing import Annotated

from fastapi import Header, HTTPException

DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://localhost:8000",
)

_GITHUB_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def csv_env(name: str, default: tuple[str, ...] = ()) -> list[str]:
    """Read a comma-separated environment variable into a trimmed list."""
    raw = os.getenv(name)
    if not raw:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def auth_disabled() -> bool:
    return os.getenv("OPS_RECORDER_AUTH_DISABLED", "").lower() in {"1", "true", "yes"}


def require_api_key(x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None) -> None:
    """Require the shared API key for all non-health endpoints."""
    if auth_disabled():
        return

    expected = os.getenv("OPS_RECORDER_API_KEY")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="OPS_RECORDER_API_KEY is not configured.",
        )

    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


def configured_github_repo() -> str:
    repo = os.getenv("GITHUB_REPO", "").strip()
    if not repo:
        raise HTTPException(status_code=422, detail="GITHUB_REPO environment variable is not set.")
    if not _GITHUB_REPO_RE.fullmatch(repo):
        raise HTTPException(status_code=422, detail="GITHUB_REPO must use the format owner/repo.")
    return repo


def configured_linear_team_id() -> str:
    team_id = os.getenv("LINEAR_TEAM_ID", "").strip()
    if not team_id:
        raise HTTPException(status_code=422, detail="LINEAR_TEAM_ID environment variable is not set.")
    try:
        uuid.UUID(team_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="LINEAR_TEAM_ID must be a UUID.") from exc
    return team_id
