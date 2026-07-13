"""GitHub signal detector.

Applies rule-based checks against raw GitHub PR and issue dicts to decide
whether an item is "stuck". Thresholds are read from environment variables so
they can be tuned without touching code.

Environment variables (with defaults):
    STALE_PR_DAYS    – days before an open PR is considered stale (default 5)
    STALE_ISSUE_DAYS – days before an open issue is considered stale (default 7)
"""

import os
from datetime import datetime, timezone
from typing import Optional, Tuple

# ---------------------------------------------------------------------------
# Thresholds — override via environment variables
# ---------------------------------------------------------------------------
STALE_PR_DAYS: int = int(os.getenv("STALE_PR_DAYS", "5"))
STALE_ISSUE_DAYS: int = int(os.getenv("STALE_ISSUE_DAYS", "7"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _days_since(iso_timestamp: Optional[str]) -> Optional[int]:
    """Return the number of days elapsed since an ISO-8601 timestamp.

    Returns ``None`` when the timestamp is missing or unparseable so callers
    can skip the item rather than crashing the whole sync on a malformed
    payload from the GitHub API.
    """
    if not iso_timestamp:
        return None
    try:
        created = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    now = datetime.now(tz=timezone.utc)
    return (now - created).days


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp, returning ``None`` if missing/invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _review_states(reviews: list) -> set:
    """Return the set of distinct review states present in a review list.

    Only the most recent review per user is considered, matching GitHub's
    own effective-review-state logic.
    """
    # Keep the latest review per reviewer
    latest: dict = {}
    for review in reviews:
        user = (review.get("user") or {}).get("login", "unknown")
        latest[user] = review.get("state", "")
    return set(latest.values())


def _checks_failing(check_runs: dict) -> bool:
    """Return True if any check run has a conclusion of 'failure' or 'timed_out'."""
    for run in check_runs.get("check_runs", []):
        if run.get("conclusion") in ("failure", "timed_out"):
            return True
    return False


# ---------------------------------------------------------------------------
# PR rules  (each returns a (reason, priority) tuple or None)
# ---------------------------------------------------------------------------

def _pr_open_too_long(pr: dict) -> Optional[Tuple[str, str]]:
    """PR has been open longer than STALE_PR_DAYS with no review activity."""
    reviews = pr.get("_reviews", [])
    if reviews:
        # There IS review activity — let other rules handle it.
        return None
    days = _days_since(pr.get("created_at"))
    if days is not None and days > STALE_PR_DAYS:
        return (
            f"PR open for {days} days with no review activity.",
            "high" if days > STALE_PR_DAYS * 2 else "medium",
        )
    return None


def _pr_failing_checks(pr: dict) -> Optional[Tuple[str, str]]:
    """PR has one or more failing or timed-out CI checks."""
    check_runs = pr.get("_check_runs", {})
    if _checks_failing(check_runs):
        return ("PR has failing CI checks.", "high")
    return None


def _pr_changes_requested_no_update(pr: dict) -> Optional[Tuple[str, str]]:
    """Reviewer requested changes but the author has not pushed an update."""
    reviews = pr.get("_reviews", [])
    states = _review_states(reviews)
    if "CHANGES_REQUESTED" not in states:
        return None
    # If the PR was updated after the last review we consider it addressed.
    # We use the PR's updated_at vs the timestamp of the CHANGES_REQUESTED review.
    pr_updated = _parse_iso(pr.get("updated_at"))
    # PENDING reviews carry ``submitted_at: null``; coerce missing timestamps to
    # an empty string so ``sorted`` never compares ``str`` against ``None``.
    for review in sorted(
        reviews,
        key=lambda r: r.get("submitted_at") or "",
        reverse=True,
    ):
        if review.get("state") == "CHANGES_REQUESTED":
            review_time = _parse_iso(review.get("submitted_at"))
            if review_time is None:
                # Cannot determine ordering without a review timestamp;
                # treat as still-unaddressed so the signal is not silently lost.
                return ("Reviewer requested changes — author has not responded.", "high")
            if pr_updated is None or pr_updated <= review_time:
                return ("Reviewer requested changes — author has not responded.", "high")
            break
    return None


def _pr_approved_not_merged(pr: dict) -> Optional[Tuple[str, str]]:
    """PR is approved but has not been merged."""
    reviews = pr.get("_reviews", [])
    states = _review_states(reviews)
    merged = pr.get("merged_at") is not None
    if "APPROVED" in states and not merged:
        days = _days_since(pr.get("created_at"))
        if days is not None and days > STALE_PR_DAYS:
            return (f"PR approved but not merged after {days} days.", "high")
    return None


# ---------------------------------------------------------------------------
# Issue rules
# ---------------------------------------------------------------------------

def _issue_inactive_too_long(issue: dict) -> Optional[Tuple[str, str]]:
    """Issue has had no activity for longer than STALE_ISSUE_DAYS."""
    updated_at = issue.get("updated_at") or issue.get("created_at")
    days = _days_since(updated_at)
    if days is not None and days > STALE_ISSUE_DAYS:
        return (
            f"Issue inactive for {days} days.",
            "high" if days > STALE_ISSUE_DAYS * 2 else "medium",
        )
    return None


def _high_priority_issue_no_assignee(issue: dict) -> Optional[Tuple[str, str]]:
    """High-priority issue (label contains 'priority: high' or 'P0'/'P1') has no assignee."""
    assignee = issue.get("assignee")
    if assignee:
        return None
    labels = [lbl.get("name", "").lower() for lbl in (issue.get("labels") or [])]
    high_priority_markers = {"priority: high", "p0", "p1", "critical", "urgent"}
    if any(marker in labels for marker in high_priority_markers):
        return ("High-priority issue has no assignee.", "high")
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Ordered list of (rule_fn, item_type) pairs.
# "pr" rules only run on PR dicts; "issue" rules only run on issue dicts.
PR_RULES = [
    _pr_failing_checks,          # check CI first — most actionable
    _pr_approved_not_merged,
    _pr_changes_requested_no_update,
    _pr_open_too_long,
]

ISSUE_RULES = [
    _high_priority_issue_no_assignee,
    _issue_inactive_too_long,
]


def detect_pr(pr: dict) -> Optional[Tuple[str, str]]:
    """Run all PR rules against a raw GitHub PR dict.

    Args:
        pr: Raw PR dict from ``GitHubClient.fetch_pull_requests()``, enriched
            with ``_reviews`` (list) and ``_check_runs`` (dict) by the caller.

    Returns:
        ``(reason, priority)`` tuple if the PR is stuck, ``None`` otherwise.
        The first matching rule wins.
    """
    for rule in PR_RULES:
        result = rule(pr)
        if result:
            return result
    return None


def detect_issue(issue: dict) -> Optional[Tuple[str, str]]:
    """Run all issue rules against a raw GitHub issue dict.

    Args:
        issue: Raw issue dict from ``GitHubClient.fetch_issues()``.

    Returns:
        ``(reason, priority)`` tuple if the issue is stuck, ``None`` otherwise.
        The first matching rule wins.
    """
    for rule in ISSUE_RULES:
        result = rule(issue)
        if result:
            return result
    return None
