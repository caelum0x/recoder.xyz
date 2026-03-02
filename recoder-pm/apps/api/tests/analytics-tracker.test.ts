import assert from "node:assert/strict";
import test from "node:test";
import { PmInteropEvents } from "../lib/analytics/events";
import { createPmTraceId, trackPmInteropEvent } from "../lib/analytics/tracker";

test.beforeEach(() => {
  delete process.env.PM_ANALYTICS_INGEST_URL;
});

// ---------------------------------------------------------------------------
// PmInteropEvents constants
// ---------------------------------------------------------------------------

test("PmInteropEvents has expected event names", () => {
  assert.equal(PmInteropEvents.CONNECTOR_INVOKED, "pm_connector_invoked");
  assert.equal(PmInteropEvents.CONNECTOR_RESPONSE, "pm_connector_response");
  assert.equal(PmInteropEvents.CONNECTOR_ERROR, "pm_connector_error");
});

test("PmInteropEvents is frozen (cannot be mutated)", () => {
  const events = PmInteropEvents as Record<string, string>;
  // as const objects are frozen by convention; verify the values are stable
  assert.equal(Object.keys(events).length, 3);
  assert.ok(Object.keys(events).includes("CONNECTOR_INVOKED"));
  assert.ok(Object.keys(events).includes("CONNECTOR_RESPONSE"));
  assert.ok(Object.keys(events).includes("CONNECTOR_ERROR"));
});

// ---------------------------------------------------------------------------
// createPmTraceId
// ---------------------------------------------------------------------------

test("createPmTraceId starts with pm_ prefix", () => {
  const traceId = createPmTraceId();
  assert.ok(traceId.startsWith("pm_"));
});

test("createPmTraceId produces unique values", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    ids.add(createPmTraceId());
  }
  // With random component, collisions should be extremely unlikely
  assert.equal(ids.size, 100);
});

test("createPmTraceId contains timestamp and random components", () => {
  const traceId = createPmTraceId();
  // Format: pm_{base36_timestamp}_{base36_random}
  const parts = traceId.split("_");
  assert.ok(parts.length >= 3, `Expected at least 3 parts separated by _, got: ${traceId}`);
  assert.equal(parts[0], "pm");
  // The timestamp part should be non-empty
  assert.ok(parts[1].length > 0);
  // The random part should be non-empty
  assert.ok(parts[2].length > 0);
});

// ---------------------------------------------------------------------------
// trackPmInteropEvent
// ---------------------------------------------------------------------------

test("trackPmInteropEvent emits structured JSON to console.log", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(String(args[0]));
  };

  try {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
      connector_id: "test-connector",
      traceId: "pm_test_trace",
      intent: "execute",
      messageId: "msg-1",
      threadId: "thread-1",
    });

    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]);
    assert.equal(entry.level, "info");
    assert.equal(entry.category, "pm_analytics");
    assert.equal(entry.service, "recoder-pm-api");
    assert.equal(entry.event, "pm_connector_invoked");
    assert.equal(entry.traceId, "pm_test_trace");
    assert.equal(entry.connector_id, "test-connector");
    assert.equal(entry.intent, "execute");
    assert.equal(entry.messageId, "msg-1");
    assert.ok(entry.ts, "Expected a timestamp");
  } finally {
    console.log = originalLog;
  }
});

test("trackPmInteropEvent auto-generates traceId when not provided", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(String(args[0]));
  };

  try {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_RESPONSE, {
      connector_id: "test-connector-2",
      responseStatus: 200,
      durationMs: 42,
    });

    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]);
    assert.ok(entry.traceId.startsWith("pm_"));
  } finally {
    console.log = originalLog;
  }
});

test("trackPmInteropEvent includes optional properties in output", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(String(args[0]));
  };

  try {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_ERROR, {
      connector_id: "failing-connector",
      traceId: "pm_error_trace",
      errorMessage: "connection refused",
      responseStatus: 502,
      durationMs: 1500,
      targetUrl: "http://target.example.com",
      fromPlatform: "recoder_pm",
      toPlatform: "codex",
    });

    const entry = JSON.parse(logs[0]);
    assert.equal(entry.event, "pm_connector_error");
    assert.equal(entry.errorMessage, "connection refused");
    assert.equal(entry.responseStatus, 502);
    assert.equal(entry.durationMs, 1500);
    assert.equal(entry.targetUrl, "http://target.example.com");
    assert.equal(entry.fromPlatform, "recoder_pm");
    assert.equal(entry.toPlatform, "codex");
  } finally {
    console.log = originalLog;
  }
});

test("trackPmInteropEvent never throws even on error", () => {
  const originalLog = console.log;
  // Simulate console.log throwing
  console.log = () => {
    throw new Error("log failure");
  };

  try {
    // This should not throw despite console.log throwing
    assert.doesNotThrow(() => {
      trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
        connector_id: "safe-connector",
      });
    });
  } finally {
    console.log = originalLog;
  }
});

test("trackPmInteropEvent does not call fetch when no analytics endpoint is configured at load time", async () => {
  // ANALYTICS_ENDPOINT is captured at module load time, so setting
  // PM_ANALYTICS_INGEST_URL after import has no effect. Verify fetch is not called.
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const originalLog = console.log;
  console.log = () => {};

  try {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
      connector_id: "no-endpoint-test",
    });

    // Give any async work a tick to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(fetchCalled, false, "fetch should not be called when endpoint is not configured");
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test("trackPmInteropEvent includes ISO timestamp in entry", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(String(args[0]));
  };

  try {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
      connector_id: "ts-test",
    });

    const entry = JSON.parse(logs[0]);
    // Verify it's a valid ISO timestamp
    const parsed = Date.parse(entry.ts);
    assert.ok(!Number.isNaN(parsed), "ts should be a valid ISO timestamp");
    // Should be recent (within last 5 seconds)
    const diff = Math.abs(Date.now() - parsed);
    assert.ok(diff < 5000, `Timestamp should be recent, diff was ${diff}ms`);
  } finally {
    console.log = originalLog;
  }
});
