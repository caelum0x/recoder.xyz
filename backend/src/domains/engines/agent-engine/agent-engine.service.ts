/**
 * agent-engine/agent-engine.service — the concrete {@link AgentEngineService}:
 * every openfang kernel verb the engines domain owns, composed over TWO
 * engines-internal seams (see the port header for the full contract):
 *
 *   - PURE JSON verbs map onto the injected `EngineClientPort` transport
 *     (`OpenfangNapiAdapter`) via `engine.invoke({op, input})`, narrowing the raw
 *     native JSON reply into the typed port shapes;
 *   - the TWO STREAMING verbs (`run`/`continueRun`) call the sibling
 *     `launchOpenfangRun` FUNCTION, threading the caller's PER-CALL RunEvent sink
 *     into `deps.sink` and the SHARED provenance gate into `deps.governance`.
 *     Engine resolution uses `launchOpenfangRun`'s default `getOpenfangEngine()` —
 *     the exact resolver the shipped substrate uses (no new dlopen path).
 *
 * DEGRADE LAW (per verb, copied from issue-graph.service.ts): a null/down/faulted
 * transport degrades truthfully — reads return `[]`/`null` with a logged reason,
 * writes return `false`/`{ok:false}` with a warn; NOTHING throws across the facet
 * and nothing is fabricated. The streaming seam is itself degrade-safe, so an
 * absent/boot-failed engine yields `{ available:false }` — never a throw, never a
 * faked run or faked token count.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../ports/engine-client.port.js';
import type { InvokeResult } from '../types.js';
import {
  launchOpenfangRun as defaultLaunchOpenfangRun,
  type OpenfangProvenanceGate,
} from '../openfang-runtime.js';
import type {
  AgentEngineHealth,
  AgentEngineService,
  AgentTurnInput,
  AgentTurnResult,
  HandsView,
  OpenfangManifestProvenance,
  OpenfangRunEventSink,
  WorkflowRegisterResult,
  WorkflowRunResult,
} from '../ports/agent-engine.port.js';

/** The streaming seam the two run verbs compose over (defaults to the real function). */
type LaunchOpenfangRunFn = typeof defaultLaunchOpenfangRun;

export interface AgentEngineServiceDeps {
  /** The openfang raw transport (engines `OpenfangNapiAdapter`); null ⇒ every verb degrades. */
  readonly engine: EngineClientPort | null;
  /** The ONE shared provenance gate (also threaded into the adapter's launch_run option). */
  readonly gate: OpenfangProvenanceGate;
  readonly logger: Logger;
  /** The streaming seam — injected in tests; defaults to the real `launchOpenfangRun`. */
  readonly launch?: LaunchOpenfangRunFn;
}

const NOT_WIRED = 'openfang engine client not wired';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Read the first array-valued field from a `{ ok, <key>: [...] }` reply (or the raw array). */
function arrayField(v: unknown, ...keys: readonly string[]): readonly unknown[] {
  if (Array.isArray(v)) return v;
  const r = rec(v);
  if (!r) return [];
  for (const k of keys) if (Array.isArray(r[k])) return r[k] as unknown[];
  return [];
}

function narrow<T>(raw: readonly unknown[], map: (v: unknown) => T | undefined): T[] {
  return raw.map(map).filter((e): e is T => e !== undefined);
}

/** Best-effort signer/key-id extraction from a verified-manifest reply (no throw). */
function extractSigner(parsed: Record<string, unknown>): string | undefined {
  const direct = parsed.signer ?? parsed.key_id ?? parsed.keyId;
  if (typeof direct === 'string' && direct) return direct;
  const manifest = rec(parsed.manifest);
  if (manifest) {
    const nested = manifest.signer ?? manifest.key_id ?? manifest.keyId;
    if (typeof nested === 'string' && nested) return nested;
  }
  return undefined;
}

