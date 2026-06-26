import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  resolveEngines,
  resolveExecEngine,
  type EnvLike,
  type ExistsFn,
} from "./engine-resolver";

const ROOT = "/repo";
const GITNEXUS_DIST = join(
  ROOT,
  "ts",
  "gitnexus",
  "gitnexus",
  "dist",
  "cli",
  "index.js",
);
const CONTINUUM_ENTRY = join(ROOT, "ts", "continuum", "bin", "continuum.mjs");

/** An exists() that returns true only for the given set of paths. */
function existsFor(paths: string[]): ExistsFn {
  const set = new Set(paths);
  return (path) => set.has(path);
}

const NONE: ExistsFn = () => false;
const EMPTY_ENV: EnvLike = {};

test("gitnexus resolves to the vendored node entry when its dist exists", () => {
  const engines = resolveEngines({
    root: ROOT,
    env: EMPTY_ENV,
    exists: existsFor([GITNEXUS_DIST]),
  });
  assert.deepEqual(engines.gitnexus, {
    kind: "node",
    cmd: "node",
    args: [GITNEXUS_DIST],
  });
});

test("gitnexus honors GITNEXUS_BIN when the vendored build is absent", () => {
  const engines = resolveEngines({
    root: ROOT,
    env: { GITNEXUS_BIN: "/opt/gitnexus" },
    exists: NONE,
  });
  assert.deepEqual(engines.gitnexus, {
    kind: "path",
    cmd: "/opt/gitnexus",
    args: [],
  });
});

test("gitnexus falls back to the bare PATH name when nothing resolves", () => {
  const engines = resolveEngines({ root: ROOT, env: EMPTY_ENV, exists: NONE });
  assert.deepEqual(engines.gitnexus, {
    kind: "path",
    cmd: "gitnexus",
    args: [],
  });
});

test("the vendored build wins over an env override (precedence)", () => {
  const engines = resolveEngines({
    root: ROOT,
    env: { GITNEXUS_BIN: "/opt/gitnexus" },
    exists: existsFor([GITNEXUS_DIST]),
  });
  assert.equal(engines.gitnexus.kind, "node");
  assert.deepEqual(engines.gitnexus.args, [GITNEXUS_DIST]);
});

test("continuum resolves the vendored mjs, env override, then PATH", () => {
  const vendored = resolveEngines({
    root: ROOT,
    env: EMPTY_ENV,
    exists: existsFor([CONTINUUM_ENTRY]),
  });
  assert.deepEqual(vendored.continuum, {
    kind: "node",
    cmd: "node",
    args: [CONTINUUM_ENTRY],
  });

  const env = resolveEngines({
    root: ROOT,
    env: { CONTINUUM_BIN: "/usr/local/bin/continuum" },
    exists: NONE,
  });
  assert.deepEqual(env.continuum, {
    kind: "path",
    cmd: "/usr/local/bin/continuum",
    args: [],
  });

  const path = resolveEngines({ root: ROOT, env: EMPTY_ENV, exists: NONE });
  assert.deepEqual(path.continuum, {
    kind: "path",
    cmd: "continuum",
    args: [],
  });
});

test("bd resolves BD_BIN, else the bare PATH name (no vendored build)", () => {
  const env = resolveEngines({
    root: ROOT,
    env: { BD_BIN: "/home/me/.local/bin/bd" },
    exists: existsFor([GITNEXUS_DIST, CONTINUUM_ENTRY]),
  });
  assert.deepEqual(env.bd, {
    kind: "path",
    cmd: "/home/me/.local/bin/bd",
    args: [],
  });

  const path = resolveEngines({ root: ROOT, env: EMPTY_ENV, exists: NONE });
  assert.deepEqual(path.bd, { kind: "path", cmd: "bd", args: [] });
});

test("mem0 resolves its base URL from env, else null", () => {
  const set = resolveEngines({
    root: ROOT,
    env: { MEM0_BASE_URL: "http://127.0.0.1:8000" },
    exists: NONE,
  });
  assert.deepEqual(set.mem0, { baseUrl: "http://127.0.0.1:8000" });

  const unset = resolveEngines({ root: ROOT, env: EMPTY_ENV, exists: NONE });
  assert.deepEqual(unset.mem0, { baseUrl: null });

  const blank = resolveEngines({
    root: ROOT,
    env: { MEM0_BASE_URL: "   " },
    exists: NONE,
  });
  assert.deepEqual(blank.mem0, { baseUrl: null });
});

test("context7 reports key presence as a boolean (never the key)", () => {
  const present = resolveEngines({
    root: ROOT,
    env: { CONTEXT7_API_KEY: "ctx7-secret" },
    exists: NONE,
  });
  assert.deepEqual(present.context7, { apiKey: true });

  const absent = resolveEngines({ root: ROOT, env: EMPTY_ENV, exists: NONE });
  assert.deepEqual(absent.context7, { apiKey: false });
});

test("resolveExecEngine: an explicit override pins a PATH cmd with no prefix", () => {
  const engine = resolveExecEngine("gitnexus", "/custom/gitnexus", {
    root: ROOT,
    env: EMPTY_ENV,
    exists: existsFor([GITNEXUS_DIST]),
  });
  // Override wins even when a vendored build exists — prior behavior preserved.
  assert.deepEqual(engine, {
    kind: "path",
    cmd: "/custom/gitnexus",
    args: [],
  });
});

test("resolveExecEngine: no override discovers the vendored build", () => {
  const engine = resolveExecEngine("continuum", undefined, {
    root: ROOT,
    env: EMPTY_ENV,
    exists: existsFor([CONTINUUM_ENTRY]),
  });
  assert.deepEqual(engine, {
    kind: "node",
    cmd: "node",
    args: [CONTINUUM_ENTRY],
  });
});

test("resolveExecEngine: a blank override is treated as no override", () => {
  const engine = resolveExecEngine("bd", "   ", {
    root: ROOT,
    env: { BD_BIN: "/env/bd" },
    exists: NONE,
  });
  assert.deepEqual(engine, { kind: "path", cmd: "/env/bd", args: [] });
});
