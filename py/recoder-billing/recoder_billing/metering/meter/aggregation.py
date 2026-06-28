"""Usage meter aggregation. Fused from polar/meter/aggregation.py, owned by Recoder.

Polar's aggregation classes carry two parallel implementations: a SQLAlchemy column
builder (``get_sql_column`` / ``get_sql_clause``) used to roll up events in Postgres, and
a pure ``matches`` / ``is_summable`` used off the database. The *owned* spine keeps the
pure half — the part that decides which events an aggregation applies to, whether it can
be summed across groups, and how to actually compute a quantity from a set of events —
and makes it self-contained: no SQLAlchemy, no Pydantic discriminator, just dataclasses
over the owned :class:`~recoder_billing.metering.event.service.UsageEvent`.

The Postgres column builder is a host concern (it lives next to the DB layer that owns
the ``Event`` table); the owned aggregations expose :meth:`Aggregation.aggregate` so the
same definition can roll up an in-memory event batch identically to the SQL path.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from ..event.service import UsageEvent


class AggregationFunction(StrEnum):
    """The reduction a meter applies over matching events. Fused from Polar."""

    count = "count"
    sum = "sum"
    max = "max"
    min = "min"
    avg = "avg"
    unique = "unique"


def _strip_metadata_prefix(value: str) -> str:
    """Drop a leading ``metadata.`` so ``metadata.tokens`` and ``tokens`` are equal.

    Fused from Polar's ``_strip_metadata_prefix`` validator.
    """
    prefix = "metadata."
    return value[len(prefix) :] if value.startswith(prefix) else value


def _event_property(event: "UsageEvent", property: str) -> object | None:
    """Resolve a meter property off an event: a top-level field or a metadata key."""
    if property in ("name", "source", "timestamp"):
        return getattr(event, property, None)
    return event.metadata.get(property)


class Aggregation(Protocol):
    """An owned, pure meter aggregation over a set of usage events."""

    func: AggregationFunction

    def is_summable(self) -> bool:
        """Whether per-group results can be summed into a correct grand total."""
        ...

    def matches(self, event: "UsageEvent") -> bool:
        """Whether ``event`` contributes to this aggregation."""
        ...

    def aggregate(self, events: Iterable["UsageEvent"]) -> float:
        """Reduce the matching ``events`` to a single quantity."""
        ...


@dataclass(frozen=True)
class CountAggregation:
    """Count every matching event. Always summable; matches everything."""

    func: AggregationFunction = AggregationFunction.count

    def is_summable(self) -> bool:
        return True

    def matches(self, event: "UsageEvent") -> bool:
        return True

    def aggregate(self, events: Iterable["UsageEvent"]) -> float:
        return float(sum(1 for _ in events))


@dataclass(frozen=True)
class PropertyAggregation:
    """Sum/max/min/avg a numeric property across matching events. Fused from Polar.

    Only ``sum`` is summable across groups (max/min/avg are not). An event matches only
    when its resolved property is numeric — the same guard Polar's ``matches`` applies.
    """

    func: AggregationFunction
    property: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "property", _strip_metadata_prefix(self.property))
        if self.func not in (
            AggregationFunction.sum,
            AggregationFunction.max,
            AggregationFunction.min,
            AggregationFunction.avg,
        ):
            raise ValueError(
                f"PropertyAggregation does not support function {self.func}."
            )

    def is_summable(self) -> bool:
        return self.func == AggregationFunction.sum

    def matches(self, event: "UsageEvent") -> bool:
        value = _event_property(event, self.property)
        return isinstance(value, (int, float)) and not isinstance(value, bool)

    def _values(self, events: Iterable["UsageEvent"]) -> list[float]:
        values: list[float] = []
        for event in events:
            if not self.matches(event):
                continue
            value = _event_property(event, self.property)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values.append(float(value))
        return values

    def aggregate(self, events: Iterable["UsageEvent"]) -> float:
        values = self._values(events)
        if not values:
            return 0.0
        match self.func:
            case AggregationFunction.sum:
                return float(sum(values))
            case AggregationFunction.max:
                return float(max(values))
            case AggregationFunction.min:
                return float(min(values))
            case AggregationFunction.avg:
                return float(sum(values) / len(values))
            case _:  # pragma: no cover - guarded in __post_init__
                raise ValueError(f"Unsupported function {self.func}.")


@dataclass(frozen=True)
class UniqueAggregation:
    """Count distinct values of a property across matching events. Not summable."""

    property: str
    func: AggregationFunction = AggregationFunction.unique

    def __post_init__(self) -> None:
        object.__setattr__(self, "property", _strip_metadata_prefix(self.property))

    def is_summable(self) -> bool:
        return False

    def matches(self, event: "UsageEvent") -> bool:
        return True

    def aggregate(self, events: Iterable["UsageEvent"]) -> float:
        seen: set[object] = set()
        for event in events:
            value = _event_property(event, self.property)
            if value is not None:
                seen.add(value)
        return float(len(seen))


def aggregate_total(
    aggregation: Aggregation, events: Sequence["UsageEvent"]
) -> float:
    """Compute a meter total over ``events`` using ``aggregation``.

    The single entry point the meter service uses to roll up an event batch in memory,
    mirroring the Postgres aggregation the host runs for the durable path.
    """
    return aggregation.aggregate(events)


__all__ = [
    "Aggregation",
    "AggregationFunction",
    "CountAggregation",
    "PropertyAggregation",
    "UniqueAggregation",
    "aggregate_total",
]
