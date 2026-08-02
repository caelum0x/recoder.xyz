import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	createCoordinationLockEngine,
	DEFAULT_LOCK_TTL_MS,
} from "./coordination-lock-engine.js";
import {
	type CoordinationLock,
	type CoordinationLockStore,
	createInMemoryLockStore,
	createUnconfiguredLockStore,
} from "./lock-store.js";

// ── Deterministic fakes (no clock, no network, no fs) ───────────────────────

/** A monotonic fake clock the tests advance by hand. */
function fakeClock(startMs = 1_000_000): { now: () => number; advance(ms: number): void } {
	let t = startMs;
	return {
		now: () => t,
		advance(ms: number) {
			t += ms;
		},
	};
}

/** Sequential id generator so lock ids are stable + assertable. */
function seqIds(): () => string {
	let n = 0;
	return () => `lock_${++n}`;
}

describe("createCoordinationLockEngine — acquire / conflict / release / reacquire", () => {
	it("acquires, conflicts on a second holder, releases, then reacquires", async () => {
		const clock = fakeClock();
		const store = createInMemoryLockStore();
		const engine = createCoordinationLockEngine({
			store,
			now: clock.now,
			generateId: seqIds(),
		});

		// holder A acquires resource R
		const first = await engine.acquireLock("src/app.ts", "agent-a");
		assert.equal(first.status, "acquired");
		assert.equal(first.lock?.lockId, "lock_1");
		assert.equal(first.lock?.holder, "agent-a");
		assert.equal(store.snapshot().length, 1);

		// holder B is blocked ⇒ truthful conflict (never throws)
		const blocked = await engine.acquireLock("src/app.ts", "agent-b");
		assert.equal(blocked.status, "conflict");
		assert.equal(blocked.lock, undefined);
		assert.equal(blocked.conflict?.holder, "agent-a");
		assert.match(blocked.reason ?? "", /held by 'agent-a'/);
		// No lock was created for B.
		assert.equal(store.snapshot().length, 1);

		// A releases R
		const released = await engine.releaseLock("src/app.ts", "agent-a");
		assert.equal(released.status, "released");
		assert.equal(released.released.length, 1);
		assert.equal(store.snapshot().length, 0);

		// B can now reacquire the freed resource
		const reacquire = await engine.acquireLock("src/app.ts", "agent-b");
		assert.equal(reacquire.status, "acquired");
		assert.equal(reacquire.lock?.holder, "agent-b");
	});

	it("is reentrant: the same holder re-acquiring renews in place (keeps lockId)", async () => {
		const clock = fakeClock();
		const engine = createCoordinationLockEngine({ now: clock.now, generateId: seqIds() });

		const a1 = await engine.acquireLock("r", "agent-a", { ttlMs: 1000 });
		assert.equal(a1.lock?.lockId, "lock_1");
		const firstExpiry = a1.lock?.expiresAt;

		clock.advance(500);
		const a2 = await engine.acquireLock("r", "agent-a", { ttlMs: 1000 });
		assert.equal(a2.status, "acquired");
		assert.equal(a2.lock?.lockId, "lock_1"); // same lock, renewed
		assert.equal(a2.lock?.acquiredAt, a1.lock?.acquiredAt); // acquisition preserved
		assert.notEqual(a2.lock?.expiresAt, firstExpiry); // expiry pushed out
	});
});

describe("createCoordinationLockEngine — detectConflict", () => {
	it("reports another holder's active lock, and no self-conflict", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		await engine.acquireLock("res", "agent-a");

		const other = await engine.detectConflict("res", "agent-b");
		assert.equal(other.status, "ok");
		assert.equal(other.conflict, true);
		assert.equal(other.holder, "agent-a");
		assert.equal(other.lock?.resource, "res");

		const self = await engine.detectConflict("res", "agent-a");
		assert.equal(self.conflict, false);
		assert.equal(self.holder, undefined);

		const free = await engine.detectConflict("unheld", "agent-b");
		assert.equal(free.conflict, false);
	});
});

