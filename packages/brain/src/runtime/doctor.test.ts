import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runDoctor,
  type DoctorFetch,
  type LoadContinuumFn,
  type ProbeFn,
} from "./doctor";
import type { ResolvedEngines } from "./engine-resolver";

/** A fully-resolved engine set with sane defaults, overridable per test. */
function engines(overrides: Partial<ResolvedEngines> = {}): ResolvedEngines {
  return {
    recodergit: { kind: "node", cmd: "node", args: ["/repo/recodergit.js"] },
    continuum: { kind: "node", cmd: "node", args: ["/repo/continuum.mjs"] },
    bd: { kind: "path", cmd: "bd", args: [] },
    mem0: { baseUrl: null },
    context7: { apiKey: false },
    ...overrides,
  };
}

const PROBE_OK: ProbeFn = async () => ({ ok: true, out: "usage: ..." });
const PROBE_FAIL: ProbeFn = async () => ({ ok: false, out: "command not found" });
const FETCH_UNUSED: DoctorFetch = async () => {
  throw new Error("fetch should not run when mem0 is unconfigured");
};

/** A fully-shaped in-process continuum engine — the LIVE signal. */
const CONTINUUM_LIVE: LoadContinuumFn = async () => ({
  loadEpisodes: () => [],
  loadIndex: async () => ({ search: async () => [] }),
  recall: async () => [],
  profile: async () => ({}),
  catchUp: () => [],
  snapshot: () => null,
});
/** The continuum engine fails to import (package unbuilt/absent). */
const CONTINUUM_ABSENT: LoadContinuumFn = async () => {
  throw new Error("Cannot find module '@recoder/continuum/engines'");
};

function byEngine(reports: Awaited<ReturnType<typeof runDoctor>>) {
  return new Map(reports.map((r) => [r.engine, r]));
}

test("reports every engine in a stable order", async () => {
  const reports = await runDoctor({
    resolve: () => engines(),
    probe: PROBE_OK,
    loadContinuum: CONTINUUM_LIVE,
    fetchImpl: FETCH_UNUSED,
  });
  assert.deepEqual(
    reports.map((r) => r.engine),
    ["recodergit", "continuum", "bd", "mem0", "context7"],
  );
});

test("exec engines are available when the probe succeeds", async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const probe: ProbeFn = async (cmd, args) => {
    calls.push({ cmd, args });
    return { ok: true, out: "ok" };
  };
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );

  const recodergit = reports.get("recodergit");
  assert.ok(recodergit?.available);
  assert.match(recodergit?.detail ?? "", /node \/repo\/recodergit\.js/);

  const bd = reports.get("bd");
  assert.ok(bd?.available);
  assert.match(bd?.detail ?? "", /bd on PATH/);

  // Probe argv = the resolved prefix + the per-engine harmless flag.
  const gitProbe = calls.find((c) => c.args.includes("/repo/recodergit.js"));
  assert.deepEqual(gitProbe?.args, ["/repo/recodergit.js", "--help"]);
  const bdProbe = calls.find((c) => c.cmd === "bd");
  assert.deepEqual(bdProbe?.args, ["--version"]);
  // Continuum is NOT probed via exec — it is an in-process import, never spawned.
  assert.equal(
    calls.some((c) => c.args.includes("--help") && c.cmd !== "node"),
    false,
  );
  assert.equal(
    calls.some((c) => c.args.includes("/repo/continuum.mjs")),
    false,
  );
});

test("exec engines are unavailable with an actionable hint when the probe fails", async () => {
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe: PROBE_FAIL,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  const recodergit = reports.get("recodergit");
  assert.equal(recodergit?.available, false);
  assert.match(recodergit?.detail ?? "", /recodergit CLI not found/);

  const bd = reports.get("bd");
  assert.equal(bd?.available, false);
  assert.match(bd?.detail ?? "", /bd \(beads\) CLI not found/);

  // continuum is in-process: a failing exec probe must NOT mark it unavailable.
  const continuum = reports.get("continuum");
  assert.ok(continuum?.available);
});

