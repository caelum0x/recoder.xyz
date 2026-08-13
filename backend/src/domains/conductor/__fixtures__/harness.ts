/**
 * Test harness for the conductor domain — real, in-memory fakes (never stubs)
 * that let a test compose the {@link ConductorComposer} and drive it WITHOUT a
 * DB, tmux, or the network. The `FakeSubstrate` is a fully-functional
 * `ConductorSubstrate` (it provisions/launches/captures/reports liveness against
 * in-memory state); the gate, executor, logger, and middleware are minimal but
 * truthful (a deny gate really blocks, an unavailable executor really degrades).
 *
 * This file carries NO `*.test.ts` name so vitest ignores it; it is imported by
 * the domain's test files only.
 */
import type {
  ConductorSubstrate,
  ContinueRunInput,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateDiff,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '@recoder/substrate';
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { AppConfig } from '../../../shared/app-config.js';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type {
  AuditEntryInput,
  GateVerdict,
  GovernanceGatePort,
  SteerKeysInput,
  SteerTransportPort,
} from '../ports/index.js';
import type { GovernanceEffect } from '../../governance/types.js';
import {
  createConductorModule,
  type ConductorModule,
  type ConductorModuleDeps,
} from '../index.js';

/** A no-op structured logger with a self-returning `child` (pino-shaped). */
export function makeLogger(): Logger {
  const log: Record<string, unknown> = {};
  const noop = () => {};
  log.info = noop;
  log.warn = noop;
  log.error = noop;
  log.debug = noop;
  log.trace = noop;
  log.fatal = noop;
  log.child = () => log;
  return log as unknown as Logger;
}

/** A minimal auth middleware whose handlers pass through (routes are not exercised here). */
export function makeMiddleware(): AuthMiddleware {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authenticate: pass,
    authenticateMutating: pass,
    requireAdmin: pass,
    requireInternal: pass,
    requirePermission: () => pass,
    verifyOrgAccess: () => pass,
  } as unknown as AuthMiddleware;
}

/** A degrade-safe in-memory query executor. `available:false` ⇒ the repository degrades. */
export function makeExecutor(available = false): QueryExecutor {
  const exec: QueryExecutor = {
    async execute() {
      return [];
    },
    async one() {
      return null;
    },
    async read() {
      return [];
    },
    async mutate() {
      return 0;
    },
    async withTransaction(fn) {
      return fn(exec);
    },
    isAvailable() {
      return available;
    },
  };
  return exec;
}

/** A resolved non-anonymous principal for gated writes. */
export function makePrincipal(userId = 'user_test'): Principal {
  return {
    userId,
    scopes: ['read', 'write'],
    kind: 'session',
    isAnonymous: false,
    raw: null,
  };
}

/**
 * The minimal `AppConfig` slice the conductor config reads (`runtime.isProduction`
 * + `runtime.soloMode`). `soloMode` drives the desktop single-owner fail-open path
 * (`sliceConductorConfig` reads `app.runtime.soloMode === true`).
 */
export function makeConfig(isProduction = false, soloMode = false): AppConfig {
  return { runtime: { isProduction, soloMode } } as unknown as AppConfig;
}

/** A recording governance gate whose `decide` effect is configurable per call. */
export interface FakeGate extends GovernanceGatePort {
  readonly audits: AuditEntryInput[];
  readonly decisions: string[];
  setEffect(effect: GovernanceEffect): void;
}

