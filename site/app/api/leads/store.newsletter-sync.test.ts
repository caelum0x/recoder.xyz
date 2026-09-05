// Run from repo root: node --import tsx --test site/app/api/leads/store.newsletter-sync.test.ts
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveLead } from "./store";

let dataDir: string;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "leads-sync-test-"));
  process.env.LEADS_DATA_DIR = dataDir;
  delete process.env.LEADS_WEBHOOK_URL;
  process.env.APP_INTERNAL_URL = "http://app.test";
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.LEADS_DATA_DIR;
  delete process.env.APP_INTERNAL_URL;
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("saveLead newsletter sync", () => {
  it("forwards the captured email to the app newsletter endpoint", async () => {
    const fetchMock = mock.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const lead = await saveLead({ kind: "notify", email: "a@example.com", source: "download" });

    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, init] = fetchMock.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, "http://app.test/api/newsletter/subscribe");
    assert.equal(init.method, "POST");
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body, { email: "a@example.com", source: "lead-notify" });

    // The lead itself is durably on disk regardless of the sync.
    const stored = await fs.readFile(path.join(dataDir, "leads.ndjson"), "utf8");
    assert.ok(stored.includes(lead.id));
  });

  it("still stores the lead when the newsletter sync throws", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("app unreachable");
    }) as unknown as typeof fetch;

    const lead = await saveLead({ kind: "sales", email: "b@example.com" });

    const stored = await fs.readFile(path.join(dataDir, "leads.ndjson"), "utf8");
    assert.ok(stored.includes(lead.id));
    assert.ok(stored.includes("b@example.com"));
  });

  it("still stores the lead when the newsletter endpoint answers non-2xx", async () => {
    globalThis.fetch = mock.fn(
      async () => new Response("nope", { status: 429 }),
    ) as unknown as typeof fetch;

    const lead = await saveLead({ kind: "design-partner", email: "c@example.com" });

    const stored = await fs.readFile(path.join(dataDir, "leads.ndjson"), "utf8");
    assert.ok(stored.includes(lead.id));
  });
});
