"""WorkSignal — the canonical data model for a detected stuck work item.

Every source (GitHub, Linear, …) normalizes into this shape before being
stored or handed off to an AI agent.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, HttpUrl


class Source(str, Enum):
    GITHUB = "github"
    LINEAR = "linear"


class ItemType(str, Enum):
    PULL_REQUEST = "pull_request"
    ISSUE = "issue"


class WorkSignal(BaseModel):
    """A single piece of stuck / blocked work, normalized for AI consumption."""

    # Stable identifier — deterministic hash of (source, source_url)
    id: str

    # Where the signal came from
    source: Source
    item_type: ItemType

    # Human-readable metadata
    title: str
    source_url: str
    assignee: Optional[str] = None
    status: Optional[str] = None

    # Why this item is stuck (filled by detector)
    detected_reason: str
    priority: str  # "high" | "medium" | "low"

    # AI-enriched context (template strings for MVP; replaced by RAG later)
    why_it_matters: str
    recommended_next_action: str

    # Ready-to-use prompt for Claude / Codex (filled by handoff generator)
    agent_handoff_prompt: str = ""

    # Resolution state
    resolved: bool = False

    # Timestamps
    created_at: datetime
    detected_at: datetime

    # ---------------------------------------------------------------------------
    # Factory helpers
    # ---------------------------------------------------------------------------

    @staticmethod
    def make_id(source: Source, source_url: str) -> str:
        """Deterministic ID — stable across re-syncs for the same item."""
        raw = f"{source.value}:{source_url}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
