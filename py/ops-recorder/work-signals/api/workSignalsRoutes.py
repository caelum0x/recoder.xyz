"""Work Signals API routes.

Exposes the full WorkSignal pipeline — sync, detect, store, and handoff —
as a clean REST API via FastAPI.

Mount this router in main.py:
    from api.workSignalsRoutes import router
    app.include_router(router, prefix="/work-signals")
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from api.ingest import WorkSignalIngest, ingest_to_signal
from config import configured_github_repo, configured_linear_team_id, require_api_key
from detectors import githubSignalDetector, linearSignalDetector
from handoff.handoffPromptGenerator import generate_handoff
from integrations.githubClient import GitHubClient
from integrations.linearClient import LinearClient
from normalizers import githubNormalizer, linearNormalizer
from storage.workSignalStore import store
from models.workSignal import WorkSignal

logger = logging.getLogger("work_signals.sync")

router = APIRouter(tags=["work-signals"], dependencies=[Depends(require_api_key)])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class StatusUpdate(BaseModel):
    resolved: bool


class SyncResponse(BaseModel):
    status: str
    message: str


class IngestBatchResponse(BaseModel):
    status: str
    ingested: int
    ids: list[str]


class HandoffResponse(BaseModel):
    id: str
    agent_handoff_prompt: str


# ---------------------------------------------------------------------------
# Background sync tasks
# ---------------------------------------------------------------------------

async def _sync_github() -> None:
    """Full GitHub sync pipeline: fetch → enrich → detect → normalize → store.

    Runs as a fire-and-forget background task, so a failure here is invisible
    to the caller. Each item is processed in isolation: one malformed PR or
    issue is logged and skipped instead of aborting the whole sync, and any
    top-level fetch failure is logged rather than silently swallowed.
    """
    try:
        repo = configured_github_repo()
        client = GitHubClient()
    except Exception:
        logger.exception("GitHub sync aborted during setup")
        return

    # ── Pull requests ───────────────────────────────────────────────────────
    try:
        prs = await client.fetch_pull_requests(repo)
    except Exception:
        logger.exception("GitHub sync: failed to fetch pull requests for %s", repo)
        prs = []

    saved = 0
    for pr in prs:
        pr_ref = pr.get("number", "?")
        try:
            head_sha = (pr.get("head") or {}).get("sha", "")
            pr_number = pr.get("number")

            # Enrich with review and check data the detector needs
            pr["_reviews"] = (
                await client.fetch_pr_reviews(repo, pr_number) if pr_number else []
            )
            pr["_check_runs"] = (
                await client.fetch_pr_checks(repo, head_sha) if head_sha else {}
            )

            result = githubSignalDetector.detect_pr(pr)
            if result:
                reason, priority = result
                signal = githubNormalizer.normalize_pr(pr, reason, priority)
                signal = generate_handoff(signal)
                await store.save(signal)
                saved += 1
        except Exception:
            logger.exception("GitHub sync: skipping PR #%s due to processing error", pr_ref)

    # ── Issues ──────────────────────────────────────────────────────────────
    try:
        issues = await client.fetch_issues(repo)
    except Exception:
        logger.exception("GitHub sync: failed to fetch issues for %s", repo)
        issues = []

    for issue in issues:
        issue_ref = issue.get("number", "?")
        try:
            result = githubSignalDetector.detect_issue(issue)
            if result:
                reason, priority = result
                signal = githubNormalizer.normalize_issue(issue, reason, priority)
                signal = generate_handoff(signal)
                await store.save(signal)
                saved += 1
        except Exception:
            logger.exception(
                "GitHub sync: skipping issue #%s due to processing error", issue_ref
            )

    logger.info("GitHub sync for %s complete: %d signal(s) saved.", repo, saved)


async def _sync_linear() -> None:
    """Full Linear sync pipeline: fetch → detect → normalize → store.

    Runs as a fire-and-forget background task. Each issue is processed in
    isolation so one malformed issue does not abort the whole sync, and any
    fetch/setup failure is logged rather than silently swallowed.
    """
    try:
        team_id = configured_linear_team_id()
        client = LinearClient()
        issues = await client.fetch_issues(team_id)
    except Exception:
        logger.exception("Linear sync aborted during setup/fetch")
        return

    saved = 0
    for issue in issues:
        issue_ref = issue.get("id", "?")
        try:
            result = linearSignalDetector.detect(issue)
            if result:
                reason, priority = result
                signal = linearNormalizer.normalize(issue, reason, priority)
                signal = generate_handoff(signal)
                await store.save(signal)
                saved += 1
        except Exception:
            logger.exception(
                "Linear sync: skipping issue %s due to processing error", issue_ref
            )

    logger.info("Linear sync for team %s complete: %d signal(s) saved.", team_id, saved)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[WorkSignal])
async def get_all_signals() -> list[WorkSignal]:
    """Return all detected WorkSignals, sorted by priority then detection time."""
    return await store.get_all()


@router.get("/{signal_id}", response_model=WorkSignal)
async def get_signal(signal_id: str) -> WorkSignal:
    """Return a single WorkSignal by its ID."""
    signal = await store.get(signal_id)
    if signal is None:
        raise HTTPException(status_code=404, detail=f"Signal '{signal_id}' not found.")
    return signal


@router.post("/sync/github", response_model=SyncResponse)
async def sync_github(background_tasks: BackgroundTasks) -> SyncResponse:
    """Trigger a GitHub sync in the background.

    Fetches open PRs and issues from the configured repo, runs detectors,
    normalizes results, generates handoff prompts, and stores signals.
    Returns immediately — check ``GET /work-signals`` after a few seconds.
    """
    repo = configured_github_repo()
    background_tasks.add_task(_sync_github)
    return SyncResponse(
        status="accepted",
        message=f"GitHub sync started for repo '{repo}'. Poll GET /work-signals for results.",
    )


@router.post("/sync/linear", response_model=SyncResponse)
async def sync_linear(background_tasks: BackgroundTasks) -> SyncResponse:
    """Trigger a Linear sync in the background.

    Fetches open issues for the configured team, runs detectors, normalizes
    results, generates handoff prompts, and stores signals.
    Returns immediately — check ``GET /work-signals`` after a few seconds.
    """
    team_id = configured_linear_team_id()
    background_tasks.add_task(_sync_linear)
    return SyncResponse(
        status="accepted",
        message=f"Linear sync started for team '{team_id}'. Poll GET /work-signals for results.",
    )


@router.post("/ingest", response_model=WorkSignal, status_code=201)
async def ingest_signal(payload: WorkSignalIngest) -> WorkSignal:
    """Ingest a single, already-detected stuck-work item.

    The complement to the GitHub / Linear *sync* endpoints: instead of this
    service polling for stuck work, a trusted caller (the Recoder backend at
    the ``/work-signals`` ingress) pushes a stuck item it has already detected.
    The item is normalized, given an agent handoff prompt, stored, and returned.

    The signal ``id`` is the deterministic ``(source, source_url)`` hash, so
    ingesting the same item more than once is idempotent (overwrite, not
    duplicate).
    """
    signal = ingest_to_signal(payload)
    await store.save(signal)
    return signal


@router.post("/ingest/batch", response_model=IngestBatchResponse, status_code=201)
async def ingest_signals_batch(payload: list[WorkSignalIngest]) -> IngestBatchResponse:
    """Ingest a batch of already-detected stuck-work items in one call.

    Each item is normalized + handoff-generated, then the batch is persisted via
    the backend's ``save_many``. Returns the stored signal ids in input order.
    Duplicate ids within the batch collapse to a single stored signal.
    """
    signals = [ingest_to_signal(item) for item in payload]
    await store.save_many(signals)
    return IngestBatchResponse(
        status="ingested",
        ingested=len(signals),
        ids=[s.id for s in signals],
    )


@router.post("/{signal_id}/generate-handoff", response_model=HandoffResponse)
async def generate_signal_handoff(signal_id: str) -> HandoffResponse:
    """(Re-)generate the agent handoff prompt for a specific signal.

    Useful for regenerating after a signal is updated, or for testing
    the prompt output without running a full sync.
    """
    signal = await store.get(signal_id)
    if signal is None:
        raise HTTPException(status_code=404, detail=f"Signal '{signal_id}' not found.")

    updated = generate_handoff(signal)
    await store.save(updated)

    return HandoffResponse(id=updated.id, agent_handoff_prompt=updated.agent_handoff_prompt)


@router.patch("/{signal_id}/status", response_model=dict[str, Any])
async def update_signal_status(signal_id: str, body: StatusUpdate) -> dict[str, Any]:
    """Mark a WorkSignal as resolved or re-open it.

    Args:
        signal_id: The signal ID to update.
        body:      JSON body with ``{ "resolved": true | false }``.
    """
    updated = await store.update_resolved(signal_id, body.resolved)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Signal '{signal_id}' not found.")
    return {"id": signal_id, "resolved": body.resolved, "status": "updated"}
