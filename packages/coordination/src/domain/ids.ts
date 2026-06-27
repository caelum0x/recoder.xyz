/**
 * Branded id types. Nominal typing prevents passing a TaskId where a LockId is
 * expected. Brands are erased at runtime (they are plain strings).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type LockId = Brand<string, 'LockId'>;
export type ClaimId = Brand<string, 'ClaimId'>;
export type HandoffId = Brand<string, 'HandoffId'>;
export type DelegationId = Brand<string, 'DelegationId'>;
export type SquadId = Brand<string, 'SquadId'>;
export type RunId = Brand<string, 'RunId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type SpaceId = Brand<string, 'SpaceId'>;
export type AgentId = Brand<string, 'AgentId'>;
export type EventId = Brand<string, 'EventId'>;
export type SignalId = Brand<string, 'SignalId'>;

export const asLockId = (value: string): LockId => value as LockId;
export const asClaimId = (value: string): ClaimId => value as ClaimId;
export const asHandoffId = (value: string): HandoffId => value as HandoffId;
export const asDelegationId = (value: string): DelegationId => value as DelegationId;
export const asSquadId = (value: string): SquadId => value as SquadId;
export const asRunId = (value: string): RunId => value as RunId;
export const asTaskId = (value: string): TaskId => value as TaskId;
export const asSpaceId = (value: string): SpaceId => value as SpaceId;
export const asAgentId = (value: string): AgentId => value as AgentId;
export const asEventId = (value: string): EventId => value as EventId;
export const asSignalId = (value: string): SignalId => value as SignalId;
