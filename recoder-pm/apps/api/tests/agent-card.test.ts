import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/.well-known/agent-card.json/route";

test.beforeEach(() => {
  delete process.env.PM_API_PUBLIC_URL;
});

test("GET /.well-known/agent-card.json returns 200", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
});

test("agent card response has correct content-type", async () => {
  const res = await GET();
  const contentType = res.headers.get("content-type") ?? "";
  assert.ok(contentType.includes("application/json"));
});

test("agent card contains required top-level fields", async () => {
  const res = await GET();
  const card = await res.json();

  assert.equal(typeof card.name, "string");
  assert.ok(card.name.length > 0);
  assert.equal(typeof card.description, "string");
  assert.ok(card.description.length > 0);
  assert.equal(typeof card.protocolVersion, "string");
  assert.equal(typeof card.version, "string");
  assert.equal(typeof card.url, "string");
  assert.ok(card.url.startsWith("http"));
});

test("agent card has capabilities object with required booleans", async () => {
  const res = await GET();
  const card = await res.json();

  assert.ok(card.capabilities !== undefined);
  assert.equal(typeof card.capabilities.streaming, "boolean");
  assert.equal(typeof card.capabilities.pushNotifications, "boolean");
});

test("agent card has non-empty skills array", async () => {
  const res = await GET();
  const card = await res.json();

  assert.ok(Array.isArray(card.skills));
  assert.ok(card.skills.length > 0);
});

test("agent card skills have required properties", async () => {
  const res = await GET();
  const card = await res.json();

  for (const skill of card.skills) {
    assert.equal(typeof skill.id, "string");
    assert.equal(typeof skill.name, "string");
    assert.equal(typeof skill.description, "string");
    assert.ok(Array.isArray(skill.tags));
    assert.ok(skill.tags.length > 0);
    for (const tag of skill.tags) {
      assert.equal(typeof tag, "string");
    }
  }
});

test("agent card has defaultInputModes array", async () => {
  const res = await GET();
  const card = await res.json();

  assert.ok(Array.isArray(card.defaultInputModes));
  assert.ok(card.defaultInputModes.length > 0);
  assert.ok(card.defaultInputModes.includes("text"));
  assert.ok(card.defaultInputModes.includes("application/json"));
});

test("agent card has defaultOutputModes array", async () => {
  const res = await GET();
  const card = await res.json();

  assert.ok(Array.isArray(card.defaultOutputModes));
  assert.ok(card.defaultOutputModes.length > 0);
  assert.ok(card.defaultOutputModes.includes("text"));
  assert.ok(card.defaultOutputModes.includes("application/json"));
});

test("agent card url includes a2a envelope path", async () => {
  const res = await GET();
  const card = await res.json();

  assert.ok(card.url.includes("/api/a2a/envelope"));
});

test("agent card url uses custom base when PM_API_PUBLIC_URL is set", async () => {
  process.env.PM_API_PUBLIC_URL = "https://custom-pm.example.com/api";
  const res = await GET();
  const card = await res.json();

  assert.ok(card.url.startsWith("https://custom-pm.example.com/api"));
});

test("agent card uses default base url when PM_API_PUBLIC_URL is not set", async () => {
  delete process.env.PM_API_PUBLIC_URL;
  const res = await GET();
  const card = await res.json();

  assert.ok(card.url.startsWith("https://pm.recoder.xyz/api"));
});

test("agent card protocolVersion matches expected version", async () => {
  const res = await GET();
  const card = await res.json();

  assert.equal(card.protocolVersion, "0.3.0");
});

test("agent card version is a semver-like string", async () => {
  const res = await GET();
  const card = await res.json();

  assert.match(card.version, /^\d+\.\d+\.\d+$/);
});