describe("createCoordinationLockEngine — listLocks filter", () => {
	it("filters active locks by resource and by holder", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		await engine.acquireLock("a.ts", "agent-a");
		await engine.acquireLock("b.ts", "agent-a");
		await engine.acquireLock("c.ts", "agent-b");

		const all = await engine.listLocks();
		assert.equal(all.status, "ok");
		assert.equal(all.locks.length, 3);

		const byHolder = await engine.listLocks({ holder: "agent-a" });
		assert.deepEqual(byHolder.locks.map((l) => l.resource).sort(), ["a.ts", "b.ts"]);

		const byResource = await engine.listLocks({ resource: "c.ts" });
		assert.equal(byResource.locks.length, 1);
		assert.equal(byResource.locks[0].holder, "agent-b");

		const byBoth = await engine.listLocks({ resource: "a.ts", holder: "agent-b" });
		assert.equal(byBoth.locks.length, 0);
	});

	it("excludes expired locks from listing and from conflict detection", async () => {
		const clock = fakeClock();
		const engine = createCoordinationLockEngine({ now: clock.now, generateId: seqIds() });
		await engine.acquireLock("r", "agent-a", { ttlMs: 1000 });

		assert.equal((await engine.listLocks()).locks.length, 1);
		assert.equal((await engine.detectConflict("r", "agent-b")).conflict, true);

		// Advance the clock past the TTL — the advisory lock is now inactive.
		clock.advance(1001);
		assert.equal((await engine.listLocks()).locks.length, 0);
		assert.equal((await engine.detectConflict("r", "agent-b")).conflict, false);

		// A different holder can acquire the expired resource without conflict.
		const reacquire = await engine.acquireLock("r", "agent-b", { ttlMs: 1000 });
		assert.equal(reacquire.status, "acquired");
	});
});

describe("createCoordinationLockEngine — release semantics", () => {
	it("refuses to release a lock held by a different holder (ownership-scoped)", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		await engine.acquireLock("r", "agent-a");

		const wrong = await engine.releaseLock("r", "agent-b");
		assert.equal(wrong.status, "not_found");
		assert.equal(wrong.released.length, 0);
		// A's lock is untouched.
		assert.equal((await engine.listLocks()).locks.length, 1);
	});

	it("releases by lock id as well as by resource key", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		const acq = await engine.acquireLock("r", "agent-a");
		const byId = await engine.releaseLock(acq.lock?.lockId ?? "", "agent-a");
		assert.equal(byId.status, "released");
		assert.equal((await engine.listLocks()).locks.length, 0);
	});
});

describe("createCoordinationLockEngine — degrade-safe (no store wired)", () => {
	it("returns truthful not_configured for every op, never throwing", async () => {
		const store: CoordinationLockStore = createUnconfiguredLockStore();
		const engine = createCoordinationLockEngine({ store, now: fakeClock().now });

		const acquire = await engine.acquireLock("r", "agent-a");
		assert.equal(acquire.status, "not_configured");
		assert.equal(acquire.lock, undefined);
		assert.match(acquire.reason ?? "", /not configured/);

		const release = await engine.releaseLock("r", "agent-a");
		assert.equal(release.status, "not_configured");
		assert.deepEqual(release.released, []);

		const list = await engine.listLocks();
		assert.equal(list.status, "not_configured");
		assert.deepEqual(list.locks, []);

		const detect = await engine.detectConflict("r", "agent-a");
		assert.equal(detect.status, "not_configured");
		assert.equal(detect.conflict, false);
	});
});

describe("defaults", () => {
	it("applies the default TTL when none is supplied", async () => {
		const clock = fakeClock();
		const engine = createCoordinationLockEngine({ now: clock.now, generateId: seqIds() });
		const acq = await engine.acquireLock("r", "agent-a");
		const expiry = Date.parse(acq.lock?.expiresAt ?? "");
		assert.equal(expiry, clock.now() + DEFAULT_LOCK_TTL_MS);
	});

	it("seeds an in-memory store and honors the injected clock", async () => {
		const seed: CoordinationLock[] = [
			{
				lockId: "seed-1",
				resource: "pre",
				holder: "agent-z",
				acquiredAt: new Date(1_000_000).toISOString(),
				expiresAt: new Date(2_000_000).toISOString(),
			},
		];
		const clock = fakeClock(1_500_000); // between acquire + expiry
		const engine = createCoordinationLockEngine({
			store: createInMemoryLockStore(seed),
			now: clock.now,
		});
		assert.equal((await engine.listLocks()).locks.length, 1);
		assert.equal((await engine.detectConflict("pre", "agent-a")).conflict, true);
	});
});
