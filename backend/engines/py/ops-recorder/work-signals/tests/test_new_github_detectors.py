"""Unit tests for the new GitHub PR detectors (merge-conflict + stale-draft).

These cover the two rules added to the signals capability. They operate on raw
GitHub PR dicts exactly as the sync pipeline enriches them, and assert both the
positive detection and the no-false-positive path.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from detectors import githubSignalDetector as gh


def _days_ago(days: int) -> str:
    return (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# _pr_merge_conflict
# ---------------------------------------------------------------------------

def test_merge_conflict_via_mergeable_false() -> None:
    reason, priority = gh._pr_merge_conflict({"mergeable": False})
    assert "merge conflicts" in reason
    assert priority == "high"


def test_merge_conflict_via_dirty_state() -> None:
    assert gh._pr_merge_conflict({"mergeable_state": "dirty"}) is not None


def test_no_merge_conflict_when_clean() -> None:
    assert gh._pr_merge_conflict({"mergeable": True, "mergeable_state": "clean"}) is None
    assert gh._pr_merge_conflict({}) is None


def test_detect_pr_surfaces_merge_conflict_before_staleness() -> None:
    pr = {"mergeable_state": "dirty", "created_at": _days_ago(30), "_reviews": []}
    result = gh.detect_pr(pr)
    assert result is not None and "merge conflicts" in result[0]


# ---------------------------------------------------------------------------
# _pr_draft_open_too_long
# ---------------------------------------------------------------------------

def test_stale_draft_flagged_medium() -> None:
    pr = {"draft": True, "created_at": _days_ago(gh.STALE_PR_DAYS + 1)}
    result = gh._pr_draft_open_too_long(pr)
    assert result is not None
    assert "Draft PR open" in result[0]
    assert result[1] == "medium"


def test_very_stale_draft_escalates_to_high() -> None:
    pr = {"draft": True, "created_at": _days_ago(gh.STALE_PR_DAYS * 2 + 1)}
    assert gh._pr_draft_open_too_long(pr)[1] == "high"


def test_fresh_draft_not_flagged() -> None:
    pr = {"draft": True, "created_at": _days_ago(0)}
    assert gh._pr_draft_open_too_long(pr) is None


def test_non_draft_ignored_by_draft_rule() -> None:
    pr = {"draft": False, "created_at": _days_ago(30)}
    assert gh._pr_draft_open_too_long(pr) is None


def test_draft_rule_tolerates_missing_created_at() -> None:
    assert gh._pr_draft_open_too_long({"draft": True}) is None
