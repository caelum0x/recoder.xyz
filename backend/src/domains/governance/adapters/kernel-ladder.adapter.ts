/**
 * `kernel-ladder.adapter` — composes the three kernel rungs into ONE
 * `GovernanceKernelPort` implementing the core degrade ladder:
 *
 *   napi (in-proc) → daemon (UDS) → ts (pure-TS deny-biased)
 *                                          │
 *   every rung faults → synthetic DENY (fail CLOSED) ─┘
 *
 * Assembly probes each rung once (napi/daemon may be absent → skipped); the
 * pure-TS rung is always present, so the ladder is never empty. Per CALL, rungs
 * are tried in priority order: a rung that THROWS (an infrastructure fault, not a
 * policy deny — those are returned verdicts) falls through to the next rung. If
 * EVERY rung throws, the ladder returns a synthetic `deny` verdict
 * (`engine: 'synthetic'`, `degraded: true`) — it NEVER fabricates an allow and
 * NEVER lets a governance fault take the server down.
 *
 * `status()` / `degraded` are truthful: they report the highest available rung.
 */
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { GovernanceConfig } from '../config.js';
import {
  AUDIT_GENESIS_HASH,
  type AuditVerification,
  type KernelRequest,
  type KernelStatus,
  type KernelVerdict,
  type RoutingHint,
  type ToolEnforcement,
} from '../types.js';
import { createTsKernelAdapter } from './ts-kernel.adapter.js';
import { createNapiKernelAdapter } from './napi-kernel.adapter.js';
import { createDaemonKernelAdapter } from './daemon-kernel.adapter.js';

class KernelLadder implements GovernanceKernelPort {
  /** Rungs in strict priority order (highest first); always ends with the TS floor. */
  constructor(private readonly rungs: readonly GovernanceKernelPort[]) {}

  async decide(req: KernelRequest): Promise<KernelVerdict> {
    for (const rung of this.rungs) {
      try {
        return await rung.decide(req);
      } catch {
        // Infrastructure fault on this rung — degrade to the next.
      }
    }
    return syntheticDeny(req);
  }

  async enforceTool(toolName: string, input: string, req?: KernelRequest): Promise<ToolEnforcement> {
    for (const rung of this.rungs) {
      try {
        return await rung.enforceTool(toolName, input, req);
      } catch {
        /* degrade to next rung */
      }
    }
    return {
      outcome: 'denied',
      reason: 'Governance kernel unavailable — enforcing deny (fail closed).',
      degraded: true,
      engine: 'synthetic',
    };
  }

  async route(req: KernelRequest): Promise<RoutingHint> {
    for (const rung of this.rungs) {
      try {
        return await rung.route(req);
      } catch {
        /* degrade to next rung */
      }
    }
    return { routable: false, tier: 'critical', reason: 'Governance kernel unavailable — unroutable (fail closed).' };
  }

  async auditTip(): Promise<string> {
    for (const rung of this.rungs) {
      try {
        return await rung.auditTip();
      } catch {
        /* degrade to next rung */
      }
    }
    return AUDIT_GENESIS_HASH;
  }

  async verifyAudit(): Promise<AuditVerification> {
    for (const rung of this.rungs) {
      try {
        return await rung.verifyAudit();
      } catch {
        /* degrade to next rung */
      }
    }
    return { ok: false, entries: 0 };
  }

  status(): KernelStatus {
    // The top available rung defines the ladder's truthful status.
    return this.rungs[0]?.status() ?? {
      engine: 'synthetic',
      status: 'down',
      degraded: true,
      reason: 'no governance kernel rung available',
    };
  }
}

/** A fail-closed synthetic deny verdict when NO rung could answer. */
function syntheticDeny(_req: KernelRequest): KernelVerdict {
  return {
    effect: 'deny',
    tier: 'critical',
    reason: 'Governance kernel unavailable — failing closed (deny).',
    degraded: true,
    engine: 'synthetic',
  };
}

/**
 * Assemble the kernel ladder from config. Probes napi (skipped when the addon is
 * absent or `napiEnabled` is false) → daemon (skipped when no prebuilt binary /
 * socket) → ts (always present). Returns a single `GovernanceKernelPort`.
 */
export async function createKernelLadder(cfg: GovernanceConfig): Promise<GovernanceKernelPort> {
  const rungs: GovernanceKernelPort[] = [];

  const napi = await createNapiKernelAdapter({ napiEnabled: cfg.napiEnabled, auditEnabled: cfg.auditEnabled });
  if (napi) rungs.push(napi);

  const daemon = await createDaemonKernelAdapter(cfg);
  if (daemon) rungs.push(daemon);

  // The pure-TS deny-biased rung is the guaranteed floor — always present.
  rungs.push(await createTsKernelAdapter({ auditEnabled: cfg.auditEnabled }));

  return new KernelLadder(rungs);
}
