"""GitHub normalizer.

Converts a raw GitHub API dict (PR or issue) plus the detector output into a
``WorkSignal`` object ready for storage and AI handoff.

Usage:
    from normalizers.githubNormalizer import normalize_pr, normalize_issue
    signal = normalize_pr(raw_pr, reason="PR open too long", priority="medium")
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from models.workSignal import ItemType, Source, WorkSignal

# ---------------------------------------------------------------------------
# Template lookup — why_it_matters + recommended_next_action by reason keyword
# ---------------------------------------------------------------------------
# Keys are lowercase substrings matched against the detected_reason string.
# The first matching entry wins. Add more entries as new rules are added.

_TEMPLATES: list[tuple[str, str, str]] = [
    # (reason_keyword, why_it_matters, recommended_next_action)
    (
        "failing ci",
        "Failing checks block merging and may signal broken code landing in the branch. "
        "Other developers may be blocked waiting for this PR.",
        "Investigate the failing check-run logs, fix the root cause, and push a new commit.",
    ),
    (
        "approved but not merged",
        "The PR is approved and ready, but every day it stays unmerged increases the risk "
        "of merge conflicts and delays dependent work.",
        "Merge the PR now, or leave a comment explaining what is blocking the merge.",
    ),
    (
        "requested changes",
        "A reviewer has requested changes but the author has not responded. "
        "The PR is effectively stalled.",
        "Address the reviewer's feedback, push an update, and re-request review.",
    ),
    (
        "no review activity",
        "This PR has been open with no reviewer engagement. Dependent work may be waiting.",
        "Assign a reviewer or post in the team channel to request a review.",
    ),
    (
        "inactive",
        "This issue has had no activity for an extended period and may have been forgotten.",
        "Triage the issue: close it if no longer relevant, or reassign and set a target date.",
    ),
    (
        "no assignee",
        "Without an assignee, no one is accountable for this high-priority work.",
        "Assign the issue to an engineer and confirm a delivery date.",
    ),
]

_FALLBACK_MATTERS = "This item is stuck and may be blocking dependent work or team progress."
_FALLBACK_ACTION = "Review the item, identify the blocker, and take corrective action."


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

def normalize_pr(raw_pr: dict, reason: str, priority: str) -> WorkSignal:
    """Convert a raw GitHub PR dict + detector output into a WorkSignal.

    Args:
        raw_pr:   Raw PR dict from ``GitHubClient.fetch_pull_requests()``.
        reason:   Human-readable reason string from ``detect_pr()``.
        priority: Priority string (``"high"`` / ``"medium"`` / ``"low"``).

    Returns:
        A fully populated ``WorkSignal`` instance.
    """
    source_url: str = raw_pr.get("html_url", "")
    title: str = raw_pr.get("title", "(no title)")
    assignee: Optional[str] = (raw_pr.get("user") or {}).get("login")
    status: str = raw_pr.get("state", "open")
    created_at = _parse_dt(raw_pr.get("created_at"))

    why_it_matters, next_action = _resolve_templates(reason)

    return WorkSignal(
        id=WorkSignal.make_id(Source.GITHUB, source_url),
        source=Source.GITHUB,
        item_type=ItemType.PULL_REQUEST,
        title=title,
        source_url=source_url,
        assignee=assignee,
        status=status,
        detected_reason=reason,
        priority=priority,
        why_it_matters=why_it_matters,
        recommended_next_action=next_action,
        agent_handoff_prompt="",  # filled later by handoffPromptGenerator
        created_at=created_at,
        detected_at=datetime.now(tz=timezone.utc),
    )


def normalize_issue(raw_issue: dict, reason: str, priority: str) -> WorkSignal:
    """Convert a raw GitHub issue dict + detector output into a WorkSignal.

    Args:
        raw_issue: Raw issue dict from ``GitHubClient.fetch_issues()``.
        reason:    Human-readable reason string from ``detect_issue()``.
        priority:  Priority string.

    Returns:
        A fully populated ``WorkSignal`` instance.
    """
    source_url: str = raw_issue.get("html_url", "")
    title: str = raw_issue.get("title", "(no title)")
    assignee: Optional[str] = (raw_issue.get("assignee") or {}).get("login")
    status: str = raw_issue.get("state", "open")
    created_at = _parse_dt(raw_issue.get("created_at"))

    why_it_matters, next_action = _resolve_templates(reason)

    return WorkSignal(
        id=WorkSignal.make_id(Source.GITHUB, source_url),
        source=Source.GITHUB,
        item_type=ItemType.ISSUE,
        title=title,
        source_url=source_url,
        assignee=assignee,
        status=status,
        detected_reason=reason,
        priority=priority,
        why_it_matters=why_it_matters,
        recommended_next_action=next_action,
        agent_handoff_prompt="",
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
