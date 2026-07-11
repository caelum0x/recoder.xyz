import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAuthority } from "./memory-authority";
import type { Mem0Transport, Mem0Response } from "./mem0-memory";

// ---- helpers ---------------------------------------------------------------

const ok = (text: string): Mem0Response => ({ ok: true, status: 200, text });

/** A transport that always returns an empty results array. */
const emptyTransport: Mem0Transport = async () =>
  ok(JSON.stringify({ results: [] }));

/** A transport that always throws (simulates unreachable service). */
const downTransport: Mem0Transport = async () => {
  throw new Error("ECONNREFUSED");
};

// ---- in-process default (no service URL) -----------------------------------

test("no MEM0_SERVICE_URL → pure in-process memory: remember + recall work", async () => {
  const mem = createMemoryAuthority({ serviceUrl: "" });
  await mem.remember("recoder ships daily");
  const rows = await mem.recall("ships", 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.text, "recoder ships daily");
});

test("pure in-process: recall degrades to [] on an empty store (no throw)", async () => {
  const mem = createMemoryAuthority({ serviceUrl: "" });
  const rows = await mem.recall("anything", 5);
  assert.deepEqual(rows, []);
});

test("pure in-process: remember never throws (degrade-safe)", async () => {
  const mem = createMemoryAuthority({ serviceUrl: "" });
  await assert.doesNotReject(() => mem.remember("x"));
});

// ---- with service loopback wired -------------------------------------------

test("with service URL: remember writes to both stores (captures loopback request)", async () => {
  let loopbackBody = "";
  const capturingTransport: Mem0Transport = async (req) => {
    loopbackBody = req.body;
    return ok(JSON.stringify({ results: [] }));
  };

  const mem = createMemoryAuthority({
    serviceUrl: "http://mem0:8888",
    serviceOptions: { transport: capturingTransport, userId: "test" },
  });

  await mem.remember("deployed to Hetzner", { kind: "ops" });

  // The loopback received the write (POST /memories shape).
  const parsed = JSON.parse(loopbackBody) as Record<string, unknown>;
  assert.deepEqual(
    (parsed["messages"] as Array<{ role: string; content: string }>)[0]!.content,
    "deployed to Hetzner",
  );
  assert.deepEqual(parsed["metadata"], { kind: "ops" });
});

test("with service URL: recall merges service + in-process results (service first)", async () => {
  // The service returns one hit; the in-process store also has one hit (different text).
  const serviceTransport: Mem0Transport = async (req) => {
    const body = JSON.parse(req.body) as Record<string, unknown>;
    if (String(req.url).includes("/search")) {
      return ok(
        JSON.stringify({
          results: [{ id: "svc-1", memory: "service memory about auth", score: 0.95 }],
        }),
      );
    }
    return ok("{}");
  };

  const mem = createMemoryAuthority({
    serviceUrl: "http://mem0:8888",
    serviceOptions: { transport: serviceTransport, userId: "test" },
  });

  // Write something only in-process (the transport intercepts /memories but we
  // also need the in-process write to happen first via remember).
  await mem.remember("in-process memory about auth");

  const rows = await mem.recall("auth", 10);

  // Service result is present.
  assert.ok(
    rows.some((r) => r.id === "svc-1"),
    "service result must be present",
  );
  // In-process result is also present (different id).
  assert.ok(
    rows.some((r) => r.text === "in-process memory about auth"),
    "in-process result must be present",
  );
});

test("with service URL: recall degrades to in-process only when loopback throws (no throw)", async () => {
  const mem = createMemoryAuthority({
    serviceUrl: "http://mem0:8888",
    serviceOptions: { transport: downTransport, userId: "test" },
  });

  await mem.remember("fact A");

  // Even though the service is down, recall must still return in-process results.
  const rows = await mem.recall("fact", 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.text, "fact A");
});

test("with service URL: remember never throws when loopback is down (degrade-safe)", async () => {
  const mem = createMemoryAuthority({
    serviceUrl: "http://mem0:8888",
    serviceOptions: { transport: downTransport },
  });
  await assert.doesNotReject(() => mem.remember("x"));
});

test("recall respects limit across merged results", async () => {
  const serviceTransport: Mem0Transport = async () =>
    ok(
      JSON.stringify({
        results: [
          { id: "s1", memory: "service-hit-one" },
          { id: "s2", memory: "service-hit-two" },
        ],
      }),
    );

  const mem = createMemoryAuthority({
    serviceUrl: "http://mem0:8888",
    serviceOptions: { transport: serviceTransport, userId: "test" },
  });
  await mem.remember("in-process-hit");

  // limit=2 must cap the merged output even though 3 items are available.
  const rows = await mem.recall("hit", 2);
  assert.equal(rows.length, 2);
});

test("empty serviceUrl forces pure in-process even if env vars are set (explicit override)", async () => {
  // Temporarily set the env var — the explicit empty string must win.
  const originalEnv = process.env["MEM0_SERVICE_URL"];
  process.env["MEM0_SERVICE_URL"] = "http://should-not-be-used:9999";
  try {
    const mem = createMemoryAuthority({ serviceUrl: "" });
    await mem.remember("local fact");
    const rows = await mem.recall("local", 5);
    assert.equal(rows.length, 1, "should find from in-process, not fail");
  } finally {
    if (originalEnv === undefined) {
      delete process.env["MEM0_SERVICE_URL"];
    } else {
      process.env["MEM0_SERVICE_URL"] = originalEnv;
    }
  }
});
