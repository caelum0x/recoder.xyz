"""Tests that the background sync isolates per-item failures.

A single malformed PR/issue must be logged and skipped, not abort the whole
sync. Before the fix, an exception while processing one item propagated out of
the fire-and-forget background task and dropped every later item silently.
"""

from __future__ import annotations

import asyncio

import pytest

import api.workSignalsRoutes as routes
from models.workSignal import ItemType, Source, WorkSignal
from storage.workSignalStore import store


def _clear_store() -> None:
    """Synchronously drain the (async) store between test phases."""
    asyncio.run(store.clear())


def _saved_urls() -> set[str]:
    """Collect source URLs of every stored signal (async store, sync caller)."""
    return {s.source_url for s in asyncio.run(store.get_all())}


def _count() -> int:
    return asyncio.run(store.count())


def _make_signal(url: str) -> WorkSignal:
    from datetime import datetime, timezone

    now = datetime.now(tz=timezone.utc)
    return WorkSignal(
        id=WorkSignal.make_id(Source.GITHUB, url),
        source=Source.GITHUB,
        item_type=ItemType.ISSUE,
        title="t",
        source_url=url,
        detected_reason="r",
        priority="high",
        why_it_matters="w",
        recommended_next_action="a",
        created_at=now,
        detected_at=now,
    )


def test_github_sync_skips_bad_issue_and_saves_good_one(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_REPO", "recoder/test")
    monkeypatch.setenv("GITHUB_TOKEN", "x")
    _clear_store()

    good_issue = {"number": 1, "html_url": "https://github.com/recoder/test/issues/1"}
    bad_issue = {"number": 2, "html_url": "https://github.com/recoder/test/issues/2"}

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_pull_requests(self, repo):
            return []

        async def fetch_issues(self, repo):
            return [bad_issue, good_issue]

    def fake_detect_issue(issue):
        if issue is bad_issue:
            raise RuntimeError("boom")
        return ("inactive", "high")

    def fake_normalize_issue(issue, reason, priority):
        return _make_signal(issue["html_url"])

    monkeypatch.setattr(routes, "GitHubClient", FakeClient)
    monkeypatch.setattr(routes.githubSignalDetector, "detect_issue", fake_detect_issue)
    monkeypatch.setattr(routes.githubNormalizer, "normalize_issue", fake_normalize_issue)

    asyncio.run(routes._sync_github())

    # The good issue must still be stored even though the bad one raised.
    saved_urls = _saved_urls()
    assert "https://github.com/recoder/test/issues/1" in saved_urls
    assert "https://github.com/recoder/test/issues/2" not in saved_urls
    _clear_store()


def test_github_sync_survives_fetch_failure(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_REPO", "recoder/test")
    monkeypatch.setenv("GITHUB_TOKEN", "x")
    _clear_store()

    class ExplodingClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_pull_requests(self, repo):
            raise RuntimeError("github down")

        async def fetch_issues(self, repo):
            raise RuntimeError("github down")

    monkeypatch.setattr(routes, "GitHubClient", ExplodingClient)

    # Must not raise — fetch failures are logged and the task returns cleanly.
    asyncio.run(routes._sync_github())
    assert _count() == 0
    _clear_store()


def test_linear_sync_skips_bad_issue(monkeypatch) -> None:
    team_id = "123e4567-e89b-12d3-a456-426614174000"
    monkeypatch.setenv("LINEAR_TEAM_ID", team_id)
    monkeypatch.setenv("LINEAR_API_KEY", "x")
    _clear_store()

    good = {"id": "g", "url": "https://linear.app/x/issue/G"}
    bad = {"id": "b", "url": "https://linear.app/x/issue/B"}

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def fetch_issues(self, team):
            return [bad, good]

    def fake_detect(issue):
        if issue is bad:
            raise RuntimeError("boom")
        return ("stuck in X", "high")

    def fake_normalize(issue, reason, priority):
        s = _make_signal(issue["url"])
        return s.model_copy(update={"source": Source.LINEAR})

    monkeypatch.setattr(routes, "LinearClient", FakeClient)
    monkeypatch.setattr(routes.linearSignalDetector, "detect", fake_detect)
    monkeypatch.setattr(routes.linearNormalizer, "normalize", fake_normalize)

    asyncio.run(routes._sync_linear())

    saved_urls = _saved_urls()
    assert "https://linear.app/x/issue/G" in saved_urls
    assert "https://linear.app/x/issue/B" not in saved_urls
    _clear_store()
