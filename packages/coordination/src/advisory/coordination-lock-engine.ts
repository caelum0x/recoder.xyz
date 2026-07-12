/**
 * advisory/coordination-lock-engine — the OWNED advisory coordination engine
 * (RECODER-ENGINES E13: work-locks, conflict detection, handoff). It mirrors
 * retrieval-engine.ts: an injectable store (`CoordinationLockStore`), an
 * injectable clock + id generator, and four total operations that return a
 * truthful status instead of throwing:
 *
 *   acquireLock(resource, holder, opts?) → { status: 'acquired'|'conflict'|'not_configured', lock? }
 *   releaseLock(lockId|resource, holder) → { status: 'released'|'not_found'|'not_configured' }
 *   listLocks(filter?)                   → { status: 'ok'|'not_configured', locks }
 *   detectConflict(resource, holder)     → { status: 'ok'|'not_configured', conflict, holder? }
 *
 * DEGRADE-SAFE (the hard rule): with no backing store (`configured === false`)
 * every op returns `status: 'not_configured'` with a truthful reason — never
 * throws, never fabricates. With the in-memory default everything works
 * in-process. Locks are ADVISORY + TTL-bounded: an expired lock never conflicts.
 *
 * Conflict model: a lock conflicts when an ACTIVE lock on the same `resource`
 * key is held by a DIFFERENT `holder`. Resource keys are compared by equality —
 * an opaque-key contract a richer (glob-aware) remote store may widen later.
 */
import {
	type CoordinationLock,
	type CoordinationLockStore,
	createInMemoryLockStore,
} from "./lock-store.js";

/** Default advisory lock lifetime when a caller supplies no `ttlMs`. */
export const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

export type AcquireStatus = "acquired" | "conflict" | "not_configured";
export type ReleaseStatus = "released" | "not_found" | "not_configured";
export type ListStatus = "ok" | "not_configured";
export type DetectStatus = "ok" | "not_configured";

export interface AcquireLockOptions {
	/** Lifetime in ms; defaults to {@link DEFAULT_LOCK_TTL_MS}. */
	ttlMs?: number;
	/** Context stored on the lock (handoff notes, run id, …). */
	metadata?: Record<string, unknown>;
	/** Explicit lock id (else one is generated). */
	lockId?: string;
}

export interface AcquireLockResult {
	status: AcquireStatus;
	/** The acquired (or renewed) lock when `status === 'acquired'`. */
	lock?: CoordinationLock;
	/** The blocking lock when `status === 'conflict'`. */
	conflict?: CoordinationLock;
	/** Truthful reason when conflicted or degraded. */
	reason?: string;
}

export interface ReleaseLockResult {
	status: ReleaseStatus;
	/** Locks actually removed (empty unless `status === 'released'`). */
	released: CoordinationLock[];
	reason?: string;
}

export interface LockFilter {
	/** Only locks on this exact resource key. */
	resource?: string;
	/** Only locks held by this holder. */
	holder?: string;
}

export interface ListLocksResult {
	status: ListStatus;
	/** Active (non-expired) locks matching the filter. */
	locks: CoordinationLock[];
	reason?: string;
}

export interface DetectConflictResult {
	status: DetectStatus;
	/** True when another holder holds an active lock on the resource. */
	conflict: boolean;
	/** The conflicting holder when `conflict` is true. */
	holder?: string;
	/** The conflicting lock when `conflict` is true. */
	lock?: CoordinationLock;
	reason?: string;
}

export interface CoordinationLockEngine {
	acquireLock(
		resource: string,
		holder: string,
		opts?: AcquireLockOptions,
	): Promise<AcquireLockResult>;
	releaseLock(lockIdOrResource: string, holder: string): Promise<ReleaseLockResult>;
	listLocks(filter?: LockFilter): Promise<ListLocksResult>;
	detectConflict(resource: string, holder: string): Promise<DetectConflictResult>;
}

export interface CoordinationLockEngineDeps {
	/** Lock persistence seam. Defaults to a degrade-safe in-memory store. */
	store?: CoordinationLockStore;
	/** Injectable clock returning epoch-ms. Defaults to `Date.now`. */
	now?: () => number;
	/** Injectable id generator. Defaults to `crypto.randomUUID` with a fallback. */
	generateId?: () => string;
	/** Default lock lifetime in ms. Defaults to {@link DEFAULT_LOCK_TTL_MS}. */
	defaultTtlMs?: number;
}

const NOT_CONFIGURED_REASON =
	"coordination not configured (no lock store wired)";

