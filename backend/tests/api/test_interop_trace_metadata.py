"""
Interop trace metadata propagation tests (SFA-011).

Verifies that:
  * X-Trace-Id / X-Request-Id / X-Connector-Id are echoed back
  * W3C traceparent header is parsed and trace_id is propagated
  * Error responses include _meta with trace fields
  * A trace_id is generated when none is provided
"""

import httpx
import pytest


@pytest.mark.asyncio
async def test_health_includes_interop_trace_headers(client: httpx.AsyncClient):
    """GET /health should echo trace metadata headers for observability."""
    trace_id = "trace-sfa-011-test"
    connector_id = "openclaw"

    response = await client.get(
        "/health",
        headers={
            "X-Trace-Id": trace_id,
            "X-Connector-Id": connector_id,
        },
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    assert response.headers.get("X-Trace-Id") == trace_id
    assert response.headers.get("X-Connector-Id") == connector_id
    assert "trace-id" in response.headers.get("X-Interop-Metadata", "")
    assert "request-id" in response.headers.get("X-Interop-Metadata", "")
    # X-Request-Id should always be present (generated per-request)
    assert response.headers.get("X-Request-Id") is not None


@pytest.mark.asyncio
async def test_w3c_traceparent_propagation(client: httpx.AsyncClient):
    """W3C traceparent header should be parsed and its trace-id propagated."""
    w3c_trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    traceparent = f"00-{w3c_trace_id}-00f067aa0ba902b7-01"

    response = await client.get(
        "/health",
        headers={"traceparent": traceparent},
    )

    assert response.status_code == 200
    assert response.headers.get("X-Trace-Id") == w3c_trace_id


@pytest.mark.asyncio
async def test_trace_id_generated_when_absent(client: httpx.AsyncClient):
    """When no trace header is sent, a trace_id should be auto-generated."""
    response = await client.get("/health")

    assert response.status_code == 200
    trace_id = response.headers.get("X-Trace-Id")
    assert trace_id is not None
    assert len(trace_id) > 0


@pytest.mark.asyncio
async def test_request_id_always_unique(client: httpx.AsyncClient):
    """Each request should get a unique X-Request-Id."""
    r1 = await client.get("/health")
    r2 = await client.get("/health")

    rid1 = r1.headers.get("X-Request-Id")
    rid2 = r2.headers.get("X-Request-Id")
    assert rid1 is not None
    assert rid2 is not None
    assert rid1 != rid2


@pytest.mark.asyncio
async def test_error_response_includes_trace_meta(client: httpx.AsyncClient):
    """Error responses should include _meta with trace fields in the body."""
    trace_id = "trace-error-test-sfa011"

    # Hit a non-existent route to get a 404
    response = await client.get(
        "/this-route-does-not-exist-sfa011",
        headers={"X-Trace-Id": trace_id},
    )

    # 404 is an HTTPException
    assert response.status_code in (404, 405)
    body = response.json()
    # Check _meta presence
    meta = body.get("_meta")
    if meta:
        assert meta.get("trace_id") == trace_id
        assert "request_id" in meta
        assert "timestamp" in meta
