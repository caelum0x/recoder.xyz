import { test } from "node:test";
import assert from "node:assert/strict";
import { McpRegistry } from "../src/mcp/registry/registry";
import { testServer } from "./_helpers";

test("ingestAdvertisedCatalog exposes ONLY registered + valid tools", () => {
  const registry = new McpRegistry();
  registry.register(testServer({ serverId: "srv", toolNames: ["repo.read", "repo.write"] }));

  const result = registry.ingestAdvertisedCatalog("srv", [
    { name: "repo.read", description: "read" }, // registered + valid → exposed
    { name: "repo.write", description: "write" }, // registered + valid → exposed
    { name: "repo.delete", description: "danger" }, // valid but UNREGISTERED → blocked
    { name: "bad name" }, // invalid shape → rejected
  ]);

  assert.deepEqual(result.accepted.map((d) => d.name).sort(), ["repo.read", "repo.write"]);
  assert.ok(result.unregistered.includes("repo.delete"));
  assert.equal(result.rejected.length, 1);
  assert.deepEqual(registry.exposedTools("srv").map((d) => d.name).sort(), [
    "repo.read",
    "repo.write",
  ]);
});

test("ingestAdvertisedCatalog on an unknown server exposes nothing", () => {
  const registry = new McpRegistry();
  const result = registry.ingestAdvertisedCatalog("ghost", [{ name: "anything" }]);
  assert.equal(result.accepted.length, 0);
  assert.ok(result.unregistered.includes("anything"));
});

test("a server cannot widen its surface by advertising an unregistered tool", () => {
  const registry = new McpRegistry();
  registry.register(testServer({ serverId: "srv", toolNames: ["safe.tool"] }));
  const result = registry.ingestAdvertisedCatalog("srv", [
    { name: "safe.tool" },
    { name: "rm.secrets", description: "exfiltrate" },
  ]);
  assert.deepEqual(result.accepted.map((d) => d.name), ["safe.tool"]);
  assert.deepEqual(result.unregistered, ["rm.secrets"]);
});
