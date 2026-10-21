// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandMatches, createSessionSearcher, fuzzyMatch, type RecoderCommand } from "./recoder-command-palette";
import { navigationCommands, RecoderNavTargets } from "./recoder-nav-commands";

describe("fuzzyMatch", () => {
    it("matches a case-insensitive subsequence and everything on empty query", () => {
        expect(fuzzyMatch("", "anything")).toBe(true);
        expect(fuzzyMatch("orv", "Open Review")).toBe(true);
        expect(fuzzyMatch("MERGE", "Merge — claude · feat/x")).toBe(true);
    });
    it("rejects a non-subsequence", () => {
        expect(fuzzyMatch("zzz", "Open session")).toBe(false);
        expect(fuzzyMatch("review", "Open session")).toBe(false);
    });
});

describe("commandMatches", () => {
    const cmd = (over: Partial<RecoderCommand> = {}): RecoderCommand => ({
        id: "session-ws1",
        title: "Open session — claude · feat/login",
        run: () => {},
        ...over,
    });

    it("matches on the visible title", () => {
        expect(commandMatches("session", cmd())).toBe(true);
    });

    it("matches on hidden keywords (workspace search: project / prompt / state)", () => {
        const c = cmd({ keywords: "feat/login recoder.xyz claude code awaiting_review fix the auth flow" });
        expect(commandMatches("recoder.xyz", c)).toBe(true);
        expect(commandMatches("auth flow", c)).toBe(true);
        expect(commandMatches("awaiting", c)).toBe(true);
    });

    it("does not match text absent from both title and keywords", () => {
        expect(commandMatches("billing", cmd({ keywords: "feat/login recoder.xyz" }))).toBe(false);
    });

    it("does not span the title→keywords boundary", () => {
        // 'x'(title end) + 'y'(keywords start) must NOT form a match across the gap.
        expect(commandMatches("xy", cmd({ title: "aaax", keywords: "yaaa" }))).toBe(false);
    });
});

describe("navigationCommands", () => {
    it("emits one 'Open …' command per Recoder surface", () => {
        const cmds = navigationCommands(() => {});
        expect(cmds.map((c) => c.title)).toEqual([
            "Open Runs",
            "Open Memory",
            "Ask the Repo",
            "Teach the Repo",
            "Agent Collaboration",
            "Converge Fan-out",
            "Run Playbook",
            "Swarm Unblock",
            "Needs You",
            "Agent Tools",
            "Work Locks",
            "Audit Trail",
            "Workflows",
            "Agents",
            "Coworker",
            "Inference Usage",
            "Open Settings",
            "Open Session",
        ]);
    });

    it("routes each command to its view meta via openView", () => {
        const opened: string[] = [];
        for (const c of navigationCommands((view) => opened.push(view))) {
            c.run();
        }
        expect(opened).toEqual(RecoderNavTargets.map((t) => t.view));
        expect(opened).toEqual([
            "recoder-runs",
            "recoder-memory",
            "recoder-codebase",
            "recoder-ingest",
            "recoder-siblings",
            "recoder-fanout",
            "recoder-playbooks",
            "recoder-swarm",
            "recoder-needs-you",
            "recoder-capabilities",
            "recoder-locks",
            "recoder-audit",
            "recoder-workflows",
            "recoder-agents",
            "recoder-coworker",
            "recoder-usage",
            "recoder-settings",
            "recoder-session",
        ]);
    });

    it("uses stable unique ids so the palette can key rows", () => {
        const ids = navigationCommands(() => {}).map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("stays discoverable through the palette matcher", () => {
        const [runs] = navigationCommands(() => {});
        expect(commandMatches("runs", runs)).toBe(true);
        expect(commandMatches("open", runs)).toBe(true);
        expect(commandMatches("billing", runs)).toBe(false);
    });
});

// The palette drives this searcher from its query input; testing it directly
// pins the no-prop regression (absent provider = immediate empty, provider
// never invoked), the debounce, and the discard-stale-response rule.
describe("createSessionSearcher", () => {
    const results = () => {
        const seen: RecoderCommand[][] = [];
        return { seen, on: (r: RecoderCommand[]) => seen.push(r) };
    };
    const cmd = (id: string): RecoderCommand => ({ id, title: id, run: () => {} });

    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("without a provider emits empty immediately and never searches (no-prop regression)", async () => {
        const out = results();
        const searcher = createSessionSearcher(undefined, out.on);
        searcher.search("auth");
        await vi.runAllTimersAsync();
        expect(out.seen).toEqual([[]]);
    });

    it("emits empty immediately for a blank query and cancels any pending search", async () => {
        const calls: string[] = [];
        const out = results();
        const searcher = createSessionSearcher(async (q) => (calls.push(q), []), out.on);
        searcher.search("auth");
        searcher.search("   ");
        await vi.runAllTimersAsync();
        expect(calls).toEqual([]);
        expect(out.seen).toEqual([[]]);
    });

    it("debounces: rapid typing invokes the provider once, with the final query", async () => {
        const calls: string[] = [];
        const out = results();
        const searcher = createSessionSearcher(async (q) => (calls.push(q), [cmd(`hit-${q}`)]), out.on);
        searcher.search("a");
        searcher.search("au");
        searcher.search("auth");
        await vi.runAllTimersAsync();
        expect(calls).toEqual(["auth"]);
        expect(out.seen).toEqual([[cmd("hit-auth")].map((c) => expect.objectContaining({ id: c.id }))]);
    });

    it("discards a stale response whose query no longer matches the input", async () => {
        const resolvers = new Map<string, (r: RecoderCommand[]) => void>();
        const out = results();
        const searcher = createSessionSearcher(
            (q) => new Promise<RecoderCommand[]>((resolve) => resolvers.set(q, resolve)),
            out.on
        );
        searcher.search("a");
        await vi.advanceTimersByTimeAsync(250);
        searcher.search("ab");
        await vi.advanceTimersByTimeAsync(250);
        // The older in-flight response lands AFTER the newer query — must be dropped.
        resolvers.get("a")!([cmd("stale")]);
        await Promise.resolve();
        expect(out.seen).toEqual([]);
        resolvers.get("ab")!([cmd("fresh")]);
        await Promise.resolve();
        expect(out.seen).toHaveLength(1);
        expect(out.seen[0].map((c) => c.id)).toEqual(["fresh"]);
    });

    it("swallows a rejecting provider into an empty result", async () => {
        const out = results();
        const searcher = createSessionSearcher(async () => {
            throw new Error("boom");
        }, out.on);
        searcher.search("auth");
        await vi.runAllTimersAsync();
        expect(out.seen).toEqual([[]]);
    });

    it("dispose cancels the pending search and discards in-flight responses", async () => {
        let resolve!: (r: RecoderCommand[]) => void;
        const out = results();
        const searcher = createSessionSearcher(
            () => new Promise<RecoderCommand[]>((r) => (resolve = r)),
            out.on
        );
        searcher.search("auth");
        await vi.advanceTimersByTimeAsync(250);
        searcher.dispose();
        resolve([cmd("late")]);
        await Promise.resolve();
        expect(out.seen).toEqual([]);
    });
});
