/**
 * Handoff — a typed, depth-bounded transfer of work from one agent to another.
 *
 * Fuses the autonomous-routing handoff flow + delegation-chain shape from
 * `docker-backend/src/a2a/{autonomous-routing,delegation-chain}.service.ts`:
 * from/to, intent, prompt, depth, parent, and lifecycle status.
 */

import type { HandoffIntent } from './handoff-intent';

export type HandoffStatus =
  | 'initiated'
  | 'awaiting_approval'
  | 'delegated'
  | 'accepted'
  | 'completed'
  | 'rejected'
  | 'failed';

export const HANDOFF_STATUSES: readonly HandoffStatus[] = [
  'initiated',
  'awaiting_approval',
  'delegated',
  'accepted',
  'completed',
  'rejected',
  'failed',
] as const;

export type Handoff = {
  handoffId: string;
  intent: HandoffIntent;
  fromAgentId: string;
  toAgentId: string;
  spaceId?: string;
  channelId?: string;
  sourceTaskId?: string;
  targetTaskId?: string;
  prompt: string;
  status: HandoffStatus;
  /** Position in the delegation chain (root = 0). */
  depth: number;
  /** The handoff this one descends from, if any. */
  parentHandoffId?: string;
  /** Root handoff of the chain (for cycle/depth accounting). */
  rootHandoffId?: string;
  initiatedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
};
