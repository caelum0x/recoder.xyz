/**
 * Fleet manifest — the declarative catalog of every non-TS polyglot service the
 * conductor supervises (RECODER-ENGINES.md §11/§24). This generalizes the ad-hoc
 * `conductor/openfang-daemon.ts` spawn/health/degrade pattern into DATA: one typed
 * `FleetService` entry per engine, consumed by `supervisor.ts`.
 *
 * PHASE-1 SCOPE: this file is *data only*. It never spawns a process and never
 * builds a Rust/Go/Python binary (disk/ENOSPC hazard). Each entry knows:
 *   - how to resolve a PREBUILT binary/script (never compiled here), and
 *   - how to resolve its configured endpoint from env, and
 *   - the name of the pure-TS fallback that runs when the service is absent.
 *
 * DEGRADE-SAFE BY CONSTRUCTION: with no external service/daemon/key present, the
 * supervisor reports `available:false` + the `degradeTo` fallback — never throws,
 * never fakes success. Every service is loopback-only in this phase; cross-machine
 * reach is opt-in later via `go/ziti` + `go/recoder-xds`.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The languages the fleet supervises (TS engines run in-process, not here). */
export type FleetLang = 'rust' | 'go' | 'py';

/**
 * How a service's liveness is probed:
 *  - `http`     — GET a health URL (the common case; probed via injectable fetch).
 *  - `uds-ping` — check a Unix-domain socket path exists (governance kernel).
 *  - `grpc`     — TCP-reachability of a host:port (recoder-xds ADS).
 *  - `cmd`      — a CLI whose presence (or an injected command run) implies health.
 */
export type FleetHealthKind = 'http' | 'uds-ping' | 'grpc' | 'cmd';

export interface FleetHealthCheck {
  readonly kind: FleetHealthKind;
  /** For `cmd`: the health command to run (only run when a cmd-prober is injected). */
  readonly run?: readonly string[];
  /** Health sub-path appended to the resolved endpoint for `http` probes. */
  readonly path?: string;
}

/**
 * One polyglot engine, declared as data. `resolveBinary`/`resolveEndpoint` are pure
 * (env in, string|undefined out) so the manifest unit-tests with a fake env and no
 * filesystem/network. `spawnable:false` in Phase 1 for every entry — the supervisor's
 * ensure()/stop() are safe no-ops until spawn recipes land in a later phase.
 */
export interface FleetService {
  readonly id: string;
  readonly lang: FleetLang;
  /** One-line role, mirrored from the engine catalog for truthful diagnostics. */
  readonly role: string;
  /** The env var names that configure this service (surfaced in health output). */
  readonly envVars: readonly string[];
  /** Default loopback port, when the service listens on TCP (undefined for UDS/CLI). */
  readonly port?: number;
  /** Always true this phase: services bind 127.0.0.1 only. */
  readonly loopbackOnly: true;
  /** The pure-TS fallback that runs when this service is absent. */
  readonly degradeTo: string;
  /** How the supervisor probes liveness. */
  readonly health: FleetHealthCheck;
  /** Phase-1: no entry is spawned. Kept as an explicit contract for the supervisor. */
  readonly spawnable: boolean;
  /**
   * Resolve a PREBUILT binary / script path without building it. Returns undefined
   * when no prebuilt artifact is present (the degrade-safe default).
   */
  resolveBinary(env: NodeJS.ProcessEnv): string | undefined;
  /**
   * Resolve the configured endpoint (base URL for http, socket path for uds, or
   * host:port for grpc). Returns undefined when not configured AND no loopback
   * default applies (env-contract services like colbert/mem0).
   */
  resolveEndpoint(env: NodeJS.ProcessEnv): string | undefined;
  /**
   * Resolve the full health probe target for the current env, or undefined when the
   * endpoint is not configured. For http this is `<endpoint><health.path>`.
   */
  healthUrl(env: NodeJS.ProcessEnv): string | undefined;
}

/** Bounded walk up to the repo root (dir containing `crates/`). Never loops. */
function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'crates')) && existsSync(join(dir, 'packages'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** The dir this module lives in, resilient across ESM/CJS output. */
function moduleDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return __dirname;
  } catch {
    return process.cwd();
  }
}

function trimStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Strip a trailing slash so we can safely append a health path. */
function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Make a degrade-safe binary resolver. Resolution order (first existing wins):
 *   1. an explicit env var pointing at a prebuilt binary,
 *   2. `<RECODER_FLEET_BIN_DIR>/<name>` (the shipped prebuilt dir),
 *   3. `<repoRoot>/<relPath>` for each candidate script/binary path,
 * else undefined — NEVER builds anything.
 */
function makeResolveBinary(opts: {
  explicitEnvVars?: readonly string[];
  name?: string;
  repoRelPaths?: readonly string[];
}): (env: NodeJS.ProcessEnv) => string | undefined {
  return (env: NodeJS.ProcessEnv): string | undefined => {
    for (const v of opts.explicitEnvVars ?? []) {
      const p = trimStr(env[v]);
      if (p && existsSync(p)) return p;
    }
    const binDir = trimStr(env.RECODER_FLEET_BIN_DIR);
    if (binDir && opts.name) {
      const candidate = join(binDir, opts.name);
      if (existsSync(candidate)) return candidate;
    }
    if (opts.repoRelPaths && opts.repoRelPaths.length > 0) {
      const root = findRepoRoot(moduleDir());
      if (root) {
        for (const rel of opts.repoRelPaths) {
          const candidate = join(root, rel);
          if (existsSync(candidate)) return candidate;
        }
      }
    }
    return undefined;
  };
}

/** An HTTP service with a loopback default endpoint that env can override. */
function httpService(cfg: {
  id: string;
  lang: FleetLang;
  role: string;
  port: number;
  defaultEndpoint: string;
  healthPath: string;
  degradeTo: string;
  urlEnvVars: readonly string[];
  resolveBinary: (env: NodeJS.ProcessEnv) => string | undefined;
  extraEnvVars?: readonly string[];
}): FleetService {
  const resolveEndpoint = (env: NodeJS.ProcessEnv): string | undefined => {
    for (const v of cfg.urlEnvVars) {
      const raw = trimStr(env[v]);
      if (raw) return trimTrailingSlash(raw);
    }
    return trimTrailingSlash(cfg.defaultEndpoint);
  };
  return {
    id: cfg.id,
    lang: cfg.lang,
    role: cfg.role,
    envVars: [...cfg.urlEnvVars, ...(cfg.extraEnvVars ?? [])],
    port: cfg.port,
    loopbackOnly: true,
    degradeTo: cfg.degradeTo,
    health: { kind: 'http', path: cfg.healthPath },
    spawnable: false,
    resolveBinary: cfg.resolveBinary,
    resolveEndpoint,
    healthUrl: (env) => {
      const base = resolveEndpoint(env);
      return base ? `${base}${cfg.healthPath}` : undefined;
    },
  };
}

/**
 * An HTTP service addressed PURELY by env contract (colbert/mem0): no loopback
 * default. Absent env var ⇒ endpoint undefined ⇒ supervisor reports degraded.
 */
function envHttpService(cfg: {
  id: string;
  lang: FleetLang;
  role: string;
  port: number;
  healthPath: string;
  degradeTo: string;
  urlEnvVars: readonly string[];
  resolveBinary: (env: NodeJS.ProcessEnv) => string | undefined;
}): FleetService {
  const resolveEndpoint = (env: NodeJS.ProcessEnv): string | undefined => {
    for (const v of cfg.urlEnvVars) {
      const raw = trimStr(env[v]);
      if (raw) return trimTrailingSlash(raw);
    }
    return undefined;
  };
  return {
    id: cfg.id,
    lang: cfg.lang,
    role: cfg.role,
    envVars: cfg.urlEnvVars,
    port: cfg.port,
    loopbackOnly: true,
    degradeTo: cfg.degradeTo,
    health: { kind: 'http', path: cfg.healthPath },
    spawnable: false,
    resolveBinary: cfg.resolveBinary,
    resolveEndpoint,
    healthUrl: (env) => {
      const base = resolveEndpoint(env);
      return base ? `${base}${cfg.healthPath}` : undefined;
    },
  };
}

