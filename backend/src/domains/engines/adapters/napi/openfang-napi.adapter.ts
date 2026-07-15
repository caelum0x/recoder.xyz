/**
 * `OpenfangNapiAdapter` — the DEEP in-process adapter over the openfang-napi
 * native addon, expressed through the frozen `EngineClientPort`.
 *
 * openfang is a full agent kernel (kernel + runtime/wasmtime + memory/sqlite +
 * channels + skills + hands + wire + extensions) compiled into a single `.node`.
 * This adapter binds that addon through the injected `NapiLoaderPort` (never a
 * second dlopen), boots the `OpenfangEngine` once, and exposes its ~51 `#[napi]`
 * methods as a single degrade-safe `invoke(op,input)` — plus the conductor
 * runtime driver (`launchRun`) that runs one in-process agent turn and emits
 * honest `RunEvent`s.
 *
 * REUSE (not reinvention): the addon/engine TYPE surface and the runtime driver
 * come from `conductor/openfang-native.ts` + `conductor/openfang-runtime.ts`
 * (the battle-tested in-process fusion). This adapter re-homes them behind the
 * engines seam so capability domains consume openfang via the typed
 * `EngineClientPort`, never by importing the conductor internals.
 *
 * DEGRADE-SAFE LAW: a missing `.node` / failed `ping()` / failed kernel boot is a
 * truthful `down`/`degraded` health and an `{ ok:false, reason }` invoke — never
 * a thrown error across the seam, never a fabricated result.
 */
import type { Logger } from '../../../../shared/logger.js';
import type {
  OpenfangNativeAddon,
  OpenfangEngineInstance,
} from '../../openfang-native.js';
import {
  launchOpenfangRun,
  type OpenfangLaunchInput,
  type OpenfangLaunchResult,
  type OpenfangRunEventSink,
} from '../../openfang-runtime.js';
import { EngineClientBase, type EngineCall } from '../../ports/engine-client.port.js';
import type { NapiLoaderPort, NapiLoadSpec, NapiModule } from '../../ports/napi-loader.port.js';
import { type EngineHealth, type InvokeResult, down, fail, ok, up } from '../../types.js';
import {
  bool,
  jsonArg,
  msg,
  num,
  optStr,
  parseJson,
  str,
  strArr,
  type NapiArgs,
} from './napi-util.js';

/** The napi load spec for the openfang addon (resolved via the injected loader). */
const OPENFANG_SPEC: NapiLoadSpec<OpenfangNativeAddon> = {
  engineId: 'openfang',
  env: 'OPENFANG_NATIVE_ADDON',
  fileName: 'openfang_napi.node',
  crateDir: 'openfang',
  cratePackage: 'openfang-napi',
  validate: (addon) => typeof addon.ping === 'function' && addon.ping() === true,
  probeVersion: (addon) => {
    try {
      const parsed = JSON.parse(addon.nativeVersion?.() ?? '{}') as { version?: unknown };
      return typeof parsed.version === 'string' ? parsed.version : undefined;
    } catch {
      return undefined;
    }
  },
};

const NOT_BUILT =
  'openfang native addon (.node) not built — run: cd backend/engines/rust/openfang && cargo build -p openfang-napi --release';
const KERNEL_DOWN =
  'openfang native engine unavailable — addon absent or kernel boot failed (missing config/keys)';

/**
 * The full engine-method dispatch table (the ~51 `#[napi]` methods). `op` is the
 * engine-local method name; each entry coerces the loose `input` into the
 * positional args the native method expects and returns the engine's JSON reply.
 */
