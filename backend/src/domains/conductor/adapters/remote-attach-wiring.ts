/**
 * `createRemoteAttachDeps` — the REAL wiring for GOVERNED REMOTE ATTACH (LOOM
 * Bigger Bet C). It binds the injected {@link RemoteAttachExternalDeps} seams of
 * the pure {@link RemoteAttachService} to concrete Recoder systems, so the
 * governed `recoder_remote_attach` / `recoder_remote_snapshot` /
 * `recoder_remote_steer` tools stop returning `SERVICE_UNAVAILABLE` and instead
 * mint owner-scoped sessions and (opt-in) STEER the caller's OWN live agents:
 *
 *  - `evaluatePolicy` → the REAL deterministic `@recoder/agent-policy`
 *    `evaluatePolicy` (bound by referential identity — NEVER a permissive actor).
 *    The service itself builds the deny-biased steer actor + the `remote.steer`
 *    `tool.call` `PolicyInput`; this only supplies the genuine decision engine, so
 *    `deny` / `needs_approval` / `allow` flow back verbatim.
 *  - `approval` → the real `ApprovalService.request` (governance domain). A
 *    `needs_approval` steer opens a durable approval and its id is returned; the
 *    steer is NOT executed.
 *  - `deliver` → the loom control API (`agent.prompt`) into the blocked pane's live
 *    session (the workspace's persisted `sessionName`) over the SAME daemon socket
 *    a second CLIENT drives (never a second daemon). No live session / a non-
 *    `agent_prompted` reply THROWS — a failed delivery is surfaced, never faked.
 *  - `audit` → the durable, hash-chained `AuditChainService.append`. A delivered
 *    steer is sealed as a `remote.steer` `allow` on the workspace resource; the
 *    service isolates a sealing fault into a truthful `auditId:null` (never
 *    un-delivering the steer).
 *  - `listWorkspaceIdsForTaskGroup` → the converge compare read
 *    (`conductor.compareTaskGroup`): a taskGroup scope resolves to its sibling
 *    workspace ids, EACH of which the service re-verifies ownership of before it is
 *    admitted to the session scope (a resolver hit is never trusted on its own).
 *
 * TRUTHFULNESS: every adapter degrades truthfully — a dead loom session throws, an
 * audit-store fault is isolated by the service, and no adapter fabricates a
 * delivery, an approval id, or a policy allow. The two READS the core needs
 * (`getWorkspace` ownership + the `statusBoardSnapshot` monitor board) are bound by
 * the conductor composer from its own methods (NOT here), so identity + ownership
 * are re-verified on every call.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import { evaluatePolicy } from '@recoder/agent-policy';
import type { Principal } from '../../identity/types.js';
import type { ApprovalService } from '../../governance/services/approval.service.js';
import type { AuditChainService } from '../../governance/services/audit-chain.service.js';
import type { CompareView } from '../services/compare.service.js';
import type { LoomClientPort } from './loom-substrate.adapter.js';
import {
  REMOTE_STEER_TOOL_NAME,
  type RemoteAttachApprovalPort,
  type RemoteAttachAuditPort,
  type RemoteAttachDeliverPort,
  type RemoteAttachExternalDeps,
} from '../remote-attach/remote-attach.service.js';

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** The narrow seams this wiring composes over (all already built at bootstrap). */
export interface RemoteAttachWiringDeps {
  /** The loom control-API client (same daemon socket the loom substrate drives). */
  readonly loom: LoomClientPort;
  /** Resolve a workspace record (for its loom `sessionName` steer target). Late-bound. */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  /** The taskGroup compare read (resolves a group to its sibling ids). Late-bound. */
  readonly compareGroup: (
    taskGroup: string,
    principal: Principal
  ) => Promise<CompareView>;
  /** The control-plane approval-gate lifecycle (a `needs_approval` steer). */
  readonly approvals: ApprovalService;
  /** The durable, hash-chained audit sink (seals a delivered steer). */
  readonly audit: AuditChainService;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

/**
 * Build the concrete {@link RemoteAttachExternalDeps} bundle. Injected into the
 * conductor module (`deps.remoteAttach`) so the composer constructs the
 * {@link RemoteAttachService} over real sources and the `recoder_remote_*` tools +
 * `remoteAttach`/`remoteSnapshot`/`remoteSteer` methods stop refusing
 * `SERVICE_UNAVAILABLE`.
 */
export function createRemoteAttachDeps(
  deps: RemoteAttachWiringDeps
): RemoteAttachExternalDeps {
  const logger = deps.logger ?? NOOP_LOGGER;

  /** Resolve a workspace's loom terminal id (`sessionName`) steer target, or `null`. */
  async function loomTarget(workspaceId: string): Promise<string | null> {
    const ws = await deps.getWorkspace(workspaceId);
    const session = ws?.sessionName;
    return session != null && session.trim() !== '' ? session : null;
  }

  const deliver: RemoteAttachDeliverPort = {
    async deliver(input): Promise<void> {
      const target = await loomTarget(input.workspaceId);
      // No live session ⇒ THROW (the service surfaces the fault; never a faked delivery).
      if (target == null) {
        throw new Error(
          `loom: no live session to steer workspace ${input.workspaceId}`
        );
      }
      const res = await deps.loom.call('agent.prompt', {
        target,
        text: input.text,
      });
      if (res.type !== 'agent_prompted') {
        throw new Error(
          `loom agent.prompt returned '${res.type}', expected 'agent_prompted'`
        );
      }
    },
  };

  const approval: RemoteAttachApprovalPort = {
    async request(params): Promise<{ readonly id: string }> {
      const record = await deps.approvals.request({
        action: params.action,
        riskTier: params.riskTier,
        requestedBy: params.requestedBy,
        reason: params.reason ?? null,
        taskId: params.taskId ?? null,
        target: params.target ?? null,
      });
      return { id: record.id };
    },
  };

  const audit: RemoteAttachAuditPort = {
    async record(entry): Promise<{ readonly id: string } | null> {
      const record = await deps.audit.append({
        actorId: entry.actorId,
        action: REMOTE_STEER_TOOL_NAME,
        resource: entry.workspaceId,
        effect: entry.effect,
        riskTier: 'high',
        degraded: false,
        payload: { sessionId: entry.sessionId, workspaceId: entry.workspaceId },
      });
      logger.info('remote-attach steer sealed to the durable audit chain', {
        workspaceId: entry.workspaceId,
        auditId: record.id,
      });
      return { id: record.id };
    },
  };

  return {
    // The REAL deterministic policy engine — bound by identity so it can never be a
    // permissive stub. The service builds the deny-biased actor + `remote.steer`
    // input; this supplies only the genuine verdict function.
    evaluatePolicy,
    approval,
    deliver,
    audit,
    async listWorkspaceIdsForTaskGroup(
      taskGroup: string,
      principal: Principal
    ): Promise<readonly string[]> {
      // Resolve the group to its sibling workspace ids. The service RE-VERIFIES
      // ownership of every returned id before admitting it to the session scope —
      // a resolver hit is a candidate set, never a trusted grant.
      const view = await deps.compareGroup(taskGroup, principal);
      return view.siblings.map(sibling => sibling.workspaceId);
    },
  };
}
