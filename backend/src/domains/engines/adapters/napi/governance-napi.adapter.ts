/**
 * `GovernanceNapiAdapter` — a THIN re-expose of the Phase-3 governance kernel
 * (`GovernanceKernelPort`) through the frozen `EngineClientPort`. It does NOT
 * load a `.node` or duplicate the kernel ladder: the governance domain already
 * assembles the napi→daemon→ts ladder (`createKernelLadder`) with its fail-closed
 * synthetic-deny floor. This adapter wraps the injected, assembled kernel so the
 * engines seam can hand capability domains a uniform `EngineClientPort` for the
 * governance engine alongside openfang + tensorzero.
 *
 * `transport` is the DECLARED napi transport (the governance engine is native
 * first). `health()` reports the TRUTHFUL rung the ladder answers on: `up` only
 * when the napi rung is live and non-degraded; `degraded` when the ladder fell to
 * the daemon/ts rung (napi addon absent); `down` when the kernel itself is down.
 * Deny-bias is preserved — the wrapped kernel already deny-biases on fault.
 */
import type { Logger } from '../../../../shared/logger.js';
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type { KernelRequest } from '../../../governance/types.js';
import { EngineClientBase, type EngineCall } from '../../ports/engine-client.port.js';
import { type EngineHealth, type InvokeResult, fail, ok } from '../../types.js';
import { msg, str, type NapiArgs } from './napi-util.js';

/** Build a degrade-safe `KernelRequest` from loose (untrusted) MCP/invoke input. */
function toKernelRequest(args: NapiArgs): KernelRequest {
  return {
    actorId: typeof args.actorId === 'string' ? args.actorId : 'anonymous',
    action: (typeof args.action === 'string' ? args.action : 'tool.call') as KernelRequest['action'],
    target:
      args.target && typeof args.target === 'object'
        ? (args.target as KernelRequest['target'])
        : ({} as KernelRequest['target']),
    ...(typeof args.taskId === 'string' ? { taskId: args.taskId } : {}),
    ...(typeof args.requestId === 'string' ? { requestId: args.requestId } : {}),
  };
}

export class GovernanceNapiAdapter extends EngineClientBase<NapiArgs, unknown> {
  constructor(
    private readonly kernel: GovernanceKernelPort,
    private readonly log: Logger,
  ) {
    super('governance', 'napi');
  }

  // start/stop inherit the base no-ops: the kernel ladder's lifecycle is owned by
  // the governance module, not by this re-expose.

  async invoke(call: EngineCall<NapiArgs>): Promise<InvokeResult<unknown>> {
    const op = call.op;
    const input = (call.input ?? {}) as NapiArgs;
    try {
      switch (op) {
        case 'decide':
          return ok(await this.kernel.decide(toKernelRequest(input)));
        case 'enforceTool': {
          const toolName = str(input, 'toolName');
          if (!toolName) return fail('enforceTool requires toolName', 'BAD_INPUT');
          const toolInput =
            typeof input.input === 'string' ? input.input : JSON.stringify(input.input ?? {});
          const req = input.request && typeof input.request === 'object'
            ? toKernelRequest(input.request as NapiArgs)
            : undefined;
          return ok(await this.kernel.enforceTool(toolName, toolInput, req));
        }
        case 'route':
          return ok(await this.kernel.route(toKernelRequest(input)));
        case 'auditTip':
          return ok({ tipHash: await this.kernel.auditTip() });
        case 'verifyAudit':
          return ok(await this.kernel.verifyAudit());
        case 'status':
          return ok(this.kernel.status());
        default:
          return fail(`unknown governance op "${op}"`, 'UNKNOWN_OP');
      }
    } catch (err) {
      // Deny-biased by construction: a kernel that throws is a failure, never a
      // fabricated allow. Callers treat {ok:false} as "not allowed".
      return fail(`governance ${op} threw: ${msg(err)}`, 'KERNEL_THREW');
    }
  }

  async health(): Promise<EngineHealth> {
    const status = this.kernel.status();
    const checkedAt = new Date().toISOString();
    const base = { engineId: 'governance' as const, transport: 'napi' as const, checkedAt };

    if (status.status === 'down') {
      return { ...base, status: 'down', reason: status.reason ?? 'governance kernel down' };
    }
    // `up` only when the native rung answers and the verdict path is not degraded.
    if (status.status === 'up' && status.engine === 'napi' && !status.degraded) {
      return { ...base, status: 'up', version: `kernel:${status.engine}` };
    }
    // Ladder fell to daemon/ts (napi addon absent) or reports degraded — truthful.
    return {
      ...base,
      status: 'degraded',
      reason: status.reason ?? `governance kernel answering on '${status.engine}' rung (napi addon absent)`,
      version: `kernel:${status.engine}`,
    };
  }
}

/** Factory for the governance kernel engine client (thin re-expose). */
export function createGovernanceKernelClient(
  kernel: GovernanceKernelPort,
  log: Logger,
): GovernanceNapiAdapter {
  return new GovernanceNapiAdapter(kernel, log);
}