const ENGINE_OPS: Readonly<Record<string, (engine: OpenfangEngineInstance, args: NapiArgs) => string>> = {
  // ---- reads
  health: (e) => e.health(),
  listAgents: (e) => e.listAgents(),
  listActiveHands: (e) => e.listActiveHands(),
  listHandDefinitions: (e) => e.listHandDefinitions(),
  listTriggers: (e, a) => e.listTriggers(optStr(a, 'agentId')),
  listBindings: (e) => e.listBindings(),
  listModels: (e) => e.listModels(),
  listSkills: (e) => e.listSkills(),
  usageSummary: (e, a) => e.usageSummary(optStr(a, 'agentId')),
  sessionUsageCost: (e, a) => e.sessionUsageCost(str(a, 'agentId')),
  listAgentSessions: (e, a) => e.listAgentSessions(str(a, 'agentId')),
  // ---- agent lifecycle (writes)
  runAgent: (e, a) => e.runAgent(str(a, 'agentId'), str(a, 'message')),
  activateAgent: (e, a) => e.activateAgent(str(a, 'agentId')),
  stopAgentRun: (e, a) => e.stopAgentRun(str(a, 'agentId')),
  killAgent: (e, a) => e.killAgent(str(a, 'agentId')),
  resetSession: (e, a) => e.resetSession(str(a, 'agentId')),
  clearAgentHistory: (e, a) => e.clearAgentHistory(str(a, 'agentId')),
  setAgentModel: (e, a) => e.setAgentModel(str(a, 'agentId'), str(a, 'model'), optStr(a, 'provider')),
  setAgentSkills: (e, a) => e.setAgentSkills(str(a, 'agentId'), strArr(a, 'skills')),
  // ---- hands lifecycle (writes)
  activateHand: (e, a) => e.activateHand(str(a, 'handId')),
  pauseHand: (e, a) => e.pauseHand(str(a, 'instanceId')),
  resumeHand: (e, a) => e.resumeHand(str(a, 'instanceId')),
  deactivateHand: (e, a) => e.deactivateHand(str(a, 'instanceId')),
  // ---- triggers + skills (writes)
  removeTrigger: (e, a) => e.removeTrigger(str(a, 'triggerId')),
  setTriggerEnabled: (e, a) => e.setTriggerEnabled(str(a, 'triggerId'), bool(a, 'enabled')),
  reloadSkills: (e) => e.reloadSkills(),
  // ---- sessions + agent config
  createSession: (e, a) => e.createSession(str(a, 'agentId'), optStr(a, 'label')),
  switchSession: (e, a) => e.switchSession(str(a, 'agentId'), str(a, 'sessionId')),
  compactSession: (e, a) => e.compactSession(str(a, 'agentId')),
  contextReport: (e, a) => e.contextReport(str(a, 'agentId')),
  setAgentMcpServers: (e, a) => e.setAgentMcpServers(str(a, 'agentId'), strArr(a, 'servers')),
  setAgentToolFilters: (e, a) =>
    e.setAgentToolFilters(
      str(a, 'agentId'),
      a.allowlist == null ? null : strArr(a, 'allowlist'),
      a.blocklist == null ? null : strArr(a, 'blocklist'),
    ),
  // ---- spawn / verify / extensions / workflows
  spawnAgent: (e, a) => e.spawnAgent(jsonArg(a, 'manifest')),
  verifySignedManifest: (e, a) => e.verifySignedManifest(jsonArg(a, 'signed')),
  reloadExtensionMcps: (e) => e.reloadExtensionMcps(),
  reconnectExtensionMcp: (e, a) => e.reconnectExtensionMcp(str(a, 'id')),
  loadWorkflowsFromDir: (e, a) => e.loadWorkflowsFromDir(str(a, 'dir')),
  registerWorkflow: (e, a) => e.registerWorkflow(jsonArg(a, 'workflow')),
  runWorkflow: (e, a) => e.runWorkflow(str(a, 'workflowId'), jsonArg(a, 'input')),
  publishEvent: (e, a) => e.publishEvent(jsonArg(a, 'event')),
  registerTrigger: (e, a) =>
    e.registerTrigger(str(a, 'agentId'), jsonArg(a, 'pattern'), str(a, 'promptTemplate'), num(a, 'maxFires')),
  // ---- openfang's own per-agent KV memory (NOT Recoder's memory-of-record)
  memoryGet: (e, a) => e.memoryGet(str(a, 'agentId'), str(a, 'key')),
  memorySet: (e, a) => e.memorySet(str(a, 'agentId'), str(a, 'key'), jsonArg(a, 'value')),
  memoryDelete: (e, a) => e.memoryDelete(str(a, 'agentId'), str(a, 'key')),
  memoryList: (e, a) => e.memoryList(str(a, 'agentId')),
};

