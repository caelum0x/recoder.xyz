"""Usage metering: meter definitions + aggregation + usage-event ingestion.

Fused from polar/meter + polar/event. :mod:`.event` owns the usage-event shape and the
ingestion contract; :mod:`.meter` owns the meter definition (filter + aggregation) and
in-memory quantity computation. Durable persistence and the analytics pipeline are host
concerns behind the repository / sink ports.
"""

from .event.service import (
    EventIngestValidationError,
    EventRepository,
    EventService,
    EventSink,
    EventSource,
    IngestError,
    IngestResult,
    OrganizationValidator,
    UsageEvent,
    event,
)
from .meter.aggregation import (
    Aggregation,
    AggregationFunction,
    CountAggregation,
    PropertyAggregation,
    UniqueAggregation,
    aggregate_total,
)
from .meter.service import (
    FilterClause,
    FilterConjunction,
    FilterOperator,
    Meter,
    MeterError,
    MeterFilter,
    MeterRepository,
    MeterSensitiveFieldLocked,
    MeterService,
    meter,
)

__all__ = [
    "Aggregation",
    "AggregationFunction",
    "CountAggregation",
    "EventIngestValidationError",
    "EventRepository",
    "EventService",
    "EventSink",
    "EventSource",
    "FilterClause",
    "FilterConjunction",
    "FilterOperator",
    "IngestError",
    "IngestResult",
    "Meter",
    "MeterError",
    "MeterFilter",
    "MeterRepository",
    "MeterSensitiveFieldLocked",
    "MeterService",
    "OrganizationValidator",
    "PropertyAggregation",
    "UniqueAggregation",
    "UsageEvent",
    "aggregate_total",
    "event",
    "meter",
]
