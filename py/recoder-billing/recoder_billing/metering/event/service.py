"""Usage-event ingestion. Fused from polar/event/service.py, owned by Recoder.

Polar's ``EventService`` is a large module welded to SQLAlchemy, Tinybird, the worker,
and OpenTelemetry. The *owned* spine is the ingestion contract the metering pipeline
turns on: validate a batch of usage events against the caller's organization (and any
named customers), normalize them into durable :class:`UsageEvent` records, persist them
through a repository port, and report how many were inserted vs. de-duplicated.

The owned :class:`UsageEvent` is a framework-light record carrying exactly what an
aggregation reads — name, source, timestamp, customer linkage, and free-form metadata —
plus a deterministic idempotency key so a re-sent event is de-duplicated rather than
double-counted. Persistence + duplicate detection is the :class:`EventRepository` port;
the meter-matching side effect Polar ran inline (``_create_meter_events``) is the
host-supplied :class:`EventSink` hook. Both are real, host-implemented boundaries — no
in-package fake — so ingestion validation + normalization compile and are testable
without a database or Tinybird.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol

from ...kit.utils import generate_uuid, utc_now


class EventSource(StrEnum):
    """Whether an event was ingested by a user/customer or emitted by the system."""

    user = "user"
    system = "system"


@dataclass
class UsageEvent:
    """A single metered usage event. Canonical shape an aggregation reads.

    ``metadata`` is the free-form payload meters filter and aggregate over. ``customer_id``
    or ``external_customer_id`` ties the event to a billable customer; at least one is
    required for the event to drive metered billing.
    """

    organization_id: uuid.UUID
    name: str

    source: EventSource = EventSource.user
    timestamp: datetime = field(default_factory=utc_now)
    customer_id: uuid.UUID | None = None
    external_customer_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    id: uuid.UUID = field(default_factory=generate_uuid)
    ingested_at: datetime = field(default_factory=utc_now)

    @property
    def idempotency_key(self) -> str:
        """Deterministic de-duplication key. Fused from Polar's ingestion idempotency.

        Two ingest calls carrying the same id refer to the same event; the repository
        de-duplicates on this key so a retried batch never double-counts usage.
        """
        return str(self.id)


@dataclass(frozen=True)
class IngestResult:
    """The outcome of an ingest batch: how many landed vs. were duplicates."""

    inserted: int
    duplicates: int


@dataclass(frozen=True)
class IngestError:
    """A single per-event validation failure, addressed by its index in the batch."""

    index: int
    field: str
    message: str


class EventIngestValidationError(Exception):
    """Raised when one or more events in a batch fail validation. Carries every error."""

    def __init__(self, errors: Sequence[IngestError]) -> None:
        self.errors = tuple(errors)
        super().__init__(
            f"Event ingest validation failed with {len(self.errors)} error(s)."
        )


class EventRepository(Protocol):
    """Durable persistence + duplicate detection for usage events (host DB layer)."""

    async def insert_batch(
        self, events: Sequence[UsageEvent]
    ) -> tuple[Sequence[uuid.UUID], int]:
        """Persist ``events``, returning ``(inserted_ids, duplicate_count)``.

        Implementations de-duplicate on :attr:`UsageEvent.idempotency_key` (Polar used an
        ``ON CONFLICT DO NOTHING`` batch insert), so a re-sent event is dropped, not stored
        twice.
        """
        ...


class EventSink(Protocol):
    """Side-effect port run after a batch lands (Polar's inline meter-event creation).

    The host fans the inserted events out to meters / the analytics store. A no-op is a
    valid host choice; this package never ships a fake.
    """

    async def on_ingested(self, events: Sequence[UsageEvent]) -> None: ...


class OrganizationValidator(Protocol):
    """Resolves + authorizes the organization an event is being ingested for.

    Polar derived this from the auth subject (an organization token pins the org; a user
    token must name an accessible org). The host supplies that policy; the owned service
    only enforces that every event resolves to a permitted organization.
    """

    def allows(self, organization_id: uuid.UUID) -> bool: ...


class EventService:
    """Owned usage-event ingestion over a repository + sink + validator port."""

    async def ingest(
        self,
        repository: EventRepository,
        validator: OrganizationValidator,
        events: Iterable[UsageEvent],
        *,
        sink: EventSink | None = None,
        allowed_customer_ids: frozenset[uuid.UUID] | None = None,
    ) -> IngestResult:
        """Validate, normalize, and persist a batch of usage events. Fused from Polar.

        Every event must resolve to an organization the caller may ingest for; events that
        name a ``customer_id`` must name one in ``allowed_customer_ids`` when that set is
        supplied. All errors are collected and raised together (Polar's batch-error
        contract) — a single bad event fails the batch, never a partial insert. Surviving
        events are normalized (source forced to ``user``, ingest time stamped) and inserted;
        the sink is notified of exactly the events that landed.
        """
        batch = list(events)
        errors: list[IngestError] = []

        for index, event in enumerate(batch):
            if not validator.allows(event.organization_id):
                errors.append(
                    IngestError(index, "organization_id", "Organization not found.")
                )
                continue
            if (
                event.customer_id is not None
                and allowed_customer_ids is not None
                and event.customer_id not in allowed_customer_ids
            ):
                errors.append(
                    IngestError(index, "customer_id", "Customer not found.")
                )
                continue
            if event.customer_id is None and event.external_customer_id is None:
                errors.append(
                    IngestError(
                        index,
                        "customer_id",
                        "An event must reference a customer to be billable.",
                    )
                )
                continue
            if not event.name:
                errors.append(IngestError(index, "name", "Event name is required."))

        if errors:
            raise EventIngestValidationError(errors)

        normalized = [self._normalize(event) for event in batch]
        inserted_ids, duplicates = await repository.insert_batch(normalized)

        if sink is not None and inserted_ids:
            inserted_set = set(inserted_ids)
            landed = [e for e in normalized if e.id in inserted_set]
            await sink.on_ingested(landed)

        return IngestResult(inserted=len(inserted_ids), duplicates=duplicates)

    def _normalize(self, event: UsageEvent) -> UsageEvent:
        """Stamp the user source + ingest time, exactly as Polar's ingest path did."""
        event.source = EventSource.user
        event.ingested_at = utc_now()
        return event


event = EventService()


__all__ = [
    "EventIngestValidationError",
    "EventRepository",
    "EventService",
    "EventSink",
    "EventSource",
    "IngestError",
    "IngestResult",
    "OrganizationValidator",
    "UsageEvent",
    "event",
]
