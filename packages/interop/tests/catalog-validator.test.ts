import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateToolDescriptor,
  validateToolCatalog,
  validateResourceDescriptor,
  validatePromptDescriptor,
  CATALOG_LIMITS,
} from "../src/mcp/registry/catalog-validator";

test("validateToolDescriptor accepts a clean descriptor and sanitizes description", () => {
  const result = validateToolDescriptor(
    { name: "repo.read", description: "  Read a file  ", inputSchema: { type: "object" } },
    0,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.descriptor.name, "repo.read");
    assert.equal(result.descriptor.description, "Read a file");
    assert.deepEqual(result.descriptor.inputSchema, { type: "object" });
  }
});

test("validateToolDescriptor rejects a non-object", () => {
  const result = validateToolDescriptor("not-an-object", 0);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.rejection.field, "shape");
});

test("validateToolDescriptor rejects a missing/empty name", () => {
  assert.equal(validateToolDescriptor({ description: "x" }, 0).ok, false);
  assert.equal(validateToolDescriptor({ name: "" }, 0).ok, false);
});

test("validateToolDescriptor rejects a name with shell metacharacters (injection defense)", () => {
  const bad = ["rm; rm -rf /", "tool`whoami`", "a|b", "a b", "a$(x)", "a>b"];
  for (const name of bad) {
    const result = validateToolDescriptor({ name }, 0);
    assert.equal(result.ok, false, `expected reject for ${name}`);
    if (!result.ok) assert.equal(result.rejection.field, "name");
  }
});

test("validateToolDescriptor rejects an over-length name", () => {
  const name = "a".repeat(CATALOG_LIMITS.maxNameLength + 1);
  const result = validateToolDescriptor({ name }, 0);
  assert.equal(result.ok, false);
});

test("validateToolDescriptor truncates an over-length description (prompt-poison defense)", () => {
  const description = "x".repeat(CATALOG_LIMITS.maxDescriptionLength + 500);
  const result = validateToolDescriptor({ name: "ok", description }, 0);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.descriptor.description.length, CATALOG_LIMITS.maxDescriptionLength);
  }
});

test("validateToolDescriptor strips control characters from description", () => {
  // NUL + BEL + an ANSI escape sequence injected into the self-description.
  const dirty = `line1${String.fromCharCode(0)}${String.fromCharCode(7)}line2`;
  const result = validateToolDescriptor({ name: "ok", description: dirty }, 0);
  assert.equal(result.ok, true);
  if (result.ok) {
    const hasControl = [...result.descriptor.description].some(
      (ch) => ch.charCodeAt(0) < 0x20,
    );
    assert.equal(hasControl, false);
  }
});

test("validateToolDescriptor rejects a non-string description and non-object inputSchema", () => {
  assert.equal(validateToolDescriptor({ name: "ok", description: 42 }, 0).ok, false);
  assert.equal(validateToolDescriptor({ name: "ok", inputSchema: [] }, 0).ok, false);
});

test("validateToolCatalog rejects a malformed catalog entry but keeps the good ones", () => {
  const result = validateToolCatalog([
    { name: "good.one", description: "fine" },
    { name: "bad name with spaces" },
    "totally-malformed",
    { name: "good.two" },
  ]);
  assert.equal(result.accepted.length, 2);
  assert.deepEqual(
    result.accepted.map((d) => d.name).sort(),
    ["good.one", "good.two"],
  );
  assert.equal(result.rejected.length, 2);
});

test("validateToolCatalog rejects duplicate tool names (no ambiguous handler key)", () => {
  const result = validateToolCatalog([{ name: "dup" }, { name: "dup" }]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0]?.reason.includes("Duplicate"), true);
});

test("validateToolCatalog rejects a non-array catalog", () => {
  const result = validateToolCatalog({ tools: [] });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
});

test("validateResourceDescriptor validates uri + name, rejects junk", () => {
  assert.ok(validateResourceDescriptor({ uri: "file://a", name: "A", mimeType: "text/plain" }));
  assert.equal(validateResourceDescriptor({ uri: "", name: "A" }), null);
  assert.equal(validateResourceDescriptor({ uri: "file://a" }), null);
  assert.equal(validateResourceDescriptor("nope"), null);
});

test("validatePromptDescriptor validates name + cleans arguments", () => {
  const ok = validatePromptDescriptor({
    name: "summarize",
    description: "Summarize text",
    arguments: [{ name: "text", required: true }, { name: "", required: false }, "junk"],
  });
  assert.ok(ok);
  assert.equal(ok?.arguments?.length, 1);
  assert.equal(ok?.arguments?.[0]?.name, "text");
  assert.equal(validatePromptDescriptor({ name: "bad name" }), null);
});
