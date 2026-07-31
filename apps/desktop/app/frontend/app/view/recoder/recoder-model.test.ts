// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    attentionBadgeLabel,
    bucketWorkspaceGroups,
    computePairwise,
    computeSiblingOverlap,
    computeSuggestedWinner,
    detectAttentionTransitions,
    detectNeedsInputTransitions,
    filterWorkspaces,
    formatRelativeAge,
    groupByTaskGroup,
    isNeedsInputAttention,
    isTerminalWorkspaceState,
    suggestNextAction,
    workspaceAttentionMap,
    workspaceStateMap,
    deriveProjectIdentity,
    deriveProjects,
    filterByProject,
    parseGhqLayout,
    workspaceSearchKeywords,
    DEFAULT_PROJECT_ID,
    TASK_GROUP_METADATA_KEY,
    type ContestedFile,
    type RecoderWorkspace,
    type RecoderWorkspaceGroup,
    type RecoderWorkspaceReadiness,
    type SiblingCompareEntry,
} from "./recoder-board-logic";

let wsSeq = 0;

function makeWs(overrides: Partial<RecoderWorkspace> = {}): RecoderWorkspace {
    wsSeq += 1;
    return {
        workspaceId: `ws-${wsSeq}`,
        branch: `agent/branch-${wsSeq}`,
        runtimeId: "claude_code",
        worktreePath: `/tmp/worktrees/ws-${wsSeq}`,
        state: "running",
        ...overrides,
    };
}

function makeSibling(overrides: Partial<SiblingCompareEntry> = {}): SiblingCompareEntry {
    wsSeq += 1;
    return {
        workspaceId: `ws-${wsSeq}`,
        agent: "claude_code",
        runtimeId: "claude_code",
        branch: `agent/branch-${wsSeq}`,
        state: "awaiting_review",
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T11:00:00.000Z",
        ...overrides,
    };
}

describe("isTerminalWorkspaceState", () => {
    it("treats archived AND failed as terminal-dead", () => {
        expect(isTerminalWorkspaceState("archived")).toBe(true);
        expect(isTerminalWorkspaceState("failed")).toBe(true);
    });

    it("keeps live states non-terminal", () => {
        for (const state of ["created", "running", "setting_up", "ready", "awaiting_review", ""]) {
            expect(isTerminalWorkspaceState(state)).toBe(false);
        }
    });
});

describe("filterWorkspaces — Show views", () => {
    const running = makeWs({ state: "running" });
    const archived = makeWs({ state: "archived" });
    const failed = makeWs({ state: "failed" });
    const all = [running, archived, failed];

    it("active hides both archived and failed", () => {
        expect(filterWorkspaces(all, "active", "")).toEqual([running]);
    });

    it("archived shows exactly the terminal-dead rows (archived + failed)", () => {
        expect(filterWorkspaces(all, "archived", "")).toEqual([archived, failed]);
    });

    it("all shows everything without refiltering", () => {
        expect(filterWorkspaces(all, "all", "")).toEqual(all);
    });
});

describe("filterWorkspaces — text query", () => {
    it("matches branch, case-insensitively, with surrounding whitespace trimmed", () => {
        const ws = makeWs({ branch: "agent/Fix-Login" });
        expect(filterWorkspaces([ws], "active", "  fix-login  ")).toEqual([ws]);
        expect(filterWorkspaces([ws], "active", "nomatch")).toEqual([]);
    });

    it("matches the raw runtimeId and its friendly agent label", () => {
        const ws = makeWs({ runtimeId: "claude_code", branch: "b" });
        expect(filterWorkspaces([ws], "active", "claude_code")).toEqual([ws]);
        expect(filterWorkspaces([ws], "active", "claude code")).toEqual([ws]);
    });

    it("matches metadata.title, falling back to metadata.prompt", () => {
        const titled = makeWs({ branch: "b1", metadata: { title: "Fix the auth flow" } });
        const prompted = makeWs({ branch: "b2", metadata: { prompt: "refactor billing" } });
        expect(filterWorkspaces([titled, prompted], "active", "auth flow")).toEqual([titled]);
        expect(filterWorkspaces([titled, prompted], "active", "billing")).toEqual([prompted]);
    });

    it("a non-string title degrades to no match instead of throwing", () => {
        const ws = makeWs({ branch: "b", metadata: { title: 42 } });
        expect(filterWorkspaces([ws], "active", "42")).toEqual([]);
    });

    it("missing branch/runtimeId degrade to no match instead of throwing", () => {
        const ws = makeWs({ branch: undefined, runtimeId: undefined });
        expect(filterWorkspaces([ws], "active", "anything")).toEqual([]);
        expect(filterWorkspaces([ws], "active", "")).toEqual([ws]);
    });

    it("query applies on top of the Show slice", () => {
        const live = makeWs({ state: "running", branch: "agent/shared-name" });
        const dead = makeWs({ state: "failed", branch: "agent/shared-name" });
        expect(filterWorkspaces([live, dead], "active", "shared-name")).toEqual([live]);
        expect(filterWorkspaces([live, dead], "archived", "shared-name")).toEqual([dead]);
    });
});

