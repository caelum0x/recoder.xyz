/**
 * engine/ barrel — the orchestration brain (substrate-agnostic lifecycle).
 *
 * The persisted Workspace lifecycle ported behavior-preserving from the proven
 * docker-backend workspace-service. Backend-free: every dependency is an
 * injected port (repository, brain, lock, admission, run-tailer, substrate
 * registry, scan, logger, clock, id). The reconciler lives in ../reconcile.
 */
export { WorkspaceEngine, ADMISSION_REJECTED_PREFIX } from './workspace-engine.js';
export type { WorkspaceEngineDeps } from './deps.js';
export type { CreateWorkspaceInput, ReconcileReport } from './types.js';