/** Every op name this adapter accepts (engine methods + addon reads + runtime driver). */
export const OPENFANG_OPS: readonly string[] = [
  'ping',
  'nativeVersion',
  'bundledHands',
  'launchRun',
  ...Object.keys(ENGINE_OPS),
];

export interface OpenfangNapiOptions {
  /** Explicit openfang config path passed to `OpenfangEngine.boot` (bootstrap-injected). */
  readonly configPath?: string | null;
  /** When `false`, the engine is never bound and reports `down` with reason "disabled". */
  readonly enabled?: boolean;
  /** RunEvent sink for the `launchRun` conductor driver (defaults to the run-tailer sink). */
  readonly runSink?: OpenfangRunEventSink;
  /** Clock for the runtime driver (tests inject a fixed clock). */
  readonly now?: () => Date;
}

export class OpenfangNapiAdapter extends EngineClientBase<NapiArgs, unknown> {
  private module: NapiModule<OpenfangNativeAddon> | null = null;
  private engine: OpenfangEngineInstance | undefined;
  private bootAttempted = false;
  private started = false;

  constructor(
    private readonly loader: NapiLoaderPort,
    private readonly log: Logger,
    private readonly options: OpenfangNapiOptions = {},
  ) {
    super('openfang', 'napi');
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.options.enabled === false) return;
    // Bind the addon eagerly (cheap dlopen); defer the kernel boot to first use.
    this.ensureAddon();
  }

  async stop(): Promise<void> {
    // The addon is a process-lifetime in-proc load; drop our cached handles so a
    // later start() re-resolves (degrade-safe, idempotent).
    this.engine = undefined;
    this.module = null;
    this.bootAttempted = false;
    this.started = false;
  }

  async invoke(call: EngineCall<NapiArgs>): Promise<InvokeResult<unknown>> {
    if (this.options.enabled === false) return fail('openfang engine disabled by config', 'DISABLED');
    const op = call.op;
    const input = (call.input ?? {}) as NapiArgs;

    // Addon-only reads — no kernel boot needed (work on a fresh checkout with a
    // built addon even without config/keys).
    if (op === 'ping' || op === 'nativeVersion' || op === 'bundledHands') {
      const addon = this.ensureAddon();
      if (!addon) return fail(NOT_BUILT, 'ENGINE_DOWN');
      try {
        if (op === 'ping') return ok({ ok: addon.ping() === true });
        if (op === 'nativeVersion') return ok(parseJson(addon.nativeVersion()));
        return ok(parseJson(addon.bundledHandsJson()));
      } catch (err) {
        return fail(`openfang ${op} threw: ${msg(err)}`, 'ENGINE_THREW');
      }
    }

    // Conductor runtime driver: one in-process agent turn with honest RunEvents.
    if (op === 'launchRun') return this.launchRun(input);

    const fn = ENGINE_OPS[op];
    if (!fn) return fail(`unknown openfang op "${op}"`, 'UNKNOWN_OP');

    const engine = this.ensureEngine();
    if (!engine) return fail(KERNEL_DOWN, 'ENGINE_DOWN');
    try {
      return ok(parseJson(fn(engine, input)));
    } catch (err) {
      // The napi boundary can throw (not just return {ok:false}); fold it into a
      // truthful failure, never propagate across the seam.
      return fail(`openfang ${op} threw: ${msg(err)}`, 'ENGINE_THREW');
    }
  }

  async health(): Promise<EngineHealth> {
    if (this.options.enabled === false) {
      return down('openfang', 'napi', 'disabled by config');
    }
    // Cheap, non-boot check: does the .node exist and load + ping? (Never forces
    // a kernel boot — health must not hang on engine startup I/O.)
    // `resolvePath` reads only the path fields (env/fileName/crateDir), never the
    // generic `validate`/`probeVersion`, so widening to the base spec is safe.
    const bindingPath = this.loader.resolvePath(OPENFANG_SPEC as NapiLoadSpec);
    if (!bindingPath) return down('openfang', 'napi', NOT_BUILT);
    const addon = this.ensureAddon();
    if (!addon) {
      return down('openfang', 'napi', 'native addon failed to load or ping() returned false', { bindingPath });
    }
    const version = this.module?.version;
    // A prior kernel boot that failed is a truthful `degraded` (addon up, kernel not).
    if (this.bootAttempted && !this.engine) {
      return {
        engineId: 'openfang',
        transport: 'napi',
        status: 'degraded',
        reason: 'native addon loaded but kernel boot failed (missing config/keys)',
        bindingPath,
        checkedAt: new Date().toISOString(),
        ...(version ? { version } : {}),
      };
    }
    return up('openfang', 'napi', { bindingPath, ...(version ? { version } : {}) });
  }

  // --- internals ---

  private ensureAddon(): OpenfangNativeAddon | undefined {
    if (this.options.enabled === false) return undefined;
    if (this.module) return this.module.addon;
    const loaded = this.loader.load(OPENFANG_SPEC);
    this.module = loaded;
    return loaded?.addon;
  }

  private ensureEngine(): OpenfangEngineInstance | undefined {
    if (this.engine) return this.engine;
    if (this.bootAttempted) return undefined;
    const addon = this.ensureAddon();
    if (!addon?.OpenfangEngine || typeof addon.OpenfangEngine.boot !== 'function') return undefined;
    this.bootAttempted = true;
    try {
      this.engine = addon.OpenfangEngine.boot(this.options.configPath ?? null);
      this.log.info({ engineId: 'openfang' }, 'openfang kernel booted in-process — engine handle cached');
      return this.engine;
    } catch (err) {
      this.log.warn({ engineId: 'openfang', err: msg(err) }, 'openfang kernel boot failed — degrading');
      return undefined;
    }
  }

  private async launchRun(input: NapiArgs): Promise<InvokeResult<OpenfangLaunchResult>> {
    const workspaceId = str(input, 'workspaceId');
    const taskId = str(input, 'taskId');
    const runId = str(input, 'runId') || (workspaceId ? `run_${workspaceId}` : '');
    if (!workspaceId || !taskId || !runId) {
      return fail('launchRun requires workspaceId, taskId and runId', 'BAD_INPUT');
    }
    const launchInput: OpenfangLaunchInput = {
      workspaceId,
      taskId,
      runId,
      prompt: str(input, 'prompt'),
      ...(typeof input.agentName === 'string' ? { agentName: input.agentName } : {}),
      ...(typeof input.worktreePath === 'string' ? { worktreePath: input.worktreePath } : {}),
    };
    const engine = this.ensureEngine();
    // launchOpenfangRun is degrade-safe: an absent engine yields
    // `{ available:false, reason }` (no events) — a truthful payload, not a seam
    // error, so we surface it as ok(result).
    const result = await launchOpenfangRun(launchInput, {
      engine: () => engine,
      ...(this.options.runSink ? { sink: this.options.runSink } : {}),
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    return ok(result);
  }
}

/** Factory for the openfang napi engine client (the seam consumers hold). */
export function createOpenfangClient(
  loader: NapiLoaderPort,
  log: Logger,
  options: OpenfangNapiOptions = {},
): OpenfangNapiAdapter {
  return new OpenfangNapiAdapter(loader, log, options);
}