describe("groupByTaskGroup", () => {
    it("groups siblings sharing a taskGroup, preserving first-seen order", () => {
        const a1 = makeWs({ metadata: { [TASK_GROUP_METADATA_KEY]: "grp-a" } });
        const solo = makeWs({});
        const b1 = makeWs({ metadata: { [TASK_GROUP_METADATA_KEY]: "grp-b" } });
        const a2 = makeWs({ metadata: { [TASK_GROUP_METADATA_KEY]: "grp-a" } });
        const groups = groupByTaskGroup([a1, solo, b1, a2]);
        expect(groups).toEqual([
            { taskGroup: "grp-a", workspaces: [a1, a2] },
            { taskGroup: null, workspaces: [solo] },
            { taskGroup: "grp-b", workspaces: [b1] },
        ]);
    });

    it("missing, blank, and non-string taskGroup all fall to solo singleton groups", () => {
        const noMeta = makeWs({});
        const blank = makeWs({ metadata: { [TASK_GROUP_METADATA_KEY]: "" } });
        const nonString = makeWs({ metadata: { [TASK_GROUP_METADATA_KEY]: 7 } });
        const groups = groupByTaskGroup([noMeta, blank, nonString]);
        expect(groups).toHaveLength(3);
        for (const g of groups) {
            expect(g.taskGroup).toBeNull();
            expect(g.workspaces).toHaveLength(1);
        }
    });

    it("returns [] for an empty list", () => {
        expect(groupByTaskGroup([])).toEqual([]);
    });
});

// Fixed local-midnight-relative clock so bucket boundary tests are deterministic
// in any timezone: build timestamps from the SAME local-date arithmetic the
// implementation uses.
const DAY_MS = 86400000;
const Now = new Date(2026, 6, 22, 12, 30, 0);
const StartOfToday = new Date(2026, 6, 22).getTime();

function wsAt(t: number, overrides: Partial<RecoderWorkspace> = {}): RecoderWorkspace {
    return makeWs({ createdAt: new Date(t).toISOString(), ...overrides });
}

function soloGroup(ws: RecoderWorkspace): RecoderWorkspaceGroup {
    return { taskGroup: null, workspaces: [ws] };
}

function bucketIdsFor(t: number): string[] {
    return bucketWorkspaceGroups([soloGroup(wsAt(t))], Now).map((b) => b.id);
}

describe("bucketWorkspaceGroups — boundaries", () => {
    it("start-of-today exactly is today; one ms before is yesterday", () => {
        expect(bucketIdsFor(StartOfToday)).toEqual(["today"]);
        expect(bucketIdsFor(StartOfToday - 1)).toEqual(["yesterday"]);
    });

    it("exactly one DAY before start-of-today is still yesterday; one ms earlier is this week", () => {
        expect(bucketIdsFor(StartOfToday - DAY_MS)).toEqual(["yesterday"]);
        expect(bucketIdsFor(StartOfToday - DAY_MS - 1)).toEqual(["week"]);
    });

    it("exactly six DAYs before start-of-today is this week; one ms earlier is older", () => {
        expect(bucketIdsFor(StartOfToday - 6 * DAY_MS)).toEqual(["week"]);
        expect(bucketIdsFor(StartOfToday - 6 * DAY_MS - 1)).toEqual(["older"]);
    });

    it("a future timestamp still lands in today (>= start-of-today)", () => {
        expect(bucketIdsFor(Now.getTime() + DAY_MS)).toEqual(["today"]);
    });
});

describe("bucketWorkspaceGroups — degraded timestamps", () => {
    it("missing createdAt buckets to older, never a fabricated age", () => {
        const groups = bucketWorkspaceGroups([soloGroup(makeWs({ createdAt: undefined }))], Now);
        expect(groups.map((b) => b.id)).toEqual(["older"]);
    });

    it("unparseable and empty createdAt bucket to older", () => {
        expect(bucketWorkspaceGroups([soloGroup(makeWs({ createdAt: "not-a-date" }))], Now).map((b) => b.id)).toEqual([
            "older",
        ]);
        expect(bucketWorkspaceGroups([soloGroup(makeWs({ createdAt: "" }))], Now).map((b) => b.id)).toEqual(["older"]);
    });

    it("a group's age is its NEWEST sibling — one fresh sibling lifts the group out of older", () => {
        const stale = wsAt(StartOfToday - 30 * DAY_MS);
        const broken = makeWs({ createdAt: "garbage" });
        const fresh = wsAt(StartOfToday + 1000);
        const group: RecoderWorkspaceGroup = { taskGroup: "grp", workspaces: [stale, broken, fresh] };
        const buckets = bucketWorkspaceGroups([group], Now);
        expect(buckets.map((b) => b.id)).toEqual(["today"]);
        expect(buckets[0].groups[0].workspaces).toHaveLength(3);
    });
});

