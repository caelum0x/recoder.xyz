// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { commandMatches, fuzzyMatch, type RecoderCommand } from "./recoder-command-palette";
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
            "Open Approvals",
            "Open Memory",
            "Open Board",
            "Open Settings",
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
            "recoder-approvals",
            "recoder-memory",
            "recoder-board",
            "recoder-settings",
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
