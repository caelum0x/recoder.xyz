/**
 * Conductor SOLO MODE — one-click delivery for the single-user desktop.
 *
 * On the Recoder desktop app the embedded backend (apps/desktop/backend-supervisor.js,
 * loopback :3100) is one user running on their own machine. For that surface the
 * full team approval handshake — an agent requests delivery, then a *separate*
 * human records a control-plane Approval, then the merge proceeds — is needless
 * ceremony: the user clicking "Merge" IS the approval.
 *
 * When `RECODER_SOLO_MODE` is enabled AND the merge/PR request is USER-INITIATED
 * (it carries an explicit approve intent with a `decidedBy` actor), this module
 * records the missing control-plane `Approval` record on the workspace's task —
 * the same canonical Approval the team path requires — attributed to the user as
 * the approver. The delivery then flows through the UNCHANGED delivery gate +
 * @recoder/governance: governance still classifies the risk tier, runs the
 * deny-biased policy chain, and seals the decision into the Merkle audit chain.
 *
 * This is NOT a silent bypass:
 *   - The approval is a real, audited Approval record (decidedBy = the user).
 *   - Governance still runs and still AUDITS the decision.
 *   - A governance HARD DENY still blocks — solo mode cannot override a policy veto.
 *
 * When `RECODER_SOLO_MODE` is OFF (team / cloud), this module is inert: the
 * existing deny → awaiting_approval gate is preserved exactly. Team security is
 * never weakened.
 */
import { randomUUID } from 'node:crypto';
import type { Approval, Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import type { DeliveryAction } from './delivery-approval.js';

const logger = createLogger('conductor:solo-mode');

/** Default approver identity for a desktop solo-mode delivery. */
export const SOLO_DEFAULT_DECIDED_BY = 'desktop-user';

/**
 * An explicit, user-initiated delivery intent. A merge/PR carries this when the
 * human operator pressed the button: `approve: true` is the click, `decidedBy`
 * is the actor recorded as the approver in the audited Approval record.
 */
export interface DeliveryIntent {
  /** True when the human operator explicitly initiated (approved) this delivery. */
  approve: boolean;
  /** The actor that approved (the desktop user). Recorded as the approver. */
  decidedBy?: string;
  /** Optional human-readable note for the audit trail. */
  reason?: string;
}

/**
 * Whether solo mode is active. Enabled when `RECODER_SOLO_MODE` is a truthy
 * opt-in value (`1`, `true`, `yes`, `on`, case-insensitive). Any other value —
 * including unset — keeps the full team gate.
 */
export function isSoloMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.RECODER_SOLO_MODE ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** The `requiredAt` an auto-recorded solo approval uses for each delivery action. */
const SOLO_REQUIRED_AT: Record<DeliveryAction, Approval['requiredAt']> = {
  pr: 'before_pr',
  merge: 'after_verification',
};

/**
 * Whether the request is a genuine, user-initiated solo approval: solo mode is on
 * AND the caller passed an explicit approve intent. A non-approving or absent
 * intent (e.g. an autonomous agent calling merge with no human click) does NOT
 * qualify — the normal gate still applies.
 */
export function isUserInitiatedSoloApproval(
  intent: DeliveryIntent | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isSoloMode(env) && intent?.approve === true;
}

/**
 * Record the canonical control-plane `Approval` for a user-initiated solo
 * delivery and return it. The record is `approved` with `decidedBy` set to the
 * user — exactly the record the team gate would require, just supplied by the
 * single user pressing the button instead of a separate reviewer.
 *
 * Idempotency-friendly: this simply adds an approved Approval for the task; the
 * delivery gate's `checkDeliveryApproval` then finds it. Never throws on its own
 * shape; a repository write failure is surfaced so the caller can decide (the
 * gate then fails closed, preserving the safe default).
 */
export async function recordSoloApproval(
  workspace: Workspace,
  action: DeliveryAction,
  intent: DeliveryIntent,
): Promise<Approval> {
  const decidedBy = intent.decidedBy?.trim() || SOLO_DEFAULT_DECIDED_BY;
  const now = new Date().toISOString();
  const reason =
    intent.reason?.trim() ||
    `Solo-mode delivery: user-initiated ${action} approved by ${decidedBy} on the local desktop.`;

  const approval: Approval = {
    approvalId: `approval_solo_${randomUUID()}`,
    taskId: workspace.taskId,
    runId: workspace.runId,
    status: 'approved',
    reason,
    requestedBy: decidedBy,
    requestedAt: now,
    requiredAt: SOLO_REQUIRED_AT[action],
    target: { toolName: action === 'pr' ? 'gh:pr-create' : 'git:push' },
    decidedBy,
    decidedAt: now,
    decisionReason: 'Solo mode: the user-initiated delivery click is the approval.',
    metadata: {
      soloMode: true,
      workspaceId: workspace.workspaceId,
      deliveryAction: action,
    },
  };

  const stored = await agentOsContainer.repository.upsertApproval(approval);
  logger.info(
    { workspaceId: workspace.workspaceId, taskId: workspace.taskId, action, approvalId: stored.approvalId, decidedBy },
    'solo-mode delivery approval recorded (governance still audits the decision)',
  );
  return stored;
}
