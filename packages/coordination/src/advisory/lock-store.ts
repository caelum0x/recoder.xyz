/**
 * advisory/lock-store — the `CoordinationLockStore` seam the advisory
 * coordination engine (RECODER-ENGINES E13) composes over. It is INJECTED,
 * exactly like retrieval's `VectorStorePort`: the default in-memory store makes
 * everything work in-process, while a Go `multica` daemon or a DB-backed store
 * can fill the same port later with NO change to the engine.
 *
 * This is deliberately DISTINCT from the package's richer `LockStorePort`
 * (fence-token CAS, space/repo scopes, throws on violation). This port is the
 * thin, degrade-safe persistence seam for the MCP skin: a truthful `configured`
 * flag plus three total operations that never throw.
 *
 * DEGRADE CONTRACT: when the backing store is not wired (`configured === false`)
 * every method is a truthful no-op — `put`/`remove` return `false`, `list`
 * returns `[]`. Nothing throws.
 */

/** An advisory, TTL-bounded lock on an opaque `resource` key held by `holder`. */
export interface CoordinationLock {
	/** Stable id for this lock (used by release + renew). */
	lockId: string;
	/** Opaque resource key the lock guards (path glob, file, queue, etc.). */
	resource: string;
	/** Logical owner id (agent id, task id, worker id). */
	holder: string;
	/** ISO-8601 acquisition time. */
	acquiredAt: string;
	/** ISO-8601 expiry; the lock is advisory-inactive once the clock passes it. */
	expiresAt: string;
	/** Optional caller-supplied context (handoff notes, run id, …). */
	metadata?: Record<string, unknown>;
}

export interface CoordinationLockStore {
	/** True when a backing store is wired; false ⇒ every method is a no-op. */
	readonly configured: boolean;
	/** All stored locks (active + expired); the engine filters by expiry. */
	list(): Promise<CoordinationLock[]>;
	/** Insert/replace a lock by `lockId`. No-op / failure ⇒ false. */
	put(lock: CoordinationLock): Promise<boolean>;
	/** Remove a lock by id. Returns true iff a lock was removed. */
	remove(lockId: string): Promise<boolean>;
}

/**
 * In-memory `CoordinationLockStore` — the degrade-safe default. Backed by a Map
 * keyed on `lockId`; everything works in-process with zero external services.
 * `snapshot()` is a test/debug aid (returns a copy of the current locks).
 */
export function createInMemoryLockStore(
	seed?: readonly CoordinationLock[],
): CoordinationLockStore & { snapshot(): CoordinationLock[] } {
	const locks = new Map<string, CoordinationLock>();
	for (const lock of seed ?? []) {
		locks.set(lock.lockId, { ...lock });
	}
	return {
		configured: true,
		async list() {
			return [...locks.values()].map((lock) => ({ ...lock }));
		},
		async put(lock) {
			locks.set(lock.lockId, { ...lock });
			return true;
		},
		async remove(lockId) {
			return locks.delete(lockId);
		},
		snapshot() {
			return [...locks.values()].map((lock) => ({ ...lock }));
		},
	};
}

/**
 * A truthfully-unconfigured store: represents a remote store seam that is wired
 * in shape but not reachable/enabled. Every method is a no-op. The engine reads
 * `configured === false` and degrades to `status: 'not_configured'`.
 */
export function createUnconfiguredLockStore(): CoordinationLockStore {
	return {
		configured: false,
		async list() {
			return [];
		},
		async put() {
			return false;
		},
		async remove() {
			return false;
		},
	};
}
