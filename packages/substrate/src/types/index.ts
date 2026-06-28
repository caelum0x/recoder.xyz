/**
 * types/ barrel — shared domain-adjacent types (no behavior).
 */
export type { SubstrateId } from './substrate-id.js';
export type { ConductorRuntimeId } from './runtime-id.js';
export { CONDUCTOR_RUNTIME_IDS } from './runtime-id.js';
export type {
  RuntimeCommandOptions,
  RuntimeSpec,
  ResolvedRuntimeCommand,
  RuntimeAvailability,
} from './command.js';
export type { CaptureResult, CaptureDelta } from './capture.js';
export type { Liveness, LivenessSource } from './liveness.js';
export type { ProvisionResult } from './provision.js';
export type {
  OrphanKind,
  ReconcileFinding,
  SubstrateReconcileReport,
} from './reconcile.js';