describe("bucketWorkspaceGroups — ordering", () => {
    it("emits fixed bucket order (today, yesterday, week, older) omitting empty buckets", () => {
        const groups = [
            soloGroup(wsAt(StartOfToday - 10 * DAY_MS)),
            soloGroup(wsAt(StartOfToday + 1000)),
            soloGroup(wsAt(StartOfToday - DAY_MS + 1000)),
        ];
        expect(bucketWorkspaceGroups(groups, Now).map((b) => b.id)).toEqual(["today", "yesterday", "older"]);
    });

    it("sorts newest group first within a bucket; timestampless groups sink last", () => {
        const older1 = soloGroup(wsAt(StartOfToday - 10 * DAY_MS));
        const older2 = soloGroup(wsAt(StartOfToday - 8 * DAY_MS));
        const noTs = soloGroup(makeWs({ createdAt: undefined }));
        const buckets = bucketWorkspaceGroups([noTs, older1, older2], Now);
        expect(buckets).toHaveLength(1);
        expect(buckets[0].groups).toEqual([older2, older1, noTs]);
    });

    it("labels come from the fixed defs", () => {
        const buckets = bucketWorkspaceGroups([soloGroup(wsAt(StartOfToday))], Now);
        expect(buckets[0].label).toBe("Today");
    });

    it("returns [] for no groups", () => {
        expect(bucketWorkspaceGroups([], Now)).toEqual([]);
    });
});

describe("formatRelativeAge", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");

    function ageOf(msAgo: number): string {
        return formatRelativeAge(new Date(now.getTime() - msAgo).toISOString(), now);
    }

    it("returns empty string for missing/empty/unparseable createdAt (no fabricated age)", () => {
        expect(formatRelativeAge("", now)).toBe("");
        expect(formatRelativeAge(undefined as unknown as string, now)).toBe("");
        expect(formatRelativeAge("not-a-date", now)).toBe("");
    });

    it("under a minute is just now", () => {
        expect(ageOf(0)).toBe("just now");
        expect(ageOf(59999)).toBe("just now");
    });

    it("minutes then hours then days then weeks, each at its floor boundary", () => {
        expect(ageOf(60000)).toBe("1m ago");
        expect(ageOf(59 * 60000)).toBe("59m ago");
        expect(ageOf(60 * 60000)).toBe("1h ago");
        expect(ageOf(23 * 3600000)).toBe("23h ago");
        expect(ageOf(24 * 3600000)).toBe("1d ago");
        expect(ageOf(6 * DAY_MS)).toBe("6d ago");
        expect(ageOf(7 * DAY_MS)).toBe("1w ago");
        expect(ageOf(21 * DAY_MS)).toBe("3w ago");
    });
});

describe("computePairwise", () => {
    it("delta is A minus B when both diffStats are real", () => {
        const a = makeSibling({ diffStat: { additions: 10, deletions: 4, files: 3 } });
        const b = makeSibling({ diffStat: { additions: 6, deletions: 9, files: 1 } });
        const view = computePairwise(a, b, []);
        expect(view.delta).toEqual({ additions: 4, deletions: -5, files: 2 });
    });

    it("delta is ABSENT (never a fabricated 0) when either side's diffStat is missing", () => {
        const a = makeSibling({ diffStat: { additions: 10, deletions: 4, files: 3 } });
        const b = makeSibling({});
        expect(computePairwise(a, b, []).delta).toBeUndefined();
        expect(computePairwise(b, a, []).delta).toBeUndefined();
    });

    it("shared is the intersection when both changedFiles lists are present", () => {
        const a = makeSibling({ changedFiles: ["src/x.ts", "src/y.ts", "src/z.ts"] });
        const b = makeSibling({ changedFiles: ["src/y.ts", "src/z.ts", "src/w.ts"] });
        const view = computePairwise(a, b, []);
        expect(view.shared).toEqual(["src/y.ts", "src/z.ts"]);
        expect(view.sharedReason).toBeUndefined();
    });

    it("falls back to the contested set restricted to this pair when a list is absent, with a reason", () => {
        const a = makeSibling({});
        const b = makeSibling({ changedFiles: ["src/y.ts"] });
        const other = makeSibling({});
        const contested: ContestedFile[] = [
            { path: "src/pair.ts", workspaceIds: [a.workspaceId, b.workspaceId] },
            { path: "src/not-b.ts", workspaceIds: [a.workspaceId, other.workspaceId] },
        ];
        const view = computePairwise(a, b, contested);
        expect(view.shared).toEqual(["src/pair.ts"]);
        expect(view.sharedReason).toContain("per-agent changed-file lists unavailable");
    });

    it("tolerates a null contested set in the fallback path", () => {
        const a = makeSibling({});
        const b = makeSibling({});
        const view = computePairwise(a, b, null as unknown as ContestedFile[]);
        expect(view.shared).toEqual([]);
        expect(view.sharedReason).toBeDefined();
    });
});

