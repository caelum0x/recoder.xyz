import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const CLI_PATH = "recoder-skill/scripts/recoder-api.mjs";

test("recoder-skill CLI exits with actionable error when API key is missing", () => {
  const result = spawnSync("node", [CLI_PATH, "list"], {
    cwd: process.cwd(),
    env: { ...process.env, RECODER_API_KEY: "" },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /RECODER_API_KEY environment variable is not set/i);
});

test("recoder-skill CLI prints usage for unknown command when API key is present", () => {
  const result = spawnSync("node", [CLI_PATH, "unknown-command"], {
    cwd: process.cwd(),
    env: { ...process.env, RECODER_API_KEY: "test-key" },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: recoder-api\.mjs <command>/i);
});