test("continuum is LIVE when the in-process @recoder/continuum engine imports + exposes its fns", async () => {
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  const continuum = reports.get("continuum");
  assert.ok(continuum?.available);
  assert.match(continuum?.detail ?? "", /in-process via @recoder\/continuum\/engines/);
});

test("continuum is unavailable with an actionable hint when the engine cannot be imported", async () => {
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_ABSENT,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  const continuum = reports.get("continuum");
  assert.equal(continuum?.available, false);
  assert.match(
    continuum?.detail ?? "",
    /@recoder\/continuum engine not available/,
  );
});

test("continuum is unavailable when the imported engine is missing required fns", async () => {
  const partial: LoadContinuumFn = async () => ({
    loadEpisodes: () => [],
    loadIndex: async () => ({ search: async () => [] }),
    recall: async () => [],
    profile: async () => ({}),
    catchUp: undefined,
    snapshot: undefined,
  });
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe: PROBE_OK,
      loadContinuum: partial,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  const continuum = reports.get("continuum");
  assert.equal(continuum?.available, false);
  assert.match(continuum?.detail ?? "", /missing engine fns: catchUp, snapshot/);
});

test("a thrown probe degrades to unavailable, never throws", async () => {
  const probe: ProbeFn = async () => {
    throw new Error("spawn EACCES");
  };
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  assert.equal(reports.get("recodergit")?.available, false);
  assert.equal(reports.get("bd")?.available, false);
});

test("a thrown continuum loader degrades to unavailable, never throws", async () => {
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines(),
      probe: PROBE_OK,
      loadContinuum: async () => {
        throw new Error("boom");
      },
      fetchImpl: FETCH_UNUSED,
    }),
  );
  assert.equal(reports.get("continuum")?.available, false);
});

test("mem0 is unavailable and never fetched when no base URL is configured", async () => {
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines({ mem0: { baseUrl: null } }),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  const mem0 = reports.get("mem0");
  assert.equal(mem0?.available, false);
  assert.match(mem0?.detail ?? "", /not configured — set MEM0_BASE_URL/);
});

test("mem0 is available when configured AND the health GET succeeds", async () => {
  const urls: string[] = [];
  const fetchImpl: DoctorFetch = async (url) => {
    urls.push(url);
    return { ok: true, status: 200 };
  };
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines({ mem0: { baseUrl: "http://mem0:8000/" } }),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl,
    }),
  );
  const mem0 = reports.get("mem0");
  assert.ok(mem0?.available);
  assert.match(mem0?.detail ?? "", /reachable/);
  // Trailing slash normalized before appending the health path.
  assert.deepEqual(urls, ["http://mem0:8000/health"]);
});

test("mem0 is configured-but-unreachable when the health GET fails", async () => {
  const fetchImpl: DoctorFetch = async () => ({ ok: false, status: 503 });
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines({ mem0: { baseUrl: "http://mem0:8000" } }),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl,
    }),
  );
  const mem0 = reports.get("mem0");
  assert.equal(mem0?.available, false);
  assert.match(mem0?.detail ?? "", /unreachable \(status 503\)/);
});

test("a thrown fetch degrades mem0 to unavailable, never throws", async () => {
  const fetchImpl: DoctorFetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  const reports = byEngine(
    await runDoctor({
      resolve: () => engines({ mem0: { baseUrl: "http://mem0:8000" } }),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl,
    }),
  );
  const mem0 = reports.get("mem0");
  assert.equal(mem0?.available, false);
  assert.match(mem0?.detail ?? "", /unreachable/);
});

test("context7 is available iff a key is present (no network)", async () => {
  const withKey = byEngine(
    await runDoctor({
      resolve: () => engines({ context7: { apiKey: true } }),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  assert.ok(withKey.get("context7")?.available);
  assert.match(withKey.get("context7")?.detail ?? "", /API key present/);

  const noKey = byEngine(
    await runDoctor({
      resolve: () => engines({ context7: { apiKey: false } }),
      probe: PROBE_OK,
      loadContinuum: CONTINUUM_LIVE,
      fetchImpl: FETCH_UNUSED,
    }),
  );
  assert.equal(noKey.get("context7")?.available, false);
  assert.match(noKey.get("context7")?.detail ?? "", /API key absent/);
});
