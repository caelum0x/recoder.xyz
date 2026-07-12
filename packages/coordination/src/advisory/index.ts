/**
 * advisory — the degrade-safe, retrieval-shaped coordination engine seam
 * (RECODER-ENGINES E13). This is the surface the `recoder.coordination` MCP skin
 * composes: an advisory lock engine over an INJECTABLE `CoordinationLockStore`
 * (in-memory default; remote store fills the same port later).
 *
 * It complements — does not replace — the package's richer CQRS
 * `CoordinationEngine`. Names are deliberately non-colliding.
 */
export {
	type CoordinationLock,
	type CoordinationLockStore,
	createInMemoryLockStore,
	createUnconfiguredLockStore,
} from "./lock-store.js";
export {
	createCoordinationLockEngine,
	DEFAULT_LOCK_TTL_MS,
	type AcquireLockOptions,
	type AcquireLockResult,
	type AcquireStatus,
	type CoordinationLockEngine,
	type CoordinationLockEngineDeps,
	type DetectConflictResult,
	type DetectStatus,
	type ListLocksResult,
	type ListStatus,
	type LockFilter,
	type ReleaseLockResult,
	type ReleaseStatus,
} from "./coordination-lock-engine.js";