/** Build a gate that returns `effect` (default `allow`) and records every audit. */
export function makeGate(effect: GovernanceEffect = 'allow'): FakeGate {
  const audits: AuditEntryInput[] = [];
  const decisions: string[] = [];
  let current: GovernanceEffect = effect;
  const verdict = (action: string): GateVerdict => ({
    verdictId: `verdict_${action}`,
    requestId: `req_${action}`,
    effect: current,
    tier: 'low',
    reason: current === 'allow' ? 'allowed' : `${current} by policy`,
    degraded: false,
    engine: 'ts',
    createdAt: new Date().toISOString(),
  });
  return {
    audits,
    decisions,
    setEffect(next) {
      current = next;
    },
    async decide(action) {
      decisions.push(action);
      return verdict(action);
    },
    async enforceTool() {
      return {
        outcome: current === 'allow' ? 'allowed' : 'denied',
        reason: 'x',
        degraded: false,
        engine: 'ts',
      };
    },
    async route(action) {
      return {
        routable: current === 'allow',
        tier: 'low',
        reason: 'x',
        target: action,
      };
    },
    async recordAudit(entry) {
      audits.push(entry);
      return {
        id: `audit_${audits.length}`,
        seq: audits.length,
        prevHash: '0'.repeat(64),
        entryHash: 'h'.repeat(64),
        actorId: entry.actorId,
        action: entry.action,
        resource: entry.resource,
        effect: entry.effect,
        riskTier: entry.riskTier,
        degraded: entry.degraded,
        payload: entry.payload,
        createdAt: new Date().toISOString(),
      };
    },
    async verifyAudit() {
      return { ok: true, entries: audits.length, tipHash: 'h'.repeat(64) };
    },
  };
}

interface FakeRun {
  command: string;
  output: string;
  alive: boolean;
  exitCode: number | null;
  removed: boolean;
}

export interface FakeSubstrateOptions {
  id?: WorkspaceSubstrate;
  available?: boolean;
  unavailableReason?: string;
  diff?: SubstrateDiff;
  /**
   * exitCode() for a handle with no live run (default `null` = gone/clean). Set to
   * `undefined` to model a substrate that can't determine an orphan's outcome (an
   * interrupted ACP session), which reconcile must finalize as failed, not exit-0.
   */
  missingExitCode?: number | null | undefined;
}

/**
 * A real, fully-functional in-memory `ConductorSubstrate`. It launches into an
 * in-memory run map and NEVER fabricates output or an exit code: while a run is
 * alive `exitCode()` returns `undefined` (unknown), never `0`.
 */
export class FakeSubstrate implements ConductorSubstrate {
  readonly id: WorkspaceSubstrate;
  readonly #available: boolean;
  readonly #reason: string;
  readonly #diff: SubstrateDiff;
  readonly #missingExit: number | null | undefined;
  readonly #runs = new Map<string, FakeRun>();
  #counter = 0;
  #lastLaunchEnv: Record<string, string> | undefined;

  /** Test-only: the env the most recent `launch` received (asserts env injection). */
  lastLaunchEnv(): Record<string, string> | undefined {
    return this.#lastLaunchEnv;
  }