describe("computeSiblingOverlap", () => {
    it("returns null (overlap unknown) when this sibling's own changedFiles is absent", () => {
        const s = makeSibling({});
        expect(computeSiblingOverlap(s, [s], [])).toBeNull();
    });

    it("counts contested files this sibling touches and names the OTHER agents per file", () => {
        const me = makeSibling({ agent: "claude_code", changedFiles: ["a.ts", "b.ts"] });
        const codex = makeSibling({ agent: "codex", changedFiles: ["a.ts"] });
        const contested: ContestedFile[] = [
            { path: "a.ts", workspaceIds: [me.workspaceId, codex.workspaceId] },
            { path: "elsewhere.ts", workspaceIds: [codex.workspaceId, "ws-unknown"] },
        ];
        const overlap = computeSiblingOverlap(me, [me, codex], contested);
        expect(overlap).toEqual({
            count: 1,
            files: ["a.ts"],
            agentsByFile: { "a.ts": ["codex"] },
        });
    });

    it("an unknown sibling id in a contested entry falls back to the raw id", () => {
        const me = makeSibling({ changedFiles: ["a.ts"] });
        const contested: ContestedFile[] = [{ path: "a.ts", workspaceIds: [me.workspaceId, "ws-gone"] }];
        const overlap = computeSiblingOverlap(me, [me], contested);
        expect(overlap.agentsByFile["a.ts"]).toEqual(["ws-gone"]);
    });

    it("no contested entries yields a truthful zero (its list WAS readable)", () => {
        const me = makeSibling({ changedFiles: ["a.ts"] });
        expect(computeSiblingOverlap(me, [me], [])).toEqual({ count: 0, files: [], agentsByFile: {} });
        expect(computeSiblingOverlap(me, [me], null as unknown as ContestedFile[])).toEqual({
            count: 0,
            files: [],
            agentsByFile: {},
        });
    });
});

function readinessWith(
    id: string,
    opts: { conflicts?: string[]; passing?: number; unavailable?: boolean }
): Record<string, RecoderWorkspaceReadiness> {
    const entry: RecoderWorkspaceReadiness = {};
    if (opts.conflicts != null || opts.unavailable) {
        entry.mergeability = {
            available: !opts.unavailable,
            verdict: opts.unavailable ? "unknown" : (opts.conflicts ?? []).length > 0 ? "conflicting" : "clean",
            conflicts: opts.conflicts ?? [],
            ahead: 0,
            behind: 0,
            base: "main",
            branch: "b",
        };
    }
    if (opts.passing != null) {
        const signals = [];
        for (let i = 0; i < 4; i++) {
            signals.push({ id: "checks" as const, status: i < opts.passing ? ("pass" as const) : ("unknown" as const), detail: "" });
        }
        entry.readiness = { verdict: "unknown", signals, blockers: [] };
    }
    return { [id]: entry };
}

