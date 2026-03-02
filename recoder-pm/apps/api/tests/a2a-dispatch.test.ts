import assert from "node:assert/strict";
import test from "node:test";
import { __resetA2ATestState } from "../lib/a2a/gateway";
import { POST } from "../app/api/a2a/dispatch/route";

const SECRET = "test-dispatch-secret";

function validDispatchBody(overrides: Record<string, unknown> = {}) {
  return {
    targetUrl: "http://target.example.com/api/a2a/envelope",
    envelope: {
      envelopeVersion: "2026-02-14",
      protocolVersion: "0.3.0",
      messageId: `msg-dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      threadId: "thread-dispatch-1",
      createdAt: new Date().toISOString(),
      from: { id: "pm", name: "PM", platform: "recoder_pm" },
      to: { id: "target", name: "Target", platform: "custom" },
      intent: "execute",
      payload: [{ kind: "text", text: "dispatch-test" }],
    },
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/a2a/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.RECODER_A2A_SHARED_SECRET = SECRET;
  delete process.env.RECODER_A2A_EGRESS_ALLOWLIST;
  delete process.env.PM_ANALYTICS_INGEST_URL;
  __resetA2ATestState();
});

test("dispatch rejects invalid JSON body", async () => {
  const req = new Request("http://localhost/api/a2a/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json{",
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
});

test("dispatch rejects missing targetUrl", async () => {
  const res = await POST(makeRequest({ envelope: validDispatchBody().envelope }));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.ok(json.error.includes("targetUrl"));
});

test("dispatch rejects empty targetUrl", async () => {
  const res = await POST(makeRequest(validDispatchBody({ targetUrl: "   " })));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
});

test("dispatch rejects invalid envelope", async () => {
  const res = await POST(makeRequest({ targetUrl: "http://target.example.com", envelope: {} }));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.code, "INVALID_A2A_ENVELOPE");
});

test("dispatch rejects targetUrl not in egress allowlist", async () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST = "http://allowed.example.com";
  const body = validDispatchBody({
    targetUrl: "http://blocked.example.com/api",
  });
  const res = await POST(makeRequest(body));
  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.ok(json.error.includes("egress"));
});

test("dispatch forwards envelope to target and returns 200 on success", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = init?.headers as Record<string, string> | undefined;
    capturedHeaders = headers ?? {};
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const body = validDispatchBody();
    const res = await POST(makeRequest(body));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.status, 200);

    assert.equal(capturedUrl, body.targetUrl);
    assert.ok(capturedHeaders["x-recoder-a2a-agent-id"]);
    assert.ok(capturedHeaders["x-recoder-a2a-timestamp"]);
    assert.ok(capturedHeaders["x-recoder-a2a-signature"]);
    assert.ok(capturedHeaders["x-recoder-a2a-signature"].startsWith("v1="));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dispatch returns 502 when target responds with error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain" },
    })) as typeof fetch;

  try {
    const res = await POST(makeRequest(validDispatchBody()));
    assert.equal(res.status, 502);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.status, 500);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dispatch uses RECODER_A2A_AGENT_ID env as sender agent id", async () => {
  process.env.RECODER_A2A_AGENT_ID = "custom-pm-agent";
  const originalFetch = globalThis.fetch;
  let capturedAgentId = "";

  globalThis.fetch = (async (_input: string | URL | globalThis.Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    capturedAgentId = headers?.["x-recoder-a2a-agent-id"] ?? "";
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await POST(makeRequest(validDispatchBody()));
    assert.equal(capturedAgentId, "custom-pm-agent");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RECODER_A2A_AGENT_ID;
  }
});

test("dispatch defaults sender agent id to recoder-pm-api", async () => {
  delete process.env.RECODER_A2A_AGENT_ID;
  const originalFetch = globalThis.fetch;
  let capturedAgentId = "";

  globalThis.fetch = (async (_input: string | URL | globalThis.Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    capturedAgentId = headers?.["x-recoder-a2a-agent-id"] ?? "";
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await POST(makeRequest(validDispatchBody()));
    assert.equal(capturedAgentId, "recoder-pm-api");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dispatch allows target when in egress allowlist", async () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST = "http://target.example.com";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const body = validDispatchBody({
      targetUrl: "http://target.example.com/api/a2a/envelope",
    });
    const res = await POST(makeRequest(body));
    assert.equal(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
