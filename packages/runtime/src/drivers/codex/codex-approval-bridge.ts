/**
 * Map codex on-request approval events into `ApprovalFrame`s.
 *
 * When codex runs with `approval_policy=on-request`, it emits an approval-request event
 * before a gated action (a command execution or a patch apply). In the modern item schema
 * this surfaces as an item whose `status` is `pending`/`in_progress` carrying an
 * approval/decision affordance; in the legacy protocol it is an `exec_approval_request` or
 * `apply_patch_approval_request` msg.
 *
 * We translate these into the engine's `ApprovalFrame`, which pauses the run until the host
 * resolves it via `approve()`. The driver forwards the decision back to codex's stdin as the
 * matching approval response (see `codex-driver.ts`). Classification of `requiredAt` is
 * load-bearing: a command -> `before_execution`, a patch -> `before_write`.
 */
import type { ApprovalFrame } from '../../contracts/driver-frame';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export type CodexApprovalRequest = {
  /** The approval id codex expects echoed back in the decision response. */
  approvalId: string;
  /** What is being gated. */
  requiredAt: ApprovalFrame['requiredAt'];
  reason: string;
  target?: { path?: string; command?: string; toolName?: string };
};

/** Detect + extract an approval request from a raw codex event, or return null. */
export function detectApprovalRequest(event: Record<string, unknown>): CodexApprovalRequest | null {
  // Modern item schema: an item with an explicit approval-pending affordance.
  const type = asString(event['type']);
  if (type === 'item.started' || type === 'item.updated') {
    const item = event['item'];
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const itemType = asString(record['item_type']) ?? asString(record['type']);
      const status = asString(record['status']);
      const needsApproval =
        status === 'awaiting_approval' || status === 'pending_approval' || record['approval'] === true;
      if (needsApproval && (itemType === 'command_execution' || itemType === 'file_change')) {
        return fromItem(itemType, record);
      }
    }
  }

  // Legacy msg-tagged protocol.
  const msg = event['msg'];
  if (msg && typeof msg === 'object') {
    return fromLegacyMsg(msg as Record<string, unknown>);
  }
  return null;
}

function fromItem(
  itemType: 'command_execution' | 'file_change',
  item: Record<string, unknown>,
): CodexApprovalRequest {
  const approvalId =
    asString(item['approval_id']) ?? asString(item['id']) ?? asString(item['item_id']) ?? 'codex_approval';
  if (itemType === 'command_execution') {
    const command = asString(item['command']) ?? '';
    return {
      approvalId,
      requiredAt: 'before_execution',
      reason: `codex requests approval to run: ${command}`,
      target: { command, toolName: 'shell' },
    };
  }
  return {
    approvalId,
    requiredAt: 'before_write',
    reason: 'codex requests approval to apply a file change',
    target: { toolName: 'apply_patch' },
  };
}

function fromLegacyMsg(msg: Record<string, unknown>): CodexApprovalRequest | null {
  const type = asString(msg['type']);
  const approvalId = asString(msg['call_id']) ?? asString(msg['id']) ?? 'codex_approval';
  if (type === 'exec_approval_request') {
    const commandValue = msg['command'];
    const command = Array.isArray(commandValue)
      ? commandValue.map((c) => String(c)).join(' ')
      : asString(commandValue) ?? '';
    return {
      approvalId,
      requiredAt: 'before_execution',
      reason: `codex requests approval to run: ${command}`,
      target: { command, toolName: 'shell' },
    };
  }
  if (type === 'apply_patch_approval_request') {
    return {
      approvalId,
      requiredAt: 'before_write',
      reason: 'codex requests approval to apply a patch',
      target: { toolName: 'apply_patch' },
    };
  }
  return null;
}

/** Build the ApprovalFrame the engine consumes from a detected request. */
export function toApprovalFrame(request: CodexApprovalRequest): ApprovalFrame {
  return {
    kind: 'approval',
    approvalId: request.approvalId,
    reason: request.reason,
    requiredAt: request.requiredAt,
    target: request.target,
  };
}

/**
 * Serialize an approval decision back into the JSONL line codex expects on stdin.
 * `approved` maps to codex's `approved`/`approved_for_session`; a denial to `denied`.
 */
export function serializeApprovalResponse(
  approvalId: string,
  approved: boolean,
): Record<string, unknown> {
  return {
    id: approvalId,
    op: {
      type: 'exec_approval',
      id: approvalId,
      decision: approved ? 'approved' : 'denied',
    },
  };
}
