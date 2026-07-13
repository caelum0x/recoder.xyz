"""Linear normalizer.

Converts a raw Linear GraphQL issue dict plus the detector output into a
``WorkSignal`` object ready for storage and AI handoff.

Usage:
    from normalizers.linearNormalizer import normalize
    signal = normalize(raw_issue, reason="Issue is blocked by: ...", priority="high")
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from models.workSignal import ItemType, Source, WorkSignal

# ---------------------------------------------------------------------------
# Priority mapping — Linear uses integers, WorkSignal uses strings
# ---------------------------------------------------------------------------
# Linear: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
_PRIORITY_MAP: dict[int, str] = {
    0: "low",
    1: "high",   # Urgent → high (most actionable)
    2: "high",
    3: "medium",
    4: "low",
}


def _map_priority(linear_priority: int) -> str:
    """Convert a Linear priority integer to a WorkSignal priority string."""
    return _PRIORITY_MAP.get(linear_priority, "medium")


# ---------------------------------------------------------------------------
# Template lookup — why_it_matters + recommended_next_action by reason keyword
# Mirrors the pattern in githubNormalizer so both are easy to extend.
# ---------------------------------------------------------------------------

_TEMPLATES: list[tuple[str, str, str]] = [
    (
        "blocked by",
        "This issue cannot progress until an upstream blocker is resolved. "
        "Every day it stays blocked delays the feature or fix it represents.",
        "Identify who owns the blocking issue, escalate if needed, and update "
        "this issue's status once the blocker is cleared.",
    ),
    (
        "no linked github pr",
        "A high-priority issue with no associated pull request suggests work "
        "has not started — or the PR exists but is not linked, making tracking impossible.",
        "Create a PR for this issue, or link the existing PR so progress is visible.",
    ),
    (
        "stuck in",
        "This issue has not moved status in an extended period and may have been "
        "deprioritised or forgotten.",
        "Triage the issue: confirm it is still relevant, reassign if needed, "
        "and set a concrete next step or due date.",
    ),
    (
        "no assignee",
        "Without an owner, no one is accountable for moving this issue forward.",
        "Assign the issue to an engineer and confirm a delivery target.",
    ),
]

_FALLBACK_MATTERS = "This issue is stuck and may be blocking team progress or a customer commitment."
_FALLBACK_ACTION = "Review the issue, identify the blocker, and take corrective action."


def _resolve_templates(detected_reason: str) -> tuple[str, str]:
    """Return (why_it_matters, recommended_next_action) for a given reason string."""
    reason_lower = detected_reason.lower()
    for keyword, matters, action in _TEMPLATES:
        if keyword in reason_lower:
            return matters, action
    return _FALLBACK_MATTERS, _FALLBACK_ACTION


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def normalize(raw_issue: dict, reason: str, priority: str) -> WorkSignal:
    """Convert a raw Linear issue dict + detector output into a WorkSignal.

    Args:
        raw_issue: Raw issue dict from ``LinearClient.fetch_issues()``.
                   Must contain at least ``id``, ``title``, ``url``,
                   ``state``, ``assignee``, ``priority``, ``createdAt``.
        reason:    Human-readable reason string from the Linear detector's
                   ``detect()`` function.
        priority:  Priority string from the detector (``"high"``/``"medium"``/``"low"``).
                   Overrides the mapped Linear priority when explicitly provided.

    Returns:
        A fully populated ``WorkSignal`` instance.
    """
    source_url: str = raw_issue.get("url", "")
    title: str = raw_issue.get("title", "(no title)")
    assignee: Optional[str] = (raw_issue.get("assignee") or {}).get("name")
    status: str = (raw_issue.get("state") or {}).get("name", "unknown")
    created_at = _parse_dt(raw_issue.get("createdAt"))

    # Use the detector-supplied priority; fall back to the Linear integer mapping
    # in case the caller does not override.
    resolved_priority = priority or _map_priority(raw_issue.get("priority", 0))

    why_it_matters, next_action = _resolve_templates(reason)

    return WorkSignal(
        id=WorkSignal.make_id(Source.LINEAR, source_url),
        source=Source.LINEAR,
        item_type=ItemType.ISSUE,
        title=title,
        source_url=source_url,
        assignee=assignee,
        status=status,
        detected_reason=reason,
        priority=resolved_priority,
        why_it_matters=why_it_matters,
        recommended_next_action=next_action,
        agent_handoff_prompt="",  # filled later by handoffPromptGenerator
        created_at=created_at,
        detected_at=datetime.now(tz=timezone.utc),
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_dt(value: Optional[str]) -> datetime:
    """Parse an ISO-8601 timestamp string into a timezone-aware datetime."""
    if not value:
        return datetime.now(tz=timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
