// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    detectActiveMention,
    filterMentionEntries,
    insertMention,
    shouldSkipMentionDir,
    type MentionFileEntry,
} from "./aimention";

describe("detectActiveMention", () => {
    it("triggers on a bare @ at the start of the text", () => {
        expect(detectActiveMention("@", 1)).toEqual({ triggerStart: 0, query: "" });
    });

    it("triggers after whitespace and captures the typed query", () => {
        expect(detectActiveMention("fix @foo.ts", 11)).toEqual({ triggerStart: 4, query: "foo.ts" });
    });

    it("tracks the cursor mid-query, not just the end of the string", () => {
        expect(detectActiveMention("@foobar rest", 4)).toEqual({ triggerStart: 0, query: "foo" });
    });

    it("does not trigger when @ is glued to a preceding word", () => {
        expect(detectActiveMention("email@foo", 9)).toBeNull();
    });

    it("cancels once whitespace ends the token", () => {
        expect(detectActiveMention("@foo bar", 8)).toBeNull();
    });

    it("cancels on a second @ before the cursor", () => {
        expect(detectActiveMention("@foo @bar", 9)).toEqual({ triggerStart: 5, query: "bar" });
    });

    it("returns null with no @ before the cursor", () => {
        expect(detectActiveMention("plain text", 5)).toBeNull();
    });

    it("returns null for an empty/zero cursor", () => {
        expect(detectActiveMention("@foo", 0)).toBeNull();
    });
});

describe("insertMention", () => {
    it("replaces the @query token with the chosen path, without doubling the existing space after it", () => {
        const result = insertMention("fix @foo.ts please", 4, 11, "src/foo.ts");
        expect(result.text).toBe("fix @src/foo.ts please");
        expect(result.cursorPos).toBe(4 + "@src/foo.ts".length);
    });

    it("adds a trailing space when the mention is the entire input", () => {
        const result = insertMention("@fo", 0, 3, "a/b/foo.ts");
        expect(result).toEqual({ text: "@a/b/foo.ts ", cursorPos: "@a/b/foo.ts ".length });
    });

    it("adds a separating space when more text immediately follows with no space", () => {
        const result = insertMention("@fooX", 0, 4, "a/b/foo.ts");
        expect(result.text).toBe("@a/b/foo.ts X");
    });
});

describe("shouldSkipMentionDir", () => {
    it("skips hidden and common dependency/build directories", () => {
        expect(shouldSkipMentionDir(".git")).toBe(true);
        expect(shouldSkipMentionDir("node_modules")).toBe(true);
        expect(shouldSkipMentionDir("dist")).toBe(true);
        expect(shouldSkipMentionDir(".anything")).toBe(true);
    });

    it("keeps ordinary source directories", () => {
        expect(shouldSkipMentionDir("src")).toBe(false);
        expect(shouldSkipMentionDir("packages")).toBe(false);
    });

    it("treats null/empty as not-skippable", () => {
        expect(shouldSkipMentionDir("")).toBe(false);
        expect(shouldSkipMentionDir(null as unknown as string)).toBe(false);
    });
});

describe("filterMentionEntries", () => {
    function entry(relPath: string): MentionFileEntry {
        return { relPath, absPath: `/root/${relPath}`, dirPath: "/root" };
    }

    const entries = [entry("src/app/foo.ts"), entry("src/app/bar.ts"), entry("README.md"), entry("src/foo/baz.ts")];

    it("fuzzy-matches the relative path and breaks ties alphabetically", () => {
        const results = filterMentionEntries(entries, "foo");
        expect(results.map((r) => r.relPath)).toEqual(["src/app/foo.ts", "src/foo/baz.ts"]);
    });

    it("ranks a shorter matching path above a longer one", () => {
        const results = filterMentionEntries([entry("src/foo.ts"), entry("src/app/foo.ts")], "foo");
        expect(results.map((r) => r.relPath)).toEqual(["src/foo.ts", "src/app/foo.ts"]);
    });

    it("returns everything (capped by limit) on an empty query", () => {
        const results = filterMentionEntries(entries, "", 2);
        expect(results).toHaveLength(2);
    });

    it("respects the limit parameter", () => {
        const results = filterMentionEntries(entries, "src", 1);
        expect(results).toHaveLength(1);
    });

    it("returns an empty array when nothing matches", () => {
        expect(filterMentionEntries(entries, "zzzzz")).toEqual([]);
    });
});
