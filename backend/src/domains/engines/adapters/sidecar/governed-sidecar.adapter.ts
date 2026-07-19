/**
 * `GovernedSidecarAdapter` — the PER-TOOL governance teeth on the sidecar
 * tool-exec path. It decorates ANY sidecar {@link EngineClientPort} (browser-use /
 * mem0 / pal-mcp) so that BEFORE a running agent's tool actually executes, the
 * governance gate's fine-grained `enforceTool` (forbidden-path / secret-path /
 * risk allow-deny) runs. A `denied` verdict short-circuits the call with a
 * truthful `{ ok:false, code:'GOVERNANCE_DENIED' }` — the inner engine is NEVER
 * touched. An `allowed` verdict delegates to the wrapped adapter unchanged.
 *
 * Today the sidecar invoke path runs only the coarse workspace-op `decide()`
 * elsewhere; this decorator is what makes the kernel's fine-grained TEETH bite on
 * the actual tool call. The enforcement outcome is sealed into the durable audit
 * chain by the gate's `enforceTool` itself (this decorator adds no side channel).
 *
 * DEGRADE-TRUTHFUL: the gate is deny-biased on fault (a kernel fault yields a
 * synthetic deny inside `enforceTool`), so this decorator never fabricates an
 * allow. The `enforce` seam is injected so the decorator is unit-testable with no
 * kernel and no real sidecar.
 */
import type { EngineId, EngineHealth, InvokeResult } from '../../types.js';
import { fail } from '../../types.js';
import type { EngineCall, EngineClientPort } from '../../ports/engine-client.port.js';
import type { GovernanceGate } from '../../../governance/ports/gate.port.js';
import type { GateDecisionContext } from '../../../governance/types.js';
import type { Principal } from '../../../identity/types.js';

/** The minimal enforcement outcome the decorator consumes (governance-shaped). */
export interface SidecarEnforcement {
  readonly outcome: 'allowed' | 'denied';
  readonly reason: string;
}

/**
 * The per-tool enforcement seam. Given a tool name + a secret-free input string,
 * return the allow/deny verdict. Bound from the governance gate's `enforceTool`
 * via {@link bindSidecarEnforcement}; deny-biased by construction.
 */
export type SidecarToolEnforcer = (toolName: string, input: string) => Promise<SidecarEnforcement>;

export interface GovernedSidecarOptions {
  /**
   * Map an {@link EngineCall} to the secret-free input string handed to the
   * enforcer. Defaults to a JSON projection that drops obvious secret-looking
   * keys. Override for adapters whose input carries a command/path to gate.
   */
  readonly describeInput?: (call: EngineCall<unknown>) => string;
}

/** Keys whose NAME implies a credential — never forwarded into the enforcer input. */
const SECRET_KEY_PATTERN = /key|secret|token|password|passwd|credential|auth/i;

/** Project a call's input to a secret-free string for enforcement (never leaks values). */
function defaultDescribeInput(call: EngineCall<unknown>): string {
  const input = call.input;
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return String(input);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
  }
  try {
    return JSON.stringify(safe);
  } catch {
    return '';
  }
}

export class GovernedSidecarAdapter<TReq, TRes> implements EngineClientPort<TReq, TRes> {
  readonly id: EngineId;
  readonly transport: EngineClientPort<TReq, TRes>['transport'];

  constructor(
    private readonly inner: EngineClientPort<TReq, TRes>,
    private readonly enforce: SidecarToolEnforcer,
    private readonly options: GovernedSidecarOptions = {},
  ) {
    this.id = inner.id;
    this.transport = inner.transport;
  }

  async start(): Promise<void> {
    await this.inner.start();
  }

  async stop(): Promise<void> {
    await this.inner.stop();
  }

  /** The governed tool name the enforcer sees: `<engineId>.<op>`. */
  private toolNameFor(op: string): string {
    return `${this.id}.${op}`;
  }

  async invoke(call: EngineCall<TReq>): Promise<InvokeResult<TRes>> {
    const toolName = this.toolNameFor(call.op);
    const describe = this.options.describeInput ?? defaultDescribeInput;
    const input = describe(call as EngineCall<unknown>);

    // THE teeth: gate the tool BEFORE the sidecar runs. Deny-biased inside the gate.
    const verdict = await this.enforce(toolName, input);
    if (verdict.outcome === 'denied') {
      return fail<TRes>(
        `governance denied tool '${toolName}': ${verdict.reason}`,
        'GOVERNANCE_DENIED',
      );
    }

    return this.inner.invoke(call);
  }

  async health(): Promise<EngineHealth> {
    return this.inner.health();
  }
}

/**
 * Wrap a sidecar engine client with the per-tool governance gate. When `enforce`
 * is absent (governance not wired) the inner adapter is returned UNCHANGED — a
 * truthful pass-through, never a silent fake-allow decorator.
 */
export function governSidecar<TReq, TRes>(
  inner: EngineClientPort<TReq, TRes>,
  enforce: SidecarToolEnforcer | undefined,
  options?: GovernedSidecarOptions,
): EngineClientPort<TReq, TRes> {
  if (!enforce) return inner;
  return new GovernedSidecarAdapter(inner, enforce, options);
}

/**
 * Bind the governance gate's `enforceTool` into the {@link SidecarToolEnforcer}
 * seam the decorator consumes. The `principal` is the running agent's resolved
 * identity (its permission mode drives the fine-grained gate); `ctx` supplies the
 * task/run correlation + workspace root for the audit row. Deny-biased: the gate
 * never throws a policy outcome, so this seam is safe to await inline.
 */
export function bindSidecarEnforcement(
  gate: GovernanceGate,
  principal: Principal,
  ctx?: GateDecisionContext,
): SidecarToolEnforcer {
  return async (toolName, input) => {
    const enforcementCtx: GateDecisionContext | undefined = ctx
      ? { ...ctx, target: { ...ctx.target, toolName } }
      : undefined;
    const result = await gate.enforceTool(toolName, input, principal, enforcementCtx);
    return { outcome: result.outcome, reason: result.reason };
  };
}