describe("computeSuggestedWinner", () => {
    it("returns null for null/empty sibling lists", () => {
        expect(computeSuggestedWinner(null as unknown as SiblingCompareEntry[], {})).toBeNull();
        expect(computeSuggestedWinner([], {})).toBeNull();
    });

    it("returns null when NO sibling has any scoreable data (never fabricates a preference)", () => {
        const a = makeSibling({});
        const b = makeSibling({});
        expect(computeSuggestedWinner([a, b], {})).toBeNull();
    });

    it("returns null for a single sibling (no runner-up to beat)", () => {
        const a = makeSibling({ diffStat: { additions: 1, deletions: 0, files: 1 } });
        expect(computeSuggestedWinner([a], {})).toBeNull();
    });

    it("fewest conflicts decides first", () => {
        const clean = makeSibling({});
        const dirty = makeSibling({});
        const readiness = {
            ...readinessWith(clean.workspaceId, { conflicts: [] }),
            ...readinessWith(dirty.workspaceId, { conflicts: ["x.ts"] }),
        };
        expect(computeSuggestedWinner([dirty, clean], readiness)).toEqual({
            workspaceId: clean.workspaceId,
            reason: "fewest conflicts",
        });
    });

    it("most checks passing decides when conflicts tie", () => {
        const better = makeSibling({});
        const worse = makeSibling({});
        const readiness = {
            ...readinessWith(better.workspaceId, { conflicts: [], passing: 3 }),
            ...readinessWith(worse.workspaceId, { conflicts: [], passing: 1 }),
        };
        expect(computeSuggestedWinner([worse, better], readiness)).toEqual({
            workspaceId: better.workspaceId,
            reason: "most checks passing",
        });
    });

    it("smallest diff decides last", () => {
        const small = makeSibling({ diffStat: { additions: 1, deletions: 1, files: 1 } });
        const big = makeSibling({ diffStat: { additions: 100, deletions: 50, files: 9 } });
        expect(computeSuggestedWinner([big, small], {})).toEqual({
            workspaceId: small.workspaceId,
            reason: "smallest diff",
        });
    });

    it("a sibling with data always outranks one with none (missing data ranks worst)", () => {
        const measured = makeSibling({ diffStat: { additions: 5000, deletions: 5000, files: 100 } });
        const unmeasured = makeSibling({});
        expect(computeSuggestedWinner([unmeasured, measured], {})).toEqual({
            workspaceId: measured.workspaceId,
            reason: "smallest diff",
        });
    });

    it("a genuine tie on every criterion yields null (no fabricated badge)", () => {
        const a = makeSibling({ diffStat: { additions: 2, deletions: 2, files: 1 } });
        const b = makeSibling({ diffStat: { additions: 3, deletions: 1, files: 1 } });
        expect(computeSuggestedWinner([a, b], {})).toBeNull();
    });

    it("mergeability with available:false contributes NO conflict data", () => {
        const unavailable = makeSibling({});
        const real = makeSibling({ diffStat: { additions: 1, deletions: 0, files: 1 } });
        const readiness = readinessWith(unavailable.workspaceId, { unavailable: true, conflicts: [] });
        expect(computeSuggestedWinner([unavailable, real], readiness)).toEqual({
            workspaceId: real.workspaceId,
            reason: "smallest diff",
        });
    });

    it("tolerates a null readiness map", () => {
        const a = makeSibling({ diffStat: { additions: 1, deletions: 0, files: 1 } });
        const b = makeSibling({ diffStat: { additions: 9, deletions: 9, files: 2 } });
        expect(
            computeSuggestedWinner([b, a], null as unknown as Record<string, RecoderWorkspaceReadiness>)
        ).toEqual({ workspaceId: a.workspaceId, reason: "smallest diff" });
    });
});

describe("workspaceStateMap", () => {
    it("maps workspaceId to state", () => {
        const a = makeWs({ state: "running" });
        const b = makeWs({ state: "awaiting_review" });
        const map = workspaceStateMap([a, b]);
        expect(map.get(a.workspaceId)).toBe("running");
        expect(map.get(b.workspaceId)).toBe("awaiting_review");
        expect(map.size).toBe(2);
    });

    it("an empty list yields an empty map", () => {
        expect(workspaceStateMap([]).size).toBe(0);
    });
});

