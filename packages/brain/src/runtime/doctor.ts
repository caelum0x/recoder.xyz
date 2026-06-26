import { execFile } from "node:child_process";
import {
  resolveEngines,
  type ResolvedEngines,
  type ResolvedExecEngine,
} from "./engine-resolver";

/**
 * Truthful doctor — reports which Brain engines are ACTUALLY live, not which are
 * merely configured. Each exec engine is proven with a harmless probe (a
 * `--help`/`--version` that touches nothing), mem0 with a quick health GET, and
 * context7 by key presence. Every check is degrade-safe: a missing tool,
 * unreachable endpoint, or thrown probe yields `available: false` with a clear,
 * actionable detail. The doctor NEVER throws.
 *
 * All IO is injectable (`resolve`, `probe`, `fetchImpl`) so the report is
 * deterministic and serverless in tests; the real defaults spawn a short-timeout
 * `execFile` and a real `fetch` only when nothing is injected.
 */

/** Identifier for each Brain engine surfaced in a report. */
export type EngineName = "gitnexus" | "continuum" | "bd" | "mem0" | "context7";

/** One engine's honest availability + a human-readable reason. */
export interface EngineReport {
  readonly engine: EngineName;
  readonly available: boolean;
  readonly detail: string;
}

/** The result of probing an exec engine (the seam tests fake). */
export interface ProbeResult {
  readonly ok: boolean;
  readonly out: string;
}

/** Runs a harmless exec probe and resolves whether it succeeded. */
export type ProbeFn = (cmd: string, args: string[]) => Promise<ProbeResult>;

/** Minimal response a health GET yields (the seam tests fake). */
export interface DoctorFetchResult {
  readonly ok: boolean;
  readonly status: number;
}

/** Performs one health GET (default: fetch; the test injects a fake). */
export type DoctorFetch = (url: string) => Promise<DoctorFetchResult>;

export interface RunDoctorOptions {
  /** Resolution source (defaults to {@link resolveEngines}). */
  readonly resolve?: () => ResolvedEngines;
  /** Exec probe (defaults to a short-timeout execFile). */
  readonly probe?: ProbeFn;
  /** Health GET (defaults to a short-timeout fetch). */
  readonly fetchImpl?: DoctorFetch;
}

/** Probe arg appended to an exec engine's argv to prove it is callable. */
const PROBE_ARGS: Readonly<Record<"gitnexus" | "continuum" | "bd", string>> = {
  gitnexus: "--help",
  continuum: "--help",
  bd: "--version",
};

/** Actionable hint shown when an exec engine cannot be reached. */
const NOT_FOUND_HINT: Readonly<Record<"gitnexus" | "continuum" | "bd", string>> =
  {
    gitnexus:
      "gitnexus CLI not found — build ts/gitnexus or set GITNEXUS_BIN",
    continuum:
      "continuum CLI not found — vendored ts/continuum is missing or set CONTINUUM_BIN",
    bd: "bd (beads) CLI not found — install beads or set BD_BIN",
  };

const PROBE_TIMEOUT_MS = 4000;

/** Default exec probe: run the command, treat a clean exit as reachable. */
function defaultProbe(cmd: string, args: string[]): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: PROBE_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, out: stderr || stdout || String(error.message) });
          return;
        }
        resolve({ ok: true, out: stdout });
      },
    );
  });
}

/** Default health GET: a short-timeout fetch that never rejects. */
async function defaultFetch(url: string): Promise<DoctorFetchResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Describe how an exec engine will be reached (for truthful detail text). */
function describeExec(engine: ResolvedExecEngine): string {
  if (engine.kind === "node") {
    return `node ${engine.args[0] ?? engine.cmd}`;
  }
  return `${engine.cmd} on PATH`;
}

/** Probe one exec engine; any thrown probe degrades to unavailable, never throws. */
async function reportExec(
  name: "gitnexus" | "continuum" | "bd",
  engine: ResolvedExecEngine,
  probe: ProbeFn,
): Promise<EngineReport> {
  try {
    const result = await probe(engine.cmd, [...engine.args, PROBE_ARGS[name]]);
    if (result.ok) {
      return {
        engine: name,
        available: true,
        detail: `${name} reachable via ${describeExec(engine)}`,
      };
    }
    return { engine: name, available: false, detail: NOT_FOUND_HINT[name] };
  } catch {
    return { engine: name, available: false, detail: NOT_FOUND_HINT[name] };
  }
}

/** Probe mem0: configured AND a health GET succeeds means live. Never throws. */
async function reportMem0(
  baseUrl: string | null,
  fetchImpl: DoctorFetch,
): Promise<EngineReport> {
  if (!baseUrl) {
    return {
      engine: "mem0",
      available: false,
      detail: "mem0 not configured — set MEM0_BASE_URL",
    };
  }
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  try {
    const result = await fetchImpl(url);
    if (result.ok) {
      return {
        engine: "mem0",
        available: true,
        detail: `mem0 reachable at ${baseUrl}`,
      };
    }
    return {
      engine: "mem0",
      available: false,
      detail: `mem0 configured at ${baseUrl} but unreachable (status ${result.status})`,
    };
  } catch {
    return {
      engine: "mem0",
      available: false,
      detail: `mem0 configured at ${baseUrl} but unreachable`,
    };
  }
}

/** Report context7 by key presence — no network call needed to know it's gated. */
function reportContext7(apiKey: boolean): EngineReport {
  return apiKey
    ? {
        engine: "context7",
        available: true,
        detail: "context7 API key present (CONTEXT7_API_KEY)",
      }
    : {
        engine: "context7",
        available: false,
        detail: "context7 API key absent — set CONTEXT7_API_KEY",
      };
}

/**
 * Run the full engine doctor: one honest {@link EngineReport} per engine, in a
 * stable order (gitnexus, continuum, bd, mem0, context7). Pure given injected
 * IO; safe (no real spawns/network) when `resolve`, `probe`, and `fetchImpl` are
 * all supplied.
 */
export async function runDoctor(
  options: RunDoctorOptions = {},
): Promise<EngineReport[]> {
  const resolve = options.resolve ?? (() => resolveEngines());
  const probe = options.probe ?? defaultProbe;
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  const engines = resolve();

  return Promise.all([
    reportExec("gitnexus", engines.gitnexus, probe),
    reportExec("continuum", engines.continuum, probe),
    reportExec("bd", engines.bd, probe),
    reportMem0(engines.mem0.baseUrl, fetchImpl),
    Promise.resolve(reportContext7(engines.context7.apiKey)),
  ]);
}