  constructor(options: FakeSubstrateOptions = {}) {
    this.id = options.id ?? 'tmux_worktree';
    this.#available = options.available ?? true;
    this.#reason = options.unavailableReason ?? 'fake substrate disabled';
    this.#diff = options.diff ?? {
      stat: '',
      patch: '',
      untracked: [],
      changedFiles: 0,
    };
    // Distinguish an explicit `undefined` (interrupted/unknown orphan) from "not set".
    this.#missingExit =
      'missingExitCode' in options ? options.missingExitCode : null;
  }

  capabilities(): SubstrateCapabilities {
    return {
      remote: this.id === 'daytona',
      supportsPty: true,
      supportsInteractiveKeys: true,
      capturesByPolling: true,
      supportsDiff: true,
      supportsIsolationRemoval: true,
    };
  }

  async available(): Promise<SubstrateAvailability> {
    return this.#available
      ? { available: true }
      : { available: false, reason: this.#reason };
  }

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    this.#lastLaunchEnv = input.env;
    const ref = `fake-${input.workspaceId}-${++this.#counter}`;
    this.#runs.set(ref, {
      command: input.command,
      output: `$ ${input.command}\n`,
      alive: true,
      exitCode: null,
      removed: false,
    });
    return { ref, worktreePath: `/tmp/fake/${ref}`, sessionName: ref };
  }

  /** Test-only: finish a run with a truthful exit code. */
  finish(ref: string, exitCode: number): void {
    const run = this.#runs.get(ref);
    if (!run) throw new Error(`fake run not found: ${ref}`);
    run.alive = false;
    run.exitCode = exitCode;
  }

  async capture(handle: SubstrateHandle): Promise<string | null> {
    const run = this.#runs.get(handle.ref);
    return run && !run.removed ? run.output : null;
  }

  async alive(handle: SubstrateHandle): Promise<boolean> {
    const run = this.#runs.get(handle.ref);
    return Boolean(run && !run.removed && run.alive);
  }

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const run = this.#runs.get(handle.ref);
    if (!run || run.removed) return this.#missingExit; // gone (null) or interrupted (undefined)
    if (run.alive) return undefined; // NEVER a fabricated 0 while running
    return run.exitCode;
  }

  async diff(): Promise<SubstrateDiff> {
    return this.#diff;
  }

  async teardown(
    handle: SubstrateHandle,
    options?: { removeIsolation?: boolean }
  ): Promise<void> {
    const run = this.#runs.get(handle.ref);
    if (!run) return;
    run.alive = false;
    if (options?.removeIsolation) run.removed = true;
  }

  /** In-place relaunch (continue/chat): a fresh run in the SAME worktree. */
  async continueRun(
    handle: SubstrateHandle,
    input: ContinueRunInput
  ): Promise<SubstrateHandle> {
    const run = this.#runs.get(handle.ref);
    if (run) {
      run.alive = true;
      run.command = input.command ?? run.command;
      run.output += `$ ${input.command ?? '(prompt-driven)'}\n`;
    } else {
      this.#runs.set(handle.ref, {
        command: input.command ?? '',
        output: `$ ${input.command ?? ''}\n`,
        alive: true,
        exitCode: null,
        removed: false,
      });
    }
    return {
      ref: handle.ref,
      worktreePath: input.worktreePath,
      sessionName: handle.sessionName ?? handle.ref,
    };
  }
}

/** A recording in-memory send-keys transport; `fail` makes delivery throw truthfully. */
export class FakeSteerTransport implements SteerTransportPort {
  readonly sent: SteerKeysInput[] = [];
  #failReason: string | null = null;

  fail(reason: string): void {
    this.#failReason = reason;
  }