describe("detectAttentionTransitions", () => {
    const none = new Set<string>();

    it("fires review on an observed running → awaiting_review", () => {
        const ws = makeWs({ state: "awaiting_review", branch: "agent/fix" });
        const prev = new Map([[ws.workspaceId, "running"]]);
        expect(detectAttentionTransitions(prev, [ws], none)).toEqual([
            {
                workspaceId: ws.workspaceId,
                branch: "agent/fix",
                runtimeId: "claude_code",
                kind: "review",
                key: `${ws.workspaceId}:awaiting_review`,
            },
        ]);
    });

    it("fires failed from ANY prior live state", () => {
        for (const from of ["created", "running", "setting_up", "ready", "awaiting_review"]) {
            const ws = makeWs({ state: "failed" });
            const prev = new Map([[ws.workspaceId, from]]);
            const events = detectAttentionTransitions(prev, [ws], none);
            expect(events).toHaveLength(1);
            expect(events[0].kind).toBe("failed");
        }
    });

    it("a workspace absent from prev (first poll / launched mid-poll) seeds silently", () => {
        const waiting = makeWs({ state: "awaiting_review" });
        const dead = makeWs({ state: "failed" });
        expect(detectAttentionTransitions(new Map(), [waiting, dead], none)).toEqual([]);
    });

    it("an unchanged state fires nothing", () => {
        const ws = makeWs({ state: "awaiting_review" });
        const prev = new Map([[ws.workspaceId, "awaiting_review"]]);
        expect(detectAttentionTransitions(prev, [ws], none)).toEqual([]);
    });

    it("only running → awaiting_review counts as review (not setting_up → awaiting_review)", () => {
        const ws = makeWs({ state: "awaiting_review" });
        const prev = new Map([[ws.workspaceId, "setting_up"]]);
        expect(detectAttentionTransitions(prev, [ws], none)).toEqual([]);
    });

    it("non-attention transitions (running → ready, awaiting_review → archived) fire nothing", () => {
        const ready = makeWs({ state: "ready" });
        const archived = makeWs({ state: "archived" });
        const prev = new Map([
            [ready.workspaceId, "running"],
            [archived.workspaceId, "awaiting_review"],
        ]);
        expect(detectAttentionTransitions(prev, [ready, archived], none)).toEqual([]);
    });

    it("an already-notified workspaceId:state key is suppressed (de-dupe on bounce)", () => {
        const ws = makeWs({ state: "awaiting_review" });
        const prev = new Map([[ws.workspaceId, "running"]]);
        const notified = new Set([`${ws.workspaceId}:awaiting_review`]);
        expect(detectAttentionTransitions(prev, [ws], notified)).toEqual([]);
    });

    it("failed staying failed across polls fires nothing (state map dedupe)", () => {
        const ws = makeWs({ state: "failed" });
        const prev = new Map([[ws.workspaceId, "failed"]]);
        expect(detectAttentionTransitions(prev, [ws], none)).toEqual([]);
    });

    it("missing branch/runtimeId degrade to empty strings, never a crash", () => {
        const ws = makeWs({ state: "failed" });
        const bare = { ...ws, branch: undefined, runtimeId: undefined } as unknown as RecoderWorkspace;
        const prev = new Map([[ws.workspaceId, "running"]]);
        const events = detectAttentionTransitions(prev, [bare], none);
        expect(events).toHaveLength(1);
        expect(events[0].branch).toBe("");
        expect(events[0].runtimeId).toBe("");
    });

    it("reports each transitioning workspace independently in one poll", () => {
        const review = makeWs({ state: "awaiting_review" });
        const dead = makeWs({ state: "failed" });
        const quiet = makeWs({ state: "running" });
        const prev = new Map([
            [review.workspaceId, "running"],
            [dead.workspaceId, "running"],
            [quiet.workspaceId, "running"],
        ]);
        const events = detectAttentionTransitions(prev, [review, dead, quiet], none);
        expect(events.map((e) => e.kind).sort()).toEqual(["failed", "review"]);
    });
});

describe("attention badge + classification helpers", () => {
    it("isNeedsInputAttention is true only for agent_idle_prompt and awaiting_approval", () => {
        expect(isNeedsInputAttention("agent_idle_prompt")).toBe(true);
        expect(isNeedsInputAttention("awaiting_approval")).toBe(true);
        for (const other of ["review_ready", "working", "error", "unknown", "", undefined]) {
            expect(isNeedsInputAttention(other as string)).toBe(false);
        }
    });

    it("attentionBadgeLabel names only the two needs-human signals, else empty", () => {
        expect(attentionBadgeLabel("agent_idle_prompt")).toBe("Needs input");
        expect(attentionBadgeLabel("awaiting_approval")).toBe("Needs approval");
        for (const other of ["review_ready", "working", "error", "unknown", "", undefined]) {
            expect(attentionBadgeLabel(other as string)).toBe("");
        }
    });

    it("workspaceAttentionMap records every workspace (absent attention → empty string)", () => {
        const a = makeWs({ attention: "agent_idle_prompt" });
        const b = makeWs({ attention: undefined });
        const map = workspaceAttentionMap([a, b]);
        expect(map.get(a.workspaceId)).toBe("agent_idle_prompt");
        expect(map.get(b.workspaceId)).toBe("");
        expect(map.size).toBe(2);
    });
});