/**
 * The declarative fleet — one entry per polyglot service (RECODER-ENGINES §24).
 * Ordered by language group. NONE are spawned here; this is data consumed by
 * `FleetSupervisor`.
 */
export const FLEET: readonly FleetService[] = [
  // ── Rust kernels ────────────────────────────────────────────────────────────
  {
    id: 'governance',
    lang: 'rust',
    role: 'Merkle-chained tamper-evident audit + policy kernel (UDS daemon)',
    envVars: ['GOV_SOCK', 'RECODER_GOVERNANCE_SOCK', 'GOVERNANCE_BIN'],
    loopbackOnly: true,
    degradeTo: 'in-proc TS policy facade (fail-closed cloud / seal-loopback solo)',
    health: { kind: 'uds-ping' },
    spawnable: false,
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['GOVERNANCE_BIN'],
      name: 'recoder-governance',
      repoRelPaths: [
        'crates/recoder-governance/target/release/recoder-governance',
        'crates/recoder-governance/target/debug/recoder-governance',
      ],
    }),
    resolveEndpoint: (env) => trimStr(env.GOV_SOCK) ?? trimStr(env.RECODER_GOVERNANCE_SOCK),
    healthUrl: (env) => trimStr(env.GOV_SOCK) ?? trimStr(env.RECODER_GOVERNANCE_SOCK),
  },

  httpService({
    id: 'openfang',
    lang: 'rust',
    role: 'autonomous agent engine (governed execution surface)',
    port: 4200,
    defaultEndpoint: 'http://127.0.0.1:4200',
    healthPath: '/api/health',
    degradeTo: 'pure-TS OSS dispatch (packages/agent-oss)',
    urlEnvVars: ['OPENFANG_URL'],
    extraEnvVars: ['OPENFANG_LISTEN', 'OPENFANG_API_KEY', 'OPENFANG_BIN'],
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['OPENFANG_BIN'],
      name: 'openfang',
      repoRelPaths: [
        'crates/openfang/target/release/openfang',
        'crates/openfang/target/debug/openfang',
      ],
    }),
  }),

  httpService({
    id: 'tensorzero',
    lang: 'rust',
    role: 'LLM gateway — provider routing, caching, observability',
    port: 3030,
    defaultEndpoint: 'http://127.0.0.1:3030',
    healthPath: '/health',
    degradeTo: 'pi-ai direct BYOK client (packages/pi-ai)',
    urlEnvVars: ['TENSORZERO_URL'],
    extraEnvVars: ['TENSORZERO_GATEWAY_API_KEY', 'TZ_CONFIG', 'TENSORZERO_BIN'],
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['TENSORZERO_BIN'],
      name: 'tensorzero-gateway',
      repoRelPaths: [
        'crates/tensorzero/target/release/tensorzero-gateway',
        'crates/tensorzero/target/debug/tensorzero-gateway',
      ],
    }),
  }),

  // ── Go networking / graph ─────────────────────────────────────────────────────
  {
    id: 'recoder-xds',
    lang: 'go',
    role: 'Envoy xDS control plane — dynamic default-deny service mesh',
    envVars: ['RECODER_XDS_URL', 'RECODER_XDS_BIN'],
    port: 18000,
    loopbackOnly: true,
    degradeTo: 'static Envoy bootstrap (no dynamic mesh)',
    health: { kind: 'grpc' },
    spawnable: false,
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['RECODER_XDS_BIN'],
      name: 'recoder-xds',
      repoRelPaths: ['go/recoder-xds/recoder-xds', 'go/recoder-xds/bin/recoder-xds'],
    }),
    resolveEndpoint: (env) => trimStr(env.RECODER_XDS_URL) ?? '127.0.0.1:18000',
    healthUrl: (env) => trimStr(env.RECODER_XDS_URL) ?? '127.0.0.1:18000',
  },

  httpService({
    id: 'ziti',
    lang: 'go',
    role: 'OpenZiti zero-trust overlay router (cross-machine reach)',
    port: 8081,
    defaultEndpoint: 'http://127.0.0.1:8081',
    healthPath: '/health-checks',
    degradeTo: 'loopback only (no cross-machine overlay)',
    urlEnvVars: ['ZITI_ROUTER_HEALTH_URL'],
    extraEnvVars: ['ZITI_CONTROLLER_URL', 'ZITI_CFG'],
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['ZITI_BIN'],
      name: 'ziti',
      repoRelPaths: ['go/ziti/ziti', 'go/ziti/build/ziti'],
    }),
  }),

  {
    id: 'beads',
    lang: 'go',
    role: 'issue graph / bd task tracker (CLI, not a daemon)',
    envVars: ['BD_BIN', 'BEADS_BIN'],
    loopbackOnly: true,
    degradeTo: 'no issue graph (TaskSpec-only)',
    health: { kind: 'cmd', run: ['bd', 'vc', 'status'] },
    spawnable: false,
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['BD_BIN', 'BEADS_BIN'],
      name: 'bd',
      repoRelPaths: ['go/beads/bd', 'go/beads/bin/bd'],
    }),
    resolveEndpoint: () => undefined,
    healthUrl: () => undefined,
  },

  httpService({
    id: 'multica',
    lang: 'go',
    role: 'coordination claim/dispatch for parallel agents',
    port: 7070,
    defaultEndpoint: 'http://127.0.0.1:7070',
    healthPath: '/healthz',
    degradeTo: 'in-proc locks only (packages/coordination)',
    urlEnvVars: ['MULTICA_URL'],
    extraEnvVars: ['MULTICA_API_KEY', 'MULTICA_BIN', 'MULTICA_LISTEN'],
    resolveBinary: makeResolveBinary({
      explicitEnvVars: ['MULTICA_BIN'],
      name: 'multica',
      repoRelPaths: ['go/multica/multica', 'go/multica/bin/multica'],
    }),
  }),

  // ── Python ML services ────────────────────────────────────────────────────────
  envHttpService({
    id: 'colbert',
    lang: 'py',
    role: 'late-interaction retrieval reranker',
    port: 8070,
    healthPath: '/health',
    degradeTo: 'identity rerank order (packages/retrieval)',
    urlEnvVars: ['COLBERT_RERANK_URL'],
    resolveBinary: makeResolveBinary({
      name: 'rerank_server.py',
      repoRelPaths: ['py/colbert/rerank_server.py'],
    }),
  }),

  envHttpService({
    id: 'mem0',
    lang: 'py',
    role: 'long-term memory engine',
    port: 8071,
    healthPath: '/health',
    degradeTo: 'pgvector store (packages/agent-memory)',
    urlEnvVars: ['MEM0_BASE_URL'],
    resolveBinary: makeResolveBinary({
      name: 'mem0',
      repoRelPaths: ['py/mem0'],
    }),
  }),

  httpService({
    id: 'browser-use',
    lang: 'py',
    role: 'autonomous browser agent (LLM-driven web)',
    port: 8072,
    defaultEndpoint: 'http://127.0.0.1:8072',
    healthPath: '/health',
    degradeTo: 'puppeteer path (packages/recoder-browser-tools)',
    urlEnvVars: ['BROWSER_USE_BASE_URL'],
    extraEnvVars: ['BROWSER_USE_API_KEY'],
    resolveBinary: makeResolveBinary({
      name: 'browser_use',
      repoRelPaths: ['py/browser-use'],
    }),
  }),

  httpService({
    id: 'ops-recorder',
    lang: 'py',
    role: 'work-signal detection (stuck GitHub/Linear work)',
    port: 8073,
    defaultEndpoint: 'http://127.0.0.1:8073',
    healthPath: '/health',
    degradeTo: 'no work-signals (coordination/work-signals inert)',
    urlEnvVars: ['OPS_RECORDER_URL'],
    extraEnvVars: ['OPS_RECORDER_API_KEY'],
    resolveBinary: makeResolveBinary({
      name: 'ops-recorder',
      repoRelPaths: ['py/ops-recorder'],
    }),
  }),
];

/** Look up a single service entry by id (undefined when unknown). */
export function getFleetService(id: string): FleetService | undefined {
  return FLEET.find((s) => s.id === id);
}

/** All fleet service ids, in manifest order. */
export function fleetServiceIds(): string[] {
  return FLEET.map((s) => s.id);
}
