"""Usage meter definition + quantity computation. Fused from polar/meter/service.py
(+ polar/meter/filter.py), owned by Recoder.

Polar's ``MeterService`` is ~600 lines of SQLAlchemy CTEs, Tinybird rollups, billing-
entry creation, and worker enqueues. The *owned* spine is the meter *definition* and the
quantity computation it implies:

- :class:`MeterFilter`: the event-matching predicate (a conjunction/disjunction of typed
  clauses), fused from Polar's pure ``Filter.matches`` — no SQLAlchemy.
- :class:`Meter`: a named filter + aggregation over an organization's events, with the
  archive guard Polar enforced (a meter that has already billed events can't have its
  filter/aggregation changed).
- :class:`MeterService`: ``define`` / ``update`` (with the same sensitive-field guard),
  and ``get_quantity`` — roll up the events matching a meter into a single quantity using
  the owned aggregation, identically to the Postgres path.

Durable persistence and the Tinybird/billing-entry pipeline are host concerns behind the
:class:`MeterRepository` port; the meter definition + matching + aggregation are owned and
testable here without a database.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol

from ...kit.utils import generate_uuid, utc_now
from ..event.service import UsageEvent
from .aggregation import Aggregation, aggregate_total


class FilterOperator(StrEnum):
    eq = "eq"
    ne = "ne"
    gt = "gt"
    gte = "gte"
    lt = "lt"
    lte = "lte"
    like = "like"
    not_like = "not_like"


class FilterConjunction(StrEnum):
    and_ = "and"
    or_ = "or"


def _strip_metadata_prefix(value: str) -> str:
    prefix = "metadata."
    return value[len(prefix) :] if value.startswith(prefix) else value


@dataclass(frozen=True)
class FilterClause:
    """A single ``property OP value`` predicate over an event. Fused from Polar's pure path."""

    property: str
    operator: FilterOperator
    value: str | int | bool

    def __post_init__(self) -> None:
        object.__setattr__(self, "property", _strip_metadata_prefix(self.property))

    def _actual(self, event: UsageEvent) -> Any:
        if self.property == "name":
            return event.name
        if self.property == "source":
            return event.source
        if self.property == "timestamp":
            return int(event.timestamp.timestamp())
        return event.metadata.get(self.property)

    def matches(self, event: UsageEvent) -> bool:
        """Whether ``event`` satisfies this clause. Verbatim semantics from Polar's ``matches``."""
        actual = self._actual(event)
        if actual is None and self.property not in ("name", "source", "timestamp"):
            return False
        try:
            match self.operator:
                case FilterOperator.eq:
                    return bool(actual == self.value)
                case FilterOperator.ne:
                    return bool(actual != self.value)
                case FilterOperator.gt:
                    return bool(actual > self.value)
                case FilterOperator.gte:
                    return bool(actual >= self.value)
                case FilterOperator.lt:
                    return bool(actual < self.value)
                case FilterOperator.lte:
                    return bool(actual <= self.value)
                case FilterOperator.like:
                    return str(self.value) in str(actual)
                case FilterOperator.not_like:
                    return str(self.value) not in str(actual)
        except TypeError:
            return False
        return False


@dataclass(frozen=True)
class MeterFilter:
    """A conjunction/disjunction of clauses (and nested filters). Fused from Polar's ``Filter``."""

    conjunction: FilterConjunction
    clauses: tuple["FilterClause | MeterFilter", ...] = ()

    def matches(self, event: UsageEvent) -> bool:
        results = [clause.matches(event) for clause in self.clauses]
        if not results:
            return True
        if self.conjunction == FilterConjunction.and_:
            return all(results)
        return any(results)

    @classmethod
    def match_all(cls) -> "MeterFilter":
        """A filter that matches every event (empty AND)."""
        return cls(conjunction=FilterConjunction.and_, clauses=())