describe("detectNeedsInputTransitions", () => {
    const none = new Set<string>();

    it("fires needs_input on working → agent_idle_prompt", () => {
        const ws = makeWs({ attention: "agent_idle_prompt", branch: "agent/ask" });
        const prev = new Map([[ws.workspaceId, "working"]]);
        expect(detectNeedsInputTransitions(prev, [ws], none)).toEqual([
            {
                workspaceId: ws.workspaceId,
                branch: "agent/ask",
                runtimeId: "claude_code",
                kind: "needs_input",
                key: `${ws.workspaceId}:attn:agent_idle_prompt`,
            },
        ]);
    });

    it("fires awaiting_approval on working → awaiting_approval", () => {
        const ws = makeWs({ attention: "awaiting_approval" });
        const prev = new Map([[ws.workspaceId, "working"]]);
        const events = detectNeedsInputTransitions(prev, [ws], none);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("awaiting_approval");
    });

    it("fires from a previously-empty (no-signal) attention into needs-input", () => {
        const ws = makeWs({ attention: "agent_idle_prompt" });
        const prev = new Map([[ws.workspaceId, ""]]);
        expect(detectNeedsInputTransitions(prev, [ws], none)).toHaveLength(1);
    });

    it("a workspace absent from prev (first successful views read) seeds silently", () => {
        const ws = makeWs({ attention: "agent_idle_prompt" });
        expect(detectNeedsInputTransitions(new Map(), [ws], none)).toEqual([]);
    });

    it("does not re-fire when it was already needing input last poll", () => {
        const ws = makeWs({ attention: "awaiting_approval" });
        const prev = new Map([[ws.workspaceId, "agent_idle_prompt"]]);
        expect(detectNeedsInputTransitions(prev, [ws], none)).toEqual([]);
    });

    it("an unchanged needs-input attention fires nothing", () => {
        const ws = makeWs({ attention: "agent_idle_prompt" });
        const prev = new Map([[ws.workspaceId, "agent_idle_prompt"]]);
        expect(detectNeedsInputTransitions(prev, [ws], none)).toEqual([]);
    });

    it("a transition into a non-needs-input attention (working / review_ready) fires nothing", () => {
        const working = makeWs({ attention: "working" });
        const review = makeWs({ attention: "review_ready" });
        const prev = new Map([
            [working.workspaceId, ""],
            [review.workspaceId, "working"],
        ]);
        expect(detectNeedsInputTransitions(prev, [working, review], none)).toEqual([]);
    });

    it("an already-notified key is suppressed (de-dupe on bounce)", () => {
        const ws = makeWs({ attention: "agent_idle_prompt" });
        const prev = new Map([[ws.workspaceId, "working"]]);
        const notified = new Set([`${ws.workspaceId}:attn:agent_idle_prompt`]);
        expect(detectNeedsInputTransitions(prev, [ws], notified)).toEqual([]);
    });

    it("reports each transitioning workspace independently in one poll", () => {
        const ask = makeWs({ attention: "agent_idle_prompt" });
        const approve = makeWs({ attention: "awaiting_approval" });
        const quiet = makeWs({ attention: "working" });
        const prev = new Map([
            [ask.workspaceId, "working"],
            [approve.workspaceId, "working"],
            [quiet.workspaceId, "working"],
        ]);
        const events = detectNeedsInputTransitions(prev, [ask, approve, quiet], none);
        expect(events.map((e) => e.kind).sort()).toEqual(["awaiting_approval", "needs_input"]);
    });
});

describe("suggestNextAction", () => {
    const withChanges = { additions: 12, deletions: 3, files: 2 };
    const noChanges = { additions: 0, deletions: 0, files: 0 };

    it("suggests reviewing an awaiting_review workspace that has changes", () => {
        expect(suggestNextAction("awaiting_review", withChanges, true)).toEqual({
            action: "review",
            label: "Ready — review the changes",
        });
    });

    it("suggests archiving an awaiting_review workspace with nothing to merge", () => {
        expect(suggestNextAction("awaiting_review", noChanges, true)?.action).toBe("archive");
        expect(suggestNextAction("awaiting_review", undefined, true)?.action).toBe("archive");
    });

    it("suggests archiving a merged workspace to clear the board", () => {
        expect(suggestNextAction("merged", withChanges, false)?.action).toBe("archive");
    });

    it("never points a failed row at its hidden Session button", () => {
        // failed is terminal, so Session is not rendered — suggestion must be
        // review (if it left changes) or archive, never session.
        expect(suggestNextAction("failed", withChanges, true)?.action).toBe("review");
        expect(suggestNextAction("failed", noChanges, true)?.action).toBe("archive");
    });

    it("suggests watching a running workspace only when it has a live session", () => {
        expect(suggestNextAction("running", withChanges, true)?.action).toBe("session");
        expect(suggestNextAction("running", withChanges, false)).toBe(null);
    });

    it("suggests nothing for archived or unknown states (degrade-safe)", () => {
        expect(suggestNextAction("archived", withChanges, true)).toBe(null);
        expect(suggestNextAction("some_future_state", withChanges, true)).toBe(null);
    });
});

describe("deriveProjectIdentity", () => {
    it("derives a name (basename) and a stable slug id from a repo path", () => {
        expect(deriveProjectIdentity("/Users/x/recoder.xyz")).toEqual({
            projectId: "recoder.xyz",
            projectName: "recoder.xyz",
        });
        expect(deriveProjectIdentity("/home/dev/My App")).toEqual({
            projectId: "my-app",
            projectName: "My App",
        });
    });

    it("ignores trailing slashes and handles Windows separators", () => {
        expect(deriveProjectIdentity("/a/b/proj/").projectId).toBe("proj");
        expect(deriveProjectIdentity("C:\\code\\Widget").projectName).toBe("Widget");
        expect(deriveProjectIdentity("C:\\code\\Widget").projectId).toBe("widget");
    });

    it("degrades an empty or slug-less path to DEFAULT_PROJECT_ID (never blank)", () => {
        expect(deriveProjectIdentity("")).toEqual({ projectId: DEFAULT_PROJECT_ID, projectName: DEFAULT_PROJECT_ID });
        expect(deriveProjectIdentity("   ")).toEqual({ projectId: DEFAULT_PROJECT_ID, projectName: DEFAULT_PROJECT_ID });
        expect(deriveProjectIdentity("/a/b/@@@").projectId).toBe(DEFAULT_PROJECT_ID);
    });
});