export function createCoordinationLockEngine(
	deps: CoordinationLockEngineDeps = {},
): CoordinationLockEngine {
	const store = deps.store ?? createInMemoryLockStore();
	const now = deps.now ?? (() => Date.now());
	const generateId = deps.generateId ?? defaultId;
	const defaultTtlMs =
		deps.defaultTtlMs && deps.defaultTtlMs > 0 ? deps.defaultTtlMs : DEFAULT_LOCK_TTL_MS;

	async function activeLocks(nowMs: number): Promise<CoordinationLock[]> {
		const all = await store.list();
		return all.filter((lock) => notExpired(lock, nowMs));
	}

	async function acquireLock(
		resource: string,
		holder: string,
		opts: AcquireLockOptions = {},
	): Promise<AcquireLockResult> {
		if (!store.configured) {
			return { status: "not_configured", reason: NOT_CONFIGURED_REASON };
		}
		const nowMs = now();
		const onResource = (await activeLocks(nowMs)).filter((l) => l.resource === resource);

		const conflict = onResource.find((l) => l.holder !== holder);
		if (conflict) {
			return {
				status: "conflict",
				conflict,
				reason: `resource '${resource}' is held by '${conflict.holder}' until ${conflict.expiresAt}`,
			};
		}

		// Same holder re-acquiring ⇒ renew in place (idempotent, keeps lockId).
		const existing = onResource.find((l) => l.holder === holder);
		const ttlMs = opts.ttlMs && opts.ttlMs > 0 ? opts.ttlMs : defaultTtlMs;
		const acquiredAt = existing ? existing.acquiredAt : new Date(nowMs).toISOString();
		const metadata = opts.metadata ?? existing?.metadata;
		const lock: CoordinationLock = {
			lockId: existing?.lockId ?? (opts.lockId?.trim() || generateId()),
			resource,
			holder,
			acquiredAt,
			expiresAt: new Date(nowMs + ttlMs).toISOString(),
			...(metadata ? { metadata } : {}),
		};

		const ok = await store.put(lock);
		if (!ok) {
			return { status: "not_configured", reason: "lock store rejected the write" };
		}
		return { status: "acquired", lock };
	}

	async function releaseLock(
		lockIdOrResource: string,
		holder: string,
	): Promise<ReleaseLockResult> {
		if (!store.configured) {
			return { status: "not_configured", released: [], reason: NOT_CONFIGURED_REASON };
		}
		const all = await store.list();
		// Ownership-scoped: only the holder can release. Matches by lock id OR
		// resource key so callers can release without tracking the generated id.
		const targets = all.filter(
			(l) =>
				l.holder === holder &&
				(l.lockId === lockIdOrResource || l.resource === lockIdOrResource),
		);
		if (targets.length === 0) {
			return {
				status: "not_found",
				released: [],
				reason: `no lock '${lockIdOrResource}' held by '${holder}'`,
			};
		}
		const released: CoordinationLock[] = [];
		for (const target of targets) {
			if (await store.remove(target.lockId)) {
				released.push(target);
			}
		}
		if (released.length === 0) {
			return {
				status: "not_found",
				released: [],
				reason: "lock store removed nothing",
			};
		}
		return { status: "released", released };
	}

	async function listLocks(filter: LockFilter = {}): Promise<ListLocksResult> {
		if (!store.configured) {
			return { status: "not_configured", locks: [], reason: NOT_CONFIGURED_REASON };
		}
		let locks = await activeLocks(now());
		if (filter.resource) {
			locks = locks.filter((l) => l.resource === filter.resource);
		}
		if (filter.holder) {
			locks = locks.filter((l) => l.holder === filter.holder);
		}
		return { status: "ok", locks };
	}

	async function detectConflict(
		resource: string,
		holder: string,
	): Promise<DetectConflictResult> {
		if (!store.configured) {
			return { status: "not_configured", conflict: false, reason: NOT_CONFIGURED_REASON };
		}
		const lock = (await activeLocks(now())).find(
			(l) => l.resource === resource && l.holder !== holder,
		);
		if (!lock) {
			return { status: "ok", conflict: false };
		}
		return { status: "ok", conflict: true, holder: lock.holder, lock };
	}

	return { acquireLock, releaseLock, listLocks, detectConflict };
}

function notExpired(lock: CoordinationLock, nowMs: number): boolean {
	const expiry = Date.parse(lock.expiresAt);
	// A lock with an unparseable expiry is treated as active (fail-closed for
	// coordination: better to over-hold than to silently drop a live lock).
	return Number.isNaN(expiry) ? true : expiry > nowMs;
}

/** Default id generator (crypto.randomUUID with a timestamp fallback). */
function defaultId(): string {
	try {
		const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
		if (c && typeof c.randomUUID === "function") {
			return `lock_${c.randomUUID()}`;
		}
	} catch {
		// fall through
	}
	return `lock_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
