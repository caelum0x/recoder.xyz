"""Resilience regression tests for the GitHub and Linear detectors.

These cover malformed-but-realistic API payloads that previously crashed the
detector (and therefore aborted the whole background sync). Each test exercises
an input shape GitHub/Linear can genuinely return.
"""

from __future__ import annotations

from detectors import githubSignalDetector as gh
from detectors import linearSignalDetector as lin


# ---------------------------------------------------------------------------
# GitHub detector — malformed payloads must not raise
# ---------------------------------------------------------------------------

def test_pr_open_too_long_handles_missing_created_at() -> None:
    # Previously raised KeyError('created_at').
    assert gh._pr_open_too_long({"_reviews": []}) is None


def test_changes_requested_handles_missing_submitted_at() -> None:
    # A CHANGES_REQUESTED review with no submitted_at previously raised KeyError.
    pr = {
        "updated_at": "2026-01-01T00:00:00Z",
        "_reviews": [{"state": "CHANGES_REQUESTED", "user": {"login": "a"}}],
    }
    assert gh._pr_changes_requested_no_update(pr) == (
        "Reviewer requested changes — author has not responded.",
        "high",
    )


def test_changes_requested_handles_pending_review_null_submitted_at() -> None:
    # A PENDING review carries submitted_at: null; sorting str against None
    # previously raised TypeError and killed the entire GitHub sync.
    pr = {
        "updated_at": "2026-06-20T00:00:00Z",
        "_reviews": [
            {
                "state": "CHANGES_REQUESTED",
                "submitted_at": "2026-06-25T00:00:00Z",
                "user": {"login": "a"},
            },
            {"state": "PENDING", "submitted_at": None, "user": {"login": "b"}},
        ],
    }
    assert gh._pr_changes_requested_no_update(pr) == (
        "Reviewer requested changes — author has not responded.",
        "high",
    )


def test_changes_requested_addressed_when_pr_updated_after_review() -> None:
    # Author pushed an update after the CHANGES_REQUESTED review -> not stuck.
    pr = {
        "updated_at": "2026-06-26T00:00:00Z",
        "_reviews": [
            {
                "state": "CHANGES_REQUESTED",
                "submitted_at": "2026-06-25T00:00:00Z",
                "user": {"login": "a"},
            },
        ],
    }
    assert gh._pr_changes_requested_no_update(pr) is None


def test_issue_inactive_handles_missing_timestamps() -> None:
    # Previously raised AttributeError on None.replace(...).
    assert gh._issue_inactive_too_long({}) is None


def test_days_since_handles_invalid_string() -> None:
    assert gh._days_since("not-a-date") is None
    assert gh._days_since(None) is None
    assert gh._days_since("") is None


# ---------------------------------------------------------------------------
# Linear detector — malformed payloads must not raise
# ---------------------------------------------------------------------------

def test_linear_days_since_handles_garbage() -> None:
    assert lin._days_since("garbage") is None
    assert lin._days_since(None) is None


def test_linear_stuck_in_status_handles_invalid_timestamp() -> None:
    issue = {"updatedAt": "garbage", "state": {"name": "In Progress"}}
    assert lin._issue_stuck_in_same_status(issue) is None


def test_linear_high_priority_no_pr_handles_invalid_created_at() -> None:
    issue = {"priority": 1, "createdAt": "garbage"}
    assert lin._high_priority_no_linked_pr(issue) is None