describe("deriveProjects / filterByProject", () => {
    it("rolls up distinct projects with counts, sorted by id", () => {
        const ws = [
            makeWs({ projectId: "beta" }),
            makeWs({ projectId: "alpha" }),
            makeWs({ projectId: "beta" }),
            makeWs({ projectId: undefined }),
        ];
        expect(deriveProjects(ws)).toEqual([
            { projectId: "alpha", count: 1 },
            { projectId: "beta", count: 2 },
            { projectId: DEFAULT_PROJECT_ID, count: 1 },
        ]);
    });

    it("filters to one project; empty id means all projects", () => {
        const a = makeWs({ projectId: "alpha" });
        const b = makeWs({ projectId: "beta" });
        const legacy = makeWs({ projectId: undefined });
        expect(filterByProject([a, b, legacy], "alpha")).toEqual([a]);
        expect(filterByProject([a, b, legacy], DEFAULT_PROJECT_ID)).toEqual([legacy]);
        expect(filterByProject([a, b, legacy], "")).toHaveLength(3);
    });
});

describe("workspaceSearchKeywords", () => {
    it("folds branch, project, agent label, state, and task title/prompt", () => {
        const kw = workspaceSearchKeywords(
            makeWs({
                branch: "feat/login",
                projectId: "recoder.xyz",
                runtimeId: "claude_code",
                state: "awaiting_review",
                metadata: { title: "Fix the auth flow", prompt: "harden sessions" },
            })
        );
        expect(kw).toContain("feat/login");
        expect(kw).toContain("recoder.xyz");
        expect(kw).toContain("Claude Code"); // agentLabel of claude_code
        expect(kw).toContain("awaiting_review");
        expect(kw).toContain("Fix the auth flow");
        expect(kw).toContain("harden sessions");
    });

    it("degrades non-string metadata and missing fields to a clean string (no 'undefined')", () => {
        const kw = workspaceSearchKeywords(makeWs({ projectId: undefined, metadata: { title: 42 } }));
        expect(kw).not.toContain("undefined");
        expect(kw).toContain(DEFAULT_PROJECT_ID); // legacy project falls to default
    });
});

describe("parseGhqLayout + deriveProjectIdentity (ghq host/owner/repo)", () => {
    it("detects the ghq host/owner/repo triple in a path", () => {
        expect(parseGhqLayout("/root/recoder/repos/github.com/caelum0x/recoder.xyz".split("/"))).toEqual({
            host: "github.com",
            owner: "caelum0x",
            repo: "recoder.xyz",
        });
        expect(parseGhqLayout("home/dev/gitlab.com/acme/widget".split("/"))).toEqual({
            host: "gitlab.com",
            owner: "acme",
            repo: "widget",
        });
    });

    it("returns null when there is no host-shaped segment with an owner+repo after it", () => {
        expect(parseGhqLayout("/Users/x/recoder.xyz".split("/"))).toBeNull(); // host-like, but it's the LAST segment
        expect(parseGhqLayout("/home/dev/project".split("/"))).toBeNull();
    });

    it("derives owner/repo identity for a ghq-layout repo (disambiguated id)", () => {
        expect(deriveProjectIdentity("~/recoder/repos/github.com/caelum0x/recoder.xyz")).toEqual({
            projectId: "caelum0x-recoder.xyz",
            projectName: "caelum0x/recoder.xyz",
            host: "github.com",
            owner: "caelum0x",
            repo: "recoder.xyz",
        });
    });

    it("keeps same-named repos under different owners distinct", () => {
        const a = deriveProjectIdentity("/r/github.com/alice/app");
        const b = deriveProjectIdentity("/r/github.com/bob/app");
        expect(a.projectId).not.toBe(b.projectId);
        expect(a.projectId).toBe("alice-app");
        expect(b.projectId).toBe("bob-app");
    });

    it("still uses the basename for a plain (non-ghq) path — no host/owner/repo", () => {
        const id = deriveProjectIdentity("/Users/x/recoder.xyz");
        expect(id).toEqual({ projectId: "recoder.xyz", projectName: "recoder.xyz" });
        expect(id.owner).toBeUndefined();
    });
});
