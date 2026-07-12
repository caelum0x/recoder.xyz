import { describe, expect, it } from "vitest";
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
		expect(first.status).toBe("acquired");
		expect(first.lock?.lockId).toBe("lock_1");
		expect(first.lock?.holder).toBe("agent-a");
		expect(store.snapshot()).toHaveLength(1);

		// holder B is blocked ⇒ truthful conflict (never throws)
		const blocked = await engine.acquireLock("src/app.ts", "agent-b");
		expect(blocked.status).toBe("conflict");
		expect(blocked.lock).toBeUndefined();
		expect(blocked.conflict?.holder).toBe("agent-a");
		expect(blocked.reason).toMatch(/held by 'agent-a'/);
		// No lock was created for B.
		expect(store.snapshot()).toHaveLength(1);

		// A releases R
		const released = await engine.releaseLock("src/app.ts", "agent-a");
		expect(released.status).toBe("released");
		expect(released.released).toHaveLength(1);
		expect(store.snapshot()).toHaveLength(0);

		// B can now reacquire the freed resource
		const reacquire = await engine.acquireLock("src/app.ts", "agent-b");
		expect(reacquire.status).toBe("acquired");
		expect(reacquire.lock?.holder).toBe("agent-b");
	});

	it("is reentrant: the same holder re-acquiring renews in place (keeps lockId)", async () => {
		const clock = fakeClock();
		const engine = createCoordinationLockEngine({ now: clock.now, generateId: seqIds() });

		const a1 = await engine.acquireLock("r", "agent-a", { ttlMs: 1000 });
		expect(a1.lock?.lockId).toBe("lock_1");
		const firstExpiry = a1.lock?.expiresAt;

		clock.advance(500);
		const a2 = await engine.acquireLock("r", "agent-a", { ttlMs: 1000 });
		expect(a2.status).toBe("acquired");
		expect(a2.lock?.lockId).toBe("lock_1"); // same lock, renewed
		expect(a2.lock?.acquiredAt).toBe(a1.lock?.acquiredAt); // acquisition preserved
		expect(a2.lock?.expiresAt).not.toBe(firstExpiry); // expiry pushed out
	});
});

describe("createCoordinationLockEngine — detectConflict", () => {
	it("reports another holder's active lock, and no self-conflict", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		await engine.acquireLock("res", "agent-a");

		const other = await engine.detectConflict("res", "agent-b");
		expect(other.status).toBe("ok");
		expect(other.conflict).toBe(true);
		expect(other.holder).toBe("agent-a");
		expect(other.lock?.resource).toBe("res");

		const self = await engine.detectConflict("res", "agent-a");
		expect(self.conflict).toBe(false);
		expect(self.holder).toBeUndefined();

		const free = await engine.detectConflict("unheld", "agent-b");
		expect(free.conflict).toBe(false);
	});
});

describe("createCoordinationLockEngine — listLocks filter", () => {
	it("filters active locks by resource and by holder", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		await engine.acquireLock("a.ts", "agent-a");
		await engine.acquireLock("b.ts", "agent-a");
		await engine.acquireLock("c.ts", "agent-b");

		const all = await engine.listLocks();
		expect(all.status).toBe("ok");
		expect(all.locks).toHaveLength(3);

		const byHolder = await engine.listLocks({ holder: "agent-a" });
		expect(byHolder.locks.map((l) => l.resource).sort()).toEqual(["a.ts", "b.ts"]);

		const byResource = await engine.listLocks({ resource: "c.ts" });
		expect(byResource.locks).toHaveLength(1);
		expect(byResource.locks[0].holder).toBe("agent-b");

		const byBoth = await engine.listLocks({ resource: "a.ts", holder: "agent-b" });
		expect(byBoth.locks).toHaveLength(0);
	});

	it("excludes expired locks from listing and from conflict detection", async () => {
		const clock = fakeClock();
		const engine = createCoordinationLockEngine({ now: clock.now, generateId: seqIds() });
		await engine.acquireLock("r", "agent-a", { ttlMs: 1000 });

		expect((await engine.listLocks()).locks).toHaveLength(1);
		expect((await engine.detectConflict("r", "agent-b")).conflict).toBe(true);

		// Advance the clock past the TTL — the advisory lock is now inactive.
		clock.advance(1001);
		expect((await engine.listLocks()).locks).toHaveLength(0);
		expect((await engine.detectConflict("r", "agent-b")).conflict).toBe(false);

		// A different holder can acquire the expired resource without conflict.
		const reacquire = await engine.acquireLock("r", "agent-b", { ttlMs: 1000 });
		expect(reacquire.status).toBe("acquired");
	});
});

describe("createCoordinationLockEngine — release semantics", () => {
	it("refuses to release a lock held by a different holder (ownership-scoped)", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		await engine.acquireLock("r", "agent-a");

		const wrong = await engine.releaseLock("r", "agent-b");
		expect(wrong.status).toBe("not_found");
		expect(wrong.released).toHaveLength(0);
		// A's lock is untouched.
		expect((await engine.listLocks()).locks).toHaveLength(1);
	});

	it("releases by lock id as well as by resource key", async () => {
		const engine = createCoordinationLockEngine({ now: fakeClock().now, generateId: seqIds() });
		const acq = await engine.acquireLock("r", "agent-a");
		const byId = await engine.releaseLock(acq.lock?.lockId ?? "", "agent-a");
		expect(byId.status).toBe("released");
		expect((await engine.listLocks()).locks).toHaveLength(0);
	});
});

describe("createCoordinationLockEngine — degrade-safe (no store wired)", () => {
	it("returns truthful not_configured for every op, never throwing", async () => {
		const store: CoordinationLockStore = createUnconfiguredLockStore();
		const engine = createCoordinationLockEngine({ store, now: fakeClock().now });

		const acquire = await engine.acquireLock("r", "agent-a");
		expect(acquire.status).toBe("not_configured");
		expect(acquire.lock).toBeUndefined();
		expect(acquire.reason).toMatch(/not configured/);

		const release = await engine.releaseLock("r", "agent-a");
		expect(release.status).toBe("not_configured");
		expect(release.released).toEqual([]);

		const list = await engine.listLocks();
		expect(list.status).toBe("not_configured");
		expect(list.locks).toEqual([]);

		const detect = await engine.detectConflict("r", "agent-a");
		expect(detect.status).toBe("not_configured");
		expect(detect.conflict).toBe(false);
	});
});

describe("defaults", () => {
	it("applies the default TTL when none is supplied", async () => {
		const clock = fakeClock();
		const engine = createCoordinationLockEngine({ now: clock.now, generateId: seqIds() });
		const acq = await engine.acquireLock("r", "agent-a");
		const expiry = Date.parse(acq.lock?.expiresAt ?? "");
		expect(expiry).toBe(clock.now() + DEFAULT_LOCK_TTL_MS);
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
		expect((await engine.listLocks()).locks).toHaveLength(1);
		expect((await engine.detectConflict("pre", "agent-a")).conflict).toBe(true);
	});
});