  async sendKeys(input: SteerKeysInput): Promise<void> {
    if (this.#failReason) throw new Error(this.#failReason);
    this.sent.push(input);
  }
}

export interface ComposeOptions {
  substrates?: readonly ConductorSubstrate[];
  gate?: FakeGate;
  executor?: QueryExecutor;
  repository?: ConductorModuleDeps['repository'];
  executorAvailable?: boolean;
  /** OPTIONAL memory-backed brain (recall on launch + harvest on completion). */
  brain?: ConductorModuleDeps['brain'];
  /** OPTIONAL code-intel seam (recodergit index + beads track/close). */
  codeIntel?: ConductorModuleDeps['codeIntel'];
  /** OPTIONAL preview verifier (browsing facet; absent ⇒ auto-verify does not fire). */
  previewVerify?: ConductorModuleDeps['previewVerify'];
  /** OPTIONAL pal launch-planning seam (absent ⇒ launch is byte-identical to today). */
  plan?: ConductorModuleDeps['plan'];
  /** OPTIONAL ColBERT PLAID index seam (absent ⇒ no per-repo index build). */
  colbertIndex?: ConductorModuleDeps['colbertIndex'];
  /** OPTIONAL live send-keys transport (absent ⇒ steering refuses truthfully). */
  steerTransport?: ConductorModuleDeps['steerTransport'];
  /** OPTIONAL per-worktree `.mcp.json` injector (absent ⇒ injection is a truthful skip). */
  mcpInject?: ConductorModuleDeps['mcpInject'];
  /** OPTIONAL checkpoint metadata store (absent ⇒ the module's in-process store). */
  checkpointStore?: ConductorModuleDeps['checkpointStore'];
  /** OPTIONAL per-repo setup-script store (absent ⇒ the module's in-process store). */
  repoSetupStore?: ConductorModuleDeps['repoSetupStore'];
  /** OPTIONAL repo-setup run-hook exec seam (absent ⇒ the real `execFileSafe`). */
  repoSetupExec?: ConductorModuleDeps['repoSetupExec'];
  /** OPTIONAL committed-config reader seam (absent ⇒ the real settings.json reader). */
  repoSetupReadConfigFile?: ConductorModuleDeps['repoSetupReadConfigFile'];
  /** OPTIONAL live-substrate scan source for reconcile GC (absent ⇒ empty box). */
  substrateScan?: ConductorModuleDeps['substrateScan'];
  /** OPTIONAL dmux LAYOUT-brain grid seam (absent ⇒ no grid hint, arrange ⇒ null). */
  workspaceGrid?: ConductorModuleDeps['workspaceGrid'];
  /**
   * OPTIONAL degrade-safe one-shot LLM inference for ASSISTED convergence synthesis
   * (`ctx.infer` → `ConvergeOpsDeps.inference`). Absent ⇒ every `@assisted` conflict
   * degrades truthfully to `synthesize-conflict` (mechanical behavior, never a fake merge).
   */
  infer?: ConductorModuleDeps['infer'];
  /** OPTIONAL swarm auto-unblock seams (LOOM #3); absent ⇒ the tool is SERVICE_UNAVAILABLE. */
  swarmUnblock?: ConductorModuleDeps['swarmUnblock'];
  /** OPTIONAL governed remote-attach seams (LOOM Bigger Bet C); absent ⇒ the tools are SERVICE_UNAVAILABLE. */
  remoteAttach?: ConductorModuleDeps['remoteAttach'];
  /** OPTIONAL AppConfig override (e.g. `makeConfig(false, true)` for solo/desktop mode). */
  config?: AppConfig;
  /** OPTIONAL conductor config overrides (e.g. `{ defaultSubstrate: 'loom' }` for the prod default). */
  overrides?: ConductorModuleDeps['overrides'];
}

/** Compose a conductor module over the in-memory harness. Returns the module + its gate. */
export function composeConductor(options: ComposeOptions = {}): {
  module: ConductorModule;
  gate: FakeGate;
} {
  const gate = options.gate ?? makeGate('allow');
  const module = createConductorModule({
    config: options.config ?? makeConfig(),
    logger: makeLogger(),
    executor:
      options.executor ?? makeExecutor(options.executorAvailable ?? false),
    middleware: makeMiddleware(),
    gate,
    ...(options.substrates ? { substrates: options.substrates } : {}),
    ...(options.repository ? { repository: options.repository } : {}),
    ...(options.brain ? { brain: options.brain } : {}),
    ...(options.codeIntel ? { codeIntel: options.codeIntel } : {}),
    ...(options.previewVerify ? { previewVerify: options.previewVerify } : {}),
    ...(options.plan ? { plan: options.plan } : {}),
    ...(options.colbertIndex ? { colbertIndex: options.colbertIndex } : {}),
    ...(options.steerTransport
      ? { steerTransport: options.steerTransport }
      : {}),
    ...(options.mcpInject ? { mcpInject: options.mcpInject } : {}),
    ...(options.checkpointStore
      ? { checkpointStore: options.checkpointStore }
      : {}),
    ...(options.repoSetupStore
      ? { repoSetupStore: options.repoSetupStore }
      : {}),
    ...(options.repoSetupExec ? { repoSetupExec: options.repoSetupExec } : {}),
    ...(options.repoSetupReadConfigFile
      ? { repoSetupReadConfigFile: options.repoSetupReadConfigFile }
      : {}),
    ...(options.substrateScan ? { substrateScan: options.substrateScan } : {}),
    ...(options.workspaceGrid ? { workspaceGrid: options.workspaceGrid } : {}),
    ...(options.infer ? { infer: options.infer } : {}),
    ...(options.swarmUnblock ? { swarmUnblock: options.swarmUnblock } : {}),
    ...(options.remoteAttach ? { remoteAttach: options.remoteAttach } : {}),
    ...(options.overrides ? { overrides: options.overrides } : {}),
  });
  return { module, gate };
}

/** A valid create-workspace input for the harness (all required fields present). */
export function makeCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_1',
    repoPath: '/tmp/fake-repo',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree' as WorkspaceSubstrate,
    prompt: 'do the thing',
    ...overrides,
  };
}
