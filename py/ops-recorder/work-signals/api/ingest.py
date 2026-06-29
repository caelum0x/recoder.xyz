"""Direct ingest surface for the Work Signals service.

The GitHub / Linear sync endpoints *pull* stuck work by polling those APIs with
service-owned tokens. This module adds the complementary *push* edge: it lets a
trusted caller (the Recoder ``docker-backend`` at the ``/work-signals`` ingress,
per INTEGRATION-PLAN §d.4 / WIRE-UP #10) hand a stuck-work item to this service
**directly**, without this service needing any GitHub / Linear credentials.

The contract is intentionally small and source-agnostic:

    POST /work-signals/ingest
        body: WorkSignalIngest   (see schema below)
        ->    WorkSignal         (normalized, handoff-generated, stored)

An ingested item flows through the exact same back half of the pipeline as a
synced item — normalize → generate handoff → store — so a pushed signal is
indistinguishable from a pulled one once stored. The only difference is that the
*detection* happened in the caller (the backend already knows the item is stuck)
instead of in this service's polling detectors.

This is purely additive: it does not change the GitHub / Linear sync paths, the
storage contract, or any existing route. Importing it never requires asyncpg or
any source-API token.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from handoff.handoffPromptGenerator import generate_handoff
from models.workSignal import ItemType, Source, WorkSignal

# ---------------------------------------------------------------------------
# Allowed priorities — kept aligned with WorkSignal.priority semantics and the
# PRIORITY_ORDER table in storage.workSignalRepository.
# ---------------------------------------------------------------------------

_ALLOWED_PRIORITIES = ("high", "medium", "low")

_FALLBACK_MATTERS = (
    "This item is stuck and may be blocking dependent work or team progress."
)
_FALLBACK_ACTION = (
    "Review the item, identify the blocker, and take corrective action."
)


class WorkSignalIngest(BaseModel):
    """Inbound payload for a single, already-detected stuck-work item.

    The caller has already decided this item is stuck, so it supplies the
    detection result (``detected_reason`` + ``priority``) directly. Everything
    the handoff prompt needs is either provided here or filled with a safe
    default, so this service never has to call back out to GitHub / Linear.
    """

    source: Source
    item_type: ItemType
    title: str = Field(..., min_length=1)
    source_url: str = Field(..., min_length=1)

    detected_reason: str = Field(..., min_length=1)
    priority: str

    # Optional context — defaults keep the prompt useful without them.
    assignee: Optional[str] = None
    status: Optional[str] = None
    why_it_matters: Optional[str] = None
    recommended_next_action: Optional[str] = None

    # Optional caller-supplied creation time (ISO-8601). Defaults to now.
    created_at: Optional[datetime] = None

    def normalized_priority(self) -> str:
        """Return a priority guaranteed to be one of high/medium/low.

        Unknown values degrade to ``"medium"`` rather than being rejected, so a
        slightly-off caller still produces a usable, correctly-sorted signal.
        """
        value = (self.priority or "").strip().lower()
        return value if value in _ALLOWED_PRIORITIES else "medium"


def ingest_to_signal(payload: WorkSignalIngest) -> WorkSignal:
    """Normalize an ingest payload into a stored-ready, handoff-filled WorkSignal.

    This mirrors what the source normalizers do for synced items, but reads
    from the explicit ingest contract instead of a raw GitHub / Linear dict.
    The returned signal already has ``agent_handoff_prompt`` populated, so the
    caller only needs to persist it.

    The ``id`` is the same deterministic ``(source, source_url)`` hash used by
    the sync path, so pushing the same item twice (or pushing an item that is
    later also pulled) is idempotent — it overwrites rather than duplicates.
    """
    created_at = payload.created_at or datetime.now(tz=timezone.utc)

    signal = WorkSignal(
        id=WorkSignal.make_id(payload.source, payload.source_url),
        source=payload.source,
        item_type=payload.item_type,
        title=payload.title,
        source_url=payload.source_url,
        assignee=payload.assignee,
        status=payload.status,
        detected_reason=payload.detected_reason,
        priority=payload.normalized_priority(),
        why_it_matters=payload.why_it_matters or _FALLBACK_MATTERS,
        recommended_next_action=payload.recommended_next_action or _FALLBACK_ACTION,
        agent_handoff_prompt="",  # filled immediately below
        created_at=created_at,
        detected_at=datetime.now(tz=timezone.utc),
    )

    # Generate the agent handoff prompt now so a single round-trip leaves the
    # signal fully ready for an agent to pick up.
    return generate_handoff(signal)
