/**
 * Effect ADT — the key architectural seam. The pure core (engine, locks,
 * dispatch, handoff, coherence) NEVER performs IO; it returns `Effect[]` and
 * `engine/effect-runner.ts` is the ONLY place that interprets them against
 * ports. This keeps every capability module deterministic and unit-testable
 * without a DB, NATS, or clock.
 *
 * Each variant is a discriminated union member keyed by `type`.
 */

import type { CoherenceFinding } from './coherence-finding';
import type { CoordinationEvent } from './coordination-event';
import type { HandoffEnvelope } from './handoff-envelope';
import type { TaskClaim } from './task-claim';
import type { WorkLock } from './work-lock';
import type { WorkSignal } from './work-signal';

export type PersistLockEffect = {
  type: 'PersistLock';
  lock: WorkLock;
};

export type ReleaseLockEffect = {
  type: 'ReleaseLock';
  lockId: string;
  ownerAgentId?: string;
  taskId?: string;
};

export type CommitClaimEffect = {
  type: 'CommitClaim';
  claim: TaskClaim;
};

export type ReleaseClaimEffect = {
  type: 'ReleaseClaim';
  claimId: string;
  taskId: string;
};

export type PublishEventEffect = {
  type: 'PublishEvent';
  event: CoordinationEvent;
};

export type EmitSignalEffect = {
  type: 'EmitSignal';
  signal: WorkSignal;
};

export type DeliverHandoffEffect = {
  type: 'DeliverHandoff';
  envelope: HandoffEnvelope;
};

export type NotifyAgentEffect = {
  type: 'NotifyAgent';
  agentId: string;
  claimId: string;
  taskId: string;
};

export type RecordFindingEffect = {
  type: 'RecordFinding';
  finding: CoherenceFinding;
};

export type MarkPresenceOfflineEffect = {
  type: 'MarkPresenceOffline';
  agentId: string;
};

export type Effect =
  | PersistLockEffect
  | ReleaseLockEffect
  | CommitClaimEffect
  | ReleaseClaimEffect
  | PublishEventEffect
  | EmitSignalEffect
  | DeliverHandoffEffect
  | NotifyAgentEffect
  | RecordFindingEffect
  | MarkPresenceOfflineEffect;

export type EffectType = Effect['type'];
