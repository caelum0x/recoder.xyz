import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  buildPalServerConfig,
  palServerAvailability,
  defaultPalPythonPath,
  PAL_TOOL_NAMES,
  PAL_SERVER_ID,
} from "../src/mcp/external/pal-server";
import { ExternalMcpProcessManager } from "../src/mcp/external/process-manager";

test("buildPalServerConfig produces a well-formed external server config", () => {
  const config = buildPalServerConfig({ rootDir: "/opt/py/pal-mcp-server" });
  assert.equal(config.serverId, PAL_SERVER_ID);
  assert.equal(config.cwd, "/opt/py/pal-mcp-server");
  assert.deepEqual(config.args, ["server.py"]);
  assert.equal(config.command, defaultPalPythonPath("/opt/py/pal-mcp-server"));
  // All 18 real PAL tools are present in the trusted allowlist.
  assert.equal(config.toolNames.length, 18);
  assert.deepEqual([...config.toolNames].sort(), [...PAL_TOOL_NAMES].sort());
  for (const tool of ["chat", "thinkdeep", "secaudit", "version"]) {
    assert.ok(config.toolNames.includes(tool), `missing ${tool}`);
  }
});

test("buildPalServerConfig honors an explicit python path and env overlay", () => {
  const config = buildPalServerConfig({
    rootDir: "/opt/pal",
    pythonPath: "/usr/bin/python3",
    env: { LOG_LEVEL: "INFO" },
  });
  assert.equal(config.command, "/usr/bin/python3");
  assert.deepEqual(config.env, { LOG_LEVEL: "INFO" });
});

test("palServerAvailability reports UNAVAILABLE truthfully when the venv is absent", () => {
  const verdict = palServerAvailability({ rootDir: "/nonexistent/pal-root" });
  assert.equal(verdict.available, false);
  assert.match(verdict.reason ?? "", /unavailable/i);
  assert.match(verdict.reason ?? "", /python venv/i);
});

test("palServerAvailability reports AVAILABLE when both python and server.py exist", () => {
  const root = mkdtempSync(join(tmpdir(), "pal-"));
  try {
    mkdirSync(join(root, ".pal_venv", "bin"), { recursive: true });
    writeFileSync(join(root, ".pal_venv", "bin", "python"), "#!/bin/sh\n");
    writeFileSync(join(root, "server.py"), "# pal\n");
    const verdict = palServerAvailability({ rootDir: root });
    assert.equal(verdict.available, true);
    assert.equal(verdict.reason, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a supervised PAL server with an absent process reports unhealthy (degrade-safe, never faked)", async () => {
  const manager = new ExternalMcpProcessManager();
  const config = buildPalServerConfig({ rootDir: "/nonexistent/pal-root" });
  manager.register(config);

  const registration = manager.toRegistration(PAL_SERVER_ID);
  assert.ok(registration);
  assert.equal(registration?.transport, "stdio");
  assert.deepEqual(registration?.toolNames.sort(), [...PAL_TOOL_NAMES].sort());

  // Starting an absent executable yields the truthful `unavailable` state.
  await manager.ensureStarted(PAL_SERVER_ID);
  const health = manager.health(PAL_SERVER_ID);
  assert.equal(health.healthy, false);
  assert.equal(health.state, "unavailable");
  assert.match(health.detail ?? "", /not found/i);

  manager.stopAll();
});
