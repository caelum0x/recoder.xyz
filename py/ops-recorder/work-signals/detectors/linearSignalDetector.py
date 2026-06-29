"""Linear signal detector.

Applies rule-based checks against raw Linear issue dicts to decide whether
an issue is "stuck". Thresholds are read from environment variables so they
can be tuned without touching code.

Environment variables (with defaults):
    STALE_ISSUE_DAYS          – days before an issue is considered stale (default 7)
    LINEAR_NO_PR_DAYS         – days before a high-priority issue with no linked PR is flagged (default 3)
"""

import os
from datetime import datetime, timezone
from typing import Optional, Tuple

# ---------------------------------------------------------------------------
# Thresholds — override via environment variables
# ---------------------------------------------------------------------------
STALE_ISSUE_DAYS: int = int(os.getenv("STALE_ISSUE_DAYS", "7"))
LINEAR_NO_PR_DAYS: int = int(os.getenv("LINEAR_NO_PR_DAYS", "3"))

# Linear priority levels: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
HIGH_PRIORITY_LEVELS = {1, 2}  # Urgent + High


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _days_since(iso_timestamp: Optional[str]) -> Optional[int]:
    """Return the number of days elapsed since an ISO-8601 timestamp.

    Returns ``None`` when the timestamp is missing or unparseable so callers
    skip the item instead of crashing the whole sync on malformed API data.
    """
    if not iso_timestamp:
        return None
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    now = datetime.now(tz=timezone.utc)
    return (now - dt).days


def _is_high_priority(issue: dict) -> bool:
    """Return True if the issue has Urgent or High priority in Linear."""
    return issue.get("priority") in HIGH_PRIORITY_LEVELS


def _has_linked_pr(issue: dict) -> bool:
    """Return True if any relation or attachment points to a GitHub PR.

    Checks the ``relations`` field fetched from the GraphQL query. A relation
    is considered a PR link if its type is ``"related"`` and the related issue
    URL contains ``github.com`` or the relation type is ``"blocks"``/``"blocked by"``.
    Also checks for attachment URLs containing ``github.com/pull``.
    """
    relations = (issue.get("relations") or {}).get("nodes", [])
    for rel in relations:
        related = rel.get("relatedIssue") or {}
        url = related.get("url", "")
        if "github.com" in url:
            return True

    # Check attachments if present (some integrations populate this)
    attachments = (issue.get("attachments") or {}).get("nodes", [])
    for attachment in attachments:
        url = attachment.get("url", "")
        if "github.com/pull" in url or "github.com/issues" in url:
            return True

    return False


def _is_blocked_by_relation(issue: dict) -> bool:
    """Return True if the issue has a 'blocked by' relation that is still open."""
    relations = (issue.get("relations") or {}).get("nodes", [])
    for rel in relations:
        rel_type = (rel.get("type") or "").lower()
        if rel_type in ("blocked by", "blocked_by"):
            related = rel.get("relatedIssue") or {}
            state = (related.get("state") or {})
            state_type = (state.get("type") or "").lower()
            # If the blocking issue is not completed/cancelled, we are still blocked
            if state_type not in ("completed", "cancelled"):
                return True
    return False


# ---------------------------------------------------------------------------
# Issue rules  (each returns a (reason, priority) tuple or None)
# ---------------------------------------------------------------------------

def _issue_stuck_in_same_status(issue: dict) -> Optional[Tuple[str, str]]:
    """Issue has not moved from its current status for longer than STALE_ISSUE_DAYS."""
    updated_at = issue.get("updatedAt") or issue.get("createdAt")
    if not updated_at:
        return None
    days = _days_since(updated_at)
    if days is None:
        return None
    state_name = (issue.get("state") or {}).get("name", "unknown")
    if days > STALE_ISSUE_DAYS:
        return (
            f"Issue stuck in '{state_name}' for {days} days.",
            "high" if days > STALE_ISSUE_DAYS * 2 else "medium",
        )
    return None


def _issue_explicitly_blocked(issue: dict) -> Optional[Tuple[str, str]]:
    """Issue has an open 'blocked by' relation — something else is in the way."""
    if _is_blocked_by_relation(issue):
        blocking_titles = []
        for rel in (issue.get("relations") or {}).get("nodes", []):
            if (rel.get("type") or "").lower() in ("blocked by", "blocked_by"):
                related = rel.get("relatedIssue") or {}
                state_type = ((related.get("state") or {}).get("type") or "").lower()
                if state_type not in ("completed", "cancelled"):
                    title = related.get("title", "unknown issue")
                    blocking_titles.append(title)
        blocker_list = "; ".join(blocking_titles) if blocking_titles else "another issue"
        return (f"Issue is blocked by: {blocker_list}.", "high")
    return None


def _high_priority_no_linked_pr(issue: dict) -> Optional[Tuple[str, str]]:
    """High-priority issue has no linked GitHub PR after LINEAR_NO_PR_DAYS days."""
    if not _is_high_priority(issue):
        return None
    created_at = issue.get("createdAt")
    if not created_at:
        return None
    days = _days_since(created_at)
    if days is not None and days > LINEAR_NO_PR_DAYS and not _has_linked_pr(issue):
        priority_label = "Urgent" if issue.get("priority") == 1 else "High"
        return (
            f"{priority_label}-priority issue open {days} days with no linked GitHub PR.",
            "high",
        )
    return None


def _issue_no_assignee(issue: dict) -> Optional[Tuple[str, str]]:
    """Issue has no assignee — work cannot progress without one."""
    assignee = issue.get("assignee")
    if assignee:
        return None
    state_type = (issue.get("state") or {}).get("type", "").lower()
    # Skip completed or cancelled issues
    if state_type in ("completed", "cancelled"):
        return None
    priority = issue.get("priority", 0)
    priority_str = {1: "Urgent", 2: "High", 3: "Medium", 4: "Low"}.get(priority, "No priority")
    return (f"Issue has no assignee. Priority: {priority_str}.", "medium")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

ISSUE_RULES = [
    _issue_explicitly_blocked,        # most blocky — surface first
    _high_priority_no_linked_pr,      # high-value work with no visible progress
    _issue_stuck_in_same_status,      # general staleness
    _issue_no_assignee,               # unowned — least severe
]


def detect(issue: dict) -> Optional[Tuple[str, str]]:
    """Run all Linear rules against a raw Linear issue dict.

    Args:
        issue: Raw issue dict from ``LinearClient.fetch_issues()``, which must
               include the ``relations`` field for blocked detection.

    Returns:
        ``(reason, priority)`` tuple if the issue is stuck, ``None`` otherwise.
        The first matching rule wins.
    """
    for rule in ISSUE_RULES:
        result = rule(issue)
        if result:
            return result
    return None
