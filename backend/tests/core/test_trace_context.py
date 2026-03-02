"""
Unit tests for core.utils.trace_context (SFA-011).
"""

import pytest
from core.utils.trace_context import (
    TraceContext,
    parse_traceparent,
    generate_trace_id,
    generate_request_id,
    build_trace_context_from_headers,
    set_trace_context,
    get_trace_context,
    get_trace_id,
    get_request_id,
    get_response_meta,
)


# ---------------------------------------------------------------------------
# parse_traceparent
# ---------------------------------------------------------------------------

class TestParseTraceparent:
    def test_valid_traceparent(self):
        header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        trace_id, parent_id, flags = parse_traceparent(header)
        assert trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"
        assert parent_id == "00f067aa0ba902b7"
        assert flags == "01"

    def test_none_header(self):
        trace_id, parent_id, flags = parse_traceparent(None)
        assert trace_id is None
        assert parent_id is None
        assert flags == "00"

    def test_empty_header(self):
        trace_id, parent_id, flags = parse_traceparent("")
        assert trace_id is None

    def test_invalid_format(self):
        trace_id, parent_id, flags = parse_traceparent("not-a-valid-traceparent")
        assert trace_id is None

    def test_all_zero_trace_id_rejected(self):
        header = "00-00000000000000000000000000000000-00f067aa0ba902b7-01"
        trace_id, _, _ = parse_traceparent(header)
        assert trace_id is None

    def test_all_zero_parent_id_rejected(self):
        header = "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01"
        trace_id, _, _ = parse_traceparent(header)
        assert trace_id is None

    def test_case_insensitive(self):
        header = "00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01"
        trace_id, parent_id, flags = parse_traceparent(header)
        assert trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"

    def test_whitespace_stripped(self):
        header = "  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  "
        trace_id, _, _ = parse_traceparent(header)
        assert trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"


# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------

class TestIDGeneration:
    def test_trace_id_is_32_hex(self):
        tid = generate_trace_id()
        assert len(tid) == 32
        int(tid, 16)  # should not raise

    def test_request_id_is_uuid4(self):
        rid = generate_request_id()
        assert len(rid) == 36  # UUID with dashes
        import uuid
        uuid.UUID(rid, version=4)  # should not raise

    def test_unique(self):
        ids = {generate_trace_id() for _ in range(100)}
        assert len(ids) == 100


# ---------------------------------------------------------------------------
# build_trace_context_from_headers
# ---------------------------------------------------------------------------

class TestBuildTraceContext:
    def test_traceparent_takes_priority(self):
        w3c_trace = "4bf92f3577b34da6a3ce929d0e0e4736"
        ctx = build_trace_context_from_headers(
            headers={
                "traceparent": f"00-{w3c_trace}-00f067aa0ba902b7-01",
                "x-trace-id": "should-be-ignored",
            },
        )
        assert ctx.trace_id == w3c_trace
        assert ctx.parent_id == "00f067aa0ba902b7"

    def test_x_trace_id_fallback(self):
        ctx = build_trace_context_from_headers(
            headers={"x-trace-id": "my-custom-trace"},
        )
        assert ctx.trace_id == "my-custom-trace"

    def test_query_param_fallback(self):
        ctx = build_trace_context_from_headers(
            query_params={"trace_id": "from-query"},
        )
        assert ctx.trace_id == "from-query"

    def test_auto_generated_when_nothing_provided(self):
        ctx = build_trace_context_from_headers()
        assert ctx.trace_id is not None
        assert len(ctx.trace_id) == 32

    def test_request_id_always_new(self):
        ctx1 = build_trace_context_from_headers()
        ctx2 = build_trace_context_from_headers()
        assert ctx1.request_id != ctx2.request_id

    def test_connector_id_from_header(self):
        ctx = build_trace_context_from_headers(
            headers={"x-connector-id": "openclaw"},
        )
        assert ctx.connector_id == "openclaw"

    def test_connector_id_defaults_to_unknown(self):
        ctx = build_trace_context_from_headers()
        assert ctx.connector_id == "unknown"


# ---------------------------------------------------------------------------
# TraceContext serialisation
# ---------------------------------------------------------------------------

class TestTraceContextSerialization:
    def _make_ctx(self, **kwargs):
        defaults = {
            "trace_id": "abc123",
            "request_id": "req-456",
            "connector_id": "test-conn",
        }
        defaults.update(kwargs)
        return TraceContext(**defaults)

    def test_as_response_meta(self):
        ctx = self._make_ctx()
        meta = ctx.as_response_meta()
        assert meta["trace_id"] == "abc123"
        assert meta["request_id"] == "req-456"
        assert "timestamp" in meta
        assert meta["connector_id"] == "test-conn"

    def test_as_response_meta_omits_unknown_connector(self):
        ctx = self._make_ctx(connector_id="unknown")
        meta = ctx.as_response_meta()
        assert "connector_id" not in meta

    def test_as_log_fields(self):
        ctx = self._make_ctx(parent_id="parent-789")
        fields = ctx.as_log_fields()
        assert fields["trace_id"] == "abc123"
        assert fields["request_id"] == "req-456"
        assert fields["parent_id"] == "parent-789"
        assert fields["connector_id"] == "test-conn"

    def test_as_response_headers(self):
        ctx = self._make_ctx()
        hdrs = ctx.as_response_headers()
        assert hdrs["X-Trace-Id"] == "abc123"
        assert hdrs["X-Request-Id"] == "req-456"
        assert hdrs["X-Connector-Id"] == "test-conn"
        assert "trace-id" in hdrs["X-Interop-Metadata"]


# ---------------------------------------------------------------------------
# Context variable storage
# ---------------------------------------------------------------------------

class TestContextVarStorage:
    def test_set_and_get(self):
        ctx = TraceContext(trace_id="t1", request_id="r1")
        set_trace_context(ctx)
        assert get_trace_context() is ctx
        assert get_trace_id() == "t1"
        assert get_request_id() == "r1"

    def test_get_response_meta(self):
        ctx = TraceContext(trace_id="t2", request_id="r2")
        set_trace_context(ctx)
        meta = get_response_meta()
        assert meta["trace_id"] == "t2"
        assert meta["request_id"] == "r2"
        assert "timestamp" in meta