@dataclass
class Meter:
    """A named filter + aggregation over an organization's usage events.

    ``last_billed_at`` is the watermark up to which events have been billed; once it is
    set the meter is "aggregating" and its filter/aggregation become immutable (Polar's
    sensitive-field guard) so historical bills can't be retroactively re-shaped.
    """

    organization_id: uuid.UUID
    name: str
    filter: MeterFilter
    aggregation: Aggregation

    id: uuid.UUID = field(default_factory=generate_uuid)
    last_billed_at: datetime | None = None
    archived_at: datetime | None = None
    created_at: datetime = field(default_factory=utc_now)

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    @property
    def is_aggregating(self) -> bool:
        """Whether the meter has already billed events (sensitive fields are now locked)."""
        return self.last_billed_at is not None

    def matches(self, event: UsageEvent) -> bool:
        """Whether ``event`` contributes to this meter (filter AND aggregation match)."""
        if event.organization_id != self.organization_id:
            return False
        return self.filter.matches(event) and self.aggregation.matches(event)


class MeterError(Exception):
    """Base error for meter operations."""


class MeterSensitiveFieldLocked(MeterError):
    """Raised when a filter/aggregation change is attempted on an aggregating meter."""

    def __init__(self, meter: Meter, fields: Sequence[str]) -> None:
        self.meter = meter
        self.fields = tuple(fields)
        super().__init__(
            "These fields can't be updated because the meter is already aggregating "
            f"events: {', '.join(self.fields)}."
        )


class MeterRepository(Protocol):
    """Durable persistence port for meters (satisfied by the host's DB layer)."""

    async def get(self, meter_id: uuid.UUID) -> Meter | None: ...

    async def save(self, meter: Meter) -> Meter: ...


class MeterService:
    """Owned meter definition + quantity computation over a repository port."""

    async def define(
        self,
        repository: MeterRepository,
        *,
        organization_id: uuid.UUID,
        name: str,
        filter: MeterFilter,
        aggregation: Aggregation,
    ) -> Meter:
        """Create a meter for an organization. Fused from Polar's ``create``."""
        meter = Meter(
            organization_id=organization_id,
            name=name,
            filter=filter,
            aggregation=aggregation,
        )
        return await repository.save(meter)

    async def update(
        self,
        repository: MeterRepository,
        meter_id: uuid.UUID,
        *,
        name: str | None = None,
        filter: MeterFilter | None = None,
        aggregation: Aggregation | None = None,
    ) -> Meter:
        """Update a meter, enforcing Polar's sensitive-field guard.

        ``name`` is always editable. ``filter`` / ``aggregation`` may only change while the
        meter has not yet billed any events; attempting to change them on an aggregating
        meter raises :class:`MeterSensitiveFieldLocked`.
        """
        meter = await self._require(repository, meter_id)

        if meter.is_aggregating:
            locked = [
                label
                for label, value in (("filter", filter), ("aggregation", aggregation))
                if value is not None
            ]
            if locked:
                raise MeterSensitiveFieldLocked(meter, locked)

        if name is not None:
            meter.name = name
        if filter is not None:
            meter.filter = filter
        if aggregation is not None:
            meter.aggregation = aggregation

        return await repository.save(meter)

    async def archive(
        self, repository: MeterRepository, meter_id: uuid.UUID
    ) -> Meter:
        """Archive a meter so it stops matching new events. Fused from Polar's ``archive``."""
        meter = await self._require(repository, meter_id)
        if not meter.is_archived:
            meter.archived_at = utc_now()
            meter = await repository.save(meter)
        return meter

    def matching_events(
        self, meter: Meter, events: Sequence[UsageEvent]
    ) -> list[UsageEvent]:
        """The subset of ``events`` this meter applies to."""
        return [event for event in events if meter.matches(event)]

    def get_quantity(self, meter: Meter, events: Sequence[UsageEvent]) -> float:
        """Roll up the events matching ``meter`` into a single quantity.

        Fuses Polar's ``get_quantity``: select the events the meter matches, then apply the
        meter's aggregation — the same reduction the Postgres path computes, run in memory.
        """
        matching = self.matching_events(meter, events)
        return aggregate_total(meter.aggregation, matching)

    async def _require(
        self, repository: MeterRepository, meter_id: uuid.UUID
    ) -> Meter:
        meter = await repository.get(meter_id)
        if meter is None:
            raise MeterError(f"Meter {meter_id} does not exist.")
        return meter


meter = MeterService()


__all__ = [
    "FilterClause",
    "FilterConjunction",
    "FilterOperator",
    "Meter",
    "MeterError",
    "MeterFilter",
    "MeterRepository",
    "MeterSensitiveFieldLocked",
    "MeterService",
    "meter",
]