/** Build the agent-engine facet over the injected openfang transport + shared gate. */
export function createAgentEngineService(deps: AgentEngineServiceDeps): AgentEngineService {
  const { engine, gate, logger } = deps;
  const launch = deps.launch ?? defaultLaunchOpenfangRun;

  /**
   * Route one op through the transport. NEVER throws: a null engine, a failed
   * invoke, or a (contract-violating) throw all become a truthful `{ok:false}`.
   */
  async function invoke(
    op: string,
    input: Record<string, unknown>,
  ): Promise<InvokeResult<unknown>> {
    if (!engine) return { ok: false, reason: NOT_WIRED };
    try {
      return await engine.invoke({ op, input });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** A degraded READ: log the truthful reason, return the empty value. */
  function readDown<T>(op: string, reason: string, empty: T): T {
    logger.info({ op, reason }, 'agent-engine read unavailable — degrading truthfully');
    return empty;
  }

  /** A degraded WRITE: warn with the truthful reason, return the false value. */
  function writeDown<T>(op: string, reason: string, value: T): T {
    logger.warn({ op, reason }, 'agent-engine write failed — nothing written');
    return value;
  }

  /** A boolean write: `true` only when the transport AND the engine reply both succeed. */
  function writeBool(op: string, result: InvokeResult<unknown>): boolean {
    if (!result.ok) return writeDown(op, result.reason, false);
    const r = rec(result.value);
    if (r?.ok === true) return true;
    return writeDown(op, str(r?.error) ?? 'engine reported failure', false);
  }

  /** The shared streaming path — threads the caller's exact sink + the shared gate. */
  async function runTurn(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult> {
    return launch(
      {
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        runId: input.runId,
        prompt: input.prompt,
        ...(input.agentName ? { agentName: input.agentName } : {}),
        ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
        ...(input.signedManifestJson ? { signedManifestJson: input.signedManifestJson } : {}),
      },
      { sink, governance: gate },
    );
  }

  return {
    async health(): Promise<AgentEngineHealth> {
      if (!engine) return { available: false, addonLoaded: false, reason: NOT_WIRED };
      let addonLoaded = false;
      let available = false;
      let reason: string | undefined;
      let version: string | undefined;
      try {
        const h = await engine.health();
        addonLoaded = h.status !== 'down';
        available = h.status === 'up';
        if (!available) reason = h.reason ?? `openfang engine ${h.status}`;
        version = h.version;
      } catch (err) {
        return {
          available: false,
          addonLoaded: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
      // Best-effort version + build_mode via the pure addon read (no kernel boot).
      let buildMode: string | undefined;
      const vres = await invoke('nativeVersion', {});
      if (vres.ok) {
        const r = rec(vres.value);
        version = str(r?.version) ?? version;
        buildMode = str(r?.build_mode ?? r?.buildMode);
      }
      return {
        available,
        addonLoaded,
        ...(reason ? { reason } : {}),
        ...(version ? { version } : {}),
        ...(buildMode ? { buildMode } : {}),
      };
    },

    run(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult> {
      return runTurn(input, sink);
    },

    continueRun(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult> {
      return runTurn(input, sink);
    },

    async listAgents(): Promise<readonly unknown[]> {
      const result = await invoke('listAgents', {});
      if (!result.ok) return readDown('listAgents', result.reason, []);
      return arrayField(result.value, 'agents');
    },

    async agentRunStatus(agentId: string): Promise<unknown | null> {
      const id = str(agentId);
      if (!id) return null;
      const result = await invoke('agentRunStatus', { agentId: id });
      if (!result.ok) return readDown('agentRunStatus', result.reason, null);
      return result.value ?? null;
    },

    async listModels(): Promise<readonly unknown[]> {
      const result = await invoke('listModels', {});
      if (!result.ok) return readDown('listModels', result.reason, []);
      return arrayField(result.value, 'models');
    },

    async listSkills(): Promise<readonly string[]> {
      const result = await invoke('listSkills', {});
      if (!result.ok) return readDown('listSkills', result.reason, []);
      return arrayField(result.value, 'skills').filter((s): s is string => typeof s === 'string');
    },

    async usageSummary(agentId?: string): Promise<unknown | null> {
      const id = str(agentId ?? '');
      const result = await invoke('usageSummary', id ? { agentId: id } : {});
      if (!result.ok) return readDown('usageSummary', result.reason, null);
      return result.value ?? null;
    },

    async hands(): Promise<HandsView> {
      const empty: HandsView = { hands: [], active: [] };
      const result = await invoke('introspectHands', {});
      if (!result.ok) return readDown('introspectHands', result.reason, empty);
      const hands = arrayField(result.value, 'hands');
      const active = hands.flatMap((h) => {
        const hr = rec(h);
        return hr && Array.isArray(hr.activeInstances) ? (hr.activeInstances as unknown[]) : [];
      });
      return { hands, active };
    },

    async activateHand(
      handId: string,
    ): Promise<{ ok: boolean; instanceId?: string; reason?: string }> {
      const id = str(handId);
      if (!id) return { ok: false, reason: 'handId required' };
      const result = await invoke('activateHand', { handId: id });
      if (!result.ok) return { ok: writeDown('activateHand', result.reason, false), reason: result.reason };
      const r = rec(result.value);
      if (r?.ok === true) {
        const instanceId = str(r.instance_id ?? r.instanceId);
        return instanceId ? { ok: true, instanceId } : { ok: true };
      }
      const reason = str(r?.error) ?? 'engine reported failure';
      return { ok: writeDown('activateHand', reason, false), reason };
    },

    async pauseHand(instanceId: string): Promise<boolean> {
      const id = str(instanceId);
      if (!id) return false;
      return writeBool('pauseHand', await invoke('pauseHand', { instanceId: id }));
    },

    async resumeHand(instanceId: string): Promise<boolean> {
      const id = str(instanceId);
      if (!id) return false;
      return writeBool('resumeHand', await invoke('resumeHand', { instanceId: id }));
    },

    async deactivateHand(instanceId: string): Promise<boolean> {
      const id = str(instanceId);
      if (!id) return false;
      return writeBool('deactivateHand', await invoke('deactivateHand', { instanceId: id }));
    },

    async publishEvent(
      event: Record<string, unknown>,
    ): Promise<readonly { agentId: string; message: string }[]> {
      const result = await invoke('publishEvent', { event });
      if (!result.ok) return readDown('publishEvent', result.reason, []);
      const fired = arrayField(result.value, 'fired', 'triggered', 'results');
      return narrow(fired, (e) => {
        const r = rec(e);
        const agentId = str(r?.agent_id ?? r?.agentId);
        if (!agentId) return undefined;
        return { agentId, message: str(r?.message) ?? '' };
      });
    },

    async registerTrigger(input: {
      agentId: string;
      pattern: unknown;
      promptTemplate: string;
      maxFires: number;
    }): Promise<{ ok: boolean; triggerId?: string; reason?: string }> {
      const agentId = str(input.agentId);
      if (!agentId) return { ok: false, reason: 'agentId required' };
      const result = await invoke('registerTrigger', {
        agentId,
        pattern: input.pattern,
        promptTemplate: input.promptTemplate,
        maxFires: input.maxFires,
      });
      if (!result.ok) {
        return { ok: writeDown('registerTrigger', result.reason, false), reason: result.reason };
      }
      const r = rec(result.value);
      if (r?.ok === true) {
        const triggerId = str(r.trigger_id ?? r.triggerId);
        return triggerId ? { ok: true, triggerId } : { ok: true };
      }
      const reason = str(r?.error) ?? 'engine reported failure';
      return { ok: writeDown('registerTrigger', reason, false), reason };
    },

    async listTriggers(agentId?: string): Promise<readonly unknown[]> {
      const id = str(agentId ?? '');
      const result = await invoke('listTriggers', id ? { agentId: id } : {});
      if (!result.ok) return readDown('listTriggers', result.reason, []);
      return arrayField(result.value, 'triggers');
    },

    async setTriggerEnabled(triggerId: string, enabled: boolean): Promise<boolean> {
      const id = str(triggerId);
      if (!id) return false;
      return writeBool(
        'setTriggerEnabled',
        await invoke('setTriggerEnabled', { triggerId: id, enabled: enabled === true }),
      );
    },

    async registerWorkflow(workflowJson: string): Promise<WorkflowRegisterResult> {
      const result = await invoke('registerWorkflow', { workflow: workflowJson });
      if (!result.ok) return { available: false, reason: readDown('registerWorkflow', result.reason, result.reason) };
      const r = rec(result.value);
      const workflowId = str(r?.workflow_id ?? r?.workflowId);
      if (r?.ok === true && workflowId) return { available: true, ok: true, workflowId };
      return { available: true, ok: false, error: str(r?.error) ?? 'registerWorkflow failed' };
    },

    async runWorkflow(workflowId: string, input: string): Promise<WorkflowRunResult> {
      const id = str(workflowId);
      if (!id) return { available: true, ok: false, error: 'workflowId required' };
      const result = await invoke('runWorkflow', { workflowId: id, input });
      if (!result.ok) return { available: false, reason: readDown('runWorkflow', result.reason, result.reason) };
      const r = rec(result.value);
      const runId = str(r?.run_id ?? r?.runId);
      if (r?.ok === true && runId) {
        return { available: true, ok: true, runId, output: typeof r.output === 'string' ? r.output : '' };
      }
      return { available: true, ok: false, error: str(r?.error) ?? 'runWorkflow failed' };
    },

    async verifyManifest(signedManifestJson: string): Promise<OpenfangManifestProvenance> {
      const signed = str(signedManifestJson);
      if (!signed) return { signed: false, verified: false };
      const result = await invoke('verifySignedManifest', { signed });
      if (!result.ok) {
        return { signed: true, verified: false, reason: readDown('verifySignedManifest', result.reason, result.reason) };
      }
      const r = rec(result.value);
      if (r?.ok === true) {
        const signer = extractSigner(r);
        return signer ? { signed: true, verified: true, signer } : { signed: true, verified: true };
      }
      return { signed: true, verified: false, reason: str(r?.error) ?? 'manifest verification failed' };
    },

    async memoryGet(agentId: string, key: string): Promise<unknown | null> {
      const id = str(agentId);
      const k = str(key);
      if (!id || !k) return null;
      const result = await invoke('memoryGet', { agentId: id, key: k });
      if (!result.ok) return readDown('memoryGet', result.reason, null);
      const r = rec(result.value);
      return r && 'value' in r ? r.value ?? null : result.value ?? null;
    },

    async memorySet(agentId: string, key: string, value: unknown): Promise<boolean> {
      const id = str(agentId);
      const k = str(key);
      if (!id || !k) return false;
      return writeBool('memorySet', await invoke('memorySet', { agentId: id, key: k, value }));
    },

    async memoryDelete(agentId: string, key: string): Promise<boolean> {
      const id = str(agentId);
      const k = str(key);
      if (!id || !k) return false;
      return writeBool('memoryDelete', await invoke('memoryDelete', { agentId: id, key: k }));
    },

    async memoryList(agentId: string): Promise<readonly { key: string; value: unknown }[]> {
      const id = str(agentId);
      if (!id) return [];
      const result = await invoke('memoryList', { agentId: id });
      if (!result.ok) return readDown('memoryList', result.reason, []);
      return narrow(arrayField(result.value, 'entries', 'memory', 'items'), (e) => {
        const r = rec(e);
        const key = str(r?.key);
        if (!key) return undefined;
        return { key, value: r?.value ?? null };
      });
    },
  };
}
