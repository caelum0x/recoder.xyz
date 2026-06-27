import { execFile } from "node:child_process";
import {
  resolveEngines,
  type ResolvedEngines,
  type ResolvedExecEngine,
} from "./engine-resolver";

/**
 * Truthful doctor — reports which Brain engines are ACTUALLY live, not which are
 * merely configured. The two remaining exec engines (recodergit, bd) are proven
 * with a harmless probe (a `--help`/`--version` that touches nothing); continuum
 * is proven by the REAL in-process signal — that `@recoder/continuum/engines`
 * imports and exposes its engine functions, exactly as the activity adapter
 * consumes it (no CLI, no subprocess); mem0 with a quick health GET; and
 * context7 by key presence. Every check is degrade-safe: a missing tool,
 * unreachable endpoint, un-importable engine, or thrown probe yields
 * `available: false` with a clear, actionable detail. The doctor NEVER throws.
 *
 * All IO is injectable (`resolve`, `probe`, `loadContinuum`, `fetchImpl`) so the
 * report is deterministic and serverless in tests; the real defaults spawn a
 * short-timeout `execFile`, dynamically import the continuum engine, and run a
 * real `fetch` only when nothing is injected.
 */

/** Identifier for each Brain engine surfaced in a report. */
export type EngineName = "recodergit" | "continuum" | "bd" | "mem0" | "context7";

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

/**
 * The subset of the `@recoder/continuum/engines` module the activity adapter
 * actually calls. The doctor proves continuum is LIVE by confirming the in-process
 * engine imports AND exposes these functions — the same module + functions the
 * adapter consumes — never by probing a CLI that no longer exists.
 */
export interface ContinuumEngineShape {
  readonly loadEpisodes: unknown;
  readonly loadIndex: unknown;
  readonly recall: unknown;
  readonly profile: unknown;
  readonly catchUp: unknown;
  readonly snapshot: unknown;
}

/**
 * Loads the in-process continuum engine module (default: dynamic-import
 * `@recoder/continuum/engines`; the test injects a fake). Resolving the module is
 * the TRUE availability signal; the doctor inspects its shape rather than trusting
 * a resolved-but-unbuilt package.
 */
export type LoadContinuumFn = () => Promise<ContinuumEngineShape>;

export interface RunDoctorOptions {
  /** Resolution source (defaults to {@link resolveEngines}). */
  readonly resolve?: () => ResolvedEngines;
  /** Exec probe (defaults to a short-timeout execFile). */
  readonly probe?: ProbeFn;
  /**
   * In-process continuum engine loader (defaults to importing
   * `@recoder/continuum/engines`). The doctor checks importability + engine shape.
   */
  readonly loadContinuum?: LoadContinuumFn;
  /** Health GET (defaults to a short-timeout fetch). */
  readonly fetchImpl?: DoctorFetch;
}

/** Probe arg appended to an exec engine's argv to prove it is callable. */
const PROBE_ARGS: Readonly<Record<"recodergit" | "bd", string>> = {
  recodergit: "--help",
  bd: "--version",
};

/** Actionable hint shown when an exec engine cannot be reached. */
const NOT_FOUND_HINT: Readonly<Record<"recodergit" | "bd", string>> = {
  recodergit:
    "recodergit CLI not found — build ts/recodergit or set RECODERGIT_BIN",
  bd: "bd (beads) CLI not found — install beads or set BD_BIN",
};

/** Hint shown when the in-process continuum engine cannot be imported. */
const CONTINUUM_NOT_AVAILABLE_HINT =
  "@recoder/continuum engine not available — build packages/continuum (workspace dep of brain)";

/** The engine functions the activity adapter requires; all must be callable. */
const CONTINUUM_REQUIRED_FNS: ReadonlyArray<keyof ContinuumEngineShape> = [
  "loadEpisodes",
  "loadIndex",
  "recall",
  "profile",
  "catchUp",
  "snapshot",
];

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

/**
 * Default continuum loader: dynamically import the OWNED in-process engine —
 * the exact module (`@recoder/continuum/engines`) the activity adapter consumes.
 * A successful import of a shaped module is the live signal; a rejected import
 * (package unbuilt/absent) degrades continuum to unavailable.
 */
function defaultLoadContinuum(): Promise<ContinuumEngineShape> {
  return import("@recoder/continuum/engines") as Promise<ContinuumEngineShape>;
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
  name: "recodergit" | "bd",
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

/** True iff `value` is a callable function (an engine entry point). */
function isFn(value: unknown): boolean {
  return typeof value === "function";
}

/**
 * Report continuum by its REAL in-process availability: LIVE iff
 * `@recoder/continuum/engines` imports AND exposes every engine function the
 * activity adapter calls. This is the same module + functions the adapter
 * consumes (no CLI, no subprocess), so the doctor's signal matches what actually
 * runs. A rejected import or a module missing engine functions degrades to
 * unavailable with an actionable hint. Never throws.
 */
async function reportContinuum(load: LoadContinuumFn): Promise<EngineReport> {
  try {
    const engine = await load();
    const missing = CONTINUUM_REQUIRED_FNS.filter((fn) => !isFn(engine[fn]));
    if (missing.length === 0) {
      return {
        engine: "continuum",
        available: true,
        detail:
          "continuum live in-process via @recoder/continuum/engines (loadEpisodes/recall/profile/catchUp/snapshot)",
      };
    }
    return {
      engine: "continuum",
      available: false,
      detail: `@recoder/continuum imported but missing engine fns: ${missing.join(", ")}`,
    };
  } catch {
    return {
      engine: "continuum",
      available: false,
      detail: CONTINUUM_NOT_AVAILABLE_HINT,
    };
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
 * stable order (recodergit, continuum, bd, mem0, context7). Pure given injected
 * IO; safe (no real spawns/import/network) when `resolve`, `probe`,
 * `loadContinuum`, and `fetchImpl` are all supplied.
 */
export async function runDoctor(
  options: RunDoctorOptions = {},
): Promise<EngineReport[]> {
  const resolve = options.resolve ?? (() => resolveEngines());
  const probe = options.probe ?? defaultProbe;
  const loadContinuum = options.loadContinuum ?? defaultLoadContinuum;
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  const engines = resolve();

  return Promise.all([
    reportExec("recodergit", engines.recodergit, probe),
    reportContinuum(loadContinuum),
    reportExec("bd", engines.bd, probe),
    reportMem0(engines.mem0.baseUrl, fetchImpl),
    Promise.resolve(reportContext7(engines.context7.apiKey)),
  ]);
}
