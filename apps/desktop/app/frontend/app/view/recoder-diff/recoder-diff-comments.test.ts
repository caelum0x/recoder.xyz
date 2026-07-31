// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { computeDiffLineAnchors, parseHunkStarts, stripDiffPathPrefix } from "./recoder-diff-comments";

describe("stripDiffPathPrefix", () => {
    it("strips a/ and b/ prefixes and maps /dev/null to empty", () => {
        expect(stripDiffPathPrefix("b/src/a.ts")).toBe("src/a.ts");
        expect(stripDiffPathPrefix("a/src/a.ts")).toBe("src/a.ts");
        expect(stripDiffPathPrefix(" b/src/a.ts ")).toBe("src/a.ts");
        expect(stripDiffPathPrefix("/dev/null")).toBe("");
        expect(stripDiffPathPrefix("plain/path.ts")).toBe("plain/path.ts");
    });
});

describe("parseHunkStarts", () => {
    it("reads the old + new start lines from a hunk header", () => {
        expect(parseHunkStarts("@@ -1,4 +1,6 @@")).toEqual({ oldStart: 1, newStart: 1 });
        expect(parseHunkStarts("@@ -10,3 +11,3 @@ func foo()")).toEqual({ oldStart: 10, newStart: 11 });
        expect(parseHunkStarts("@@ -0,0 +1 @@")).toEqual({ oldStart: 0, newStart: 1 });
    });
    it("returns null for a malformed header (no wrong guess)", () => {
        expect(parseHunkStarts("@@ garbage @@")).toBe(null);
        expect(parseHunkStarts("not a hunk")).toBe(null);
    });
});

describe("computeDiffLineAnchors", () => {
    const patch = [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 111..222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,3 +1,4 @@",
        " context one",
        "-removed line",
        "+added line",
        " context two",
    ].join("\n");

    const lines = patch.split("\n");
    const anchors = computeDiffLineAnchors(patch);
    const at = (text: string) => anchors[lines.indexOf(text)];

    it("returns one anchor per rendered line, indexed identically to patch.split", () => {
        expect(anchors).toHaveLength(lines.length);
    });

    it("anchors added and context lines to the NEW file line (side new)", () => {
        expect(at(" context one")).toEqual({ file: "src/a.ts", line: 1, side: "new" });
        expect(at("+added line")).toEqual({ file: "src/a.ts", line: 2, side: "new" });
        expect(at(" context two")).toEqual({ file: "src/a.ts", line: 3, side: "new" });
    });

    it("anchors a DELETION to the OLD file line (side old)", () => {
        // old-file lines: 1='context one', 2='removed line', 3='context two'
        expect(at("-removed line")).toEqual({ file: "src/a.ts", line: 2, side: "old" });
    });

    it("never anchors hunk headers or file/meta headers", () => {
        expect(at("@@ -1,3 +1,4 @@")).toEqual({ file: "src/a.ts", line: null, side: null });
        expect(at("+++ b/src/a.ts")).toEqual({ file: "src/a.ts", line: null, side: null });
        expect(at("diff --git a/src/a.ts b/src/a.ts")).toEqual({ file: "", line: null, side: null });
    });

    it("keeps old/new counters independent across adds, dels, and context", () => {
        const multi = [
            "+++ b/x.ts",
            "@@ -5,4 +5,3 @@",
            " keep",   // old 5, new 5
            "-gone1",  // old 6
            "-gone2",  // old 7
            "+new1",   // new 6
            " tail",   // old 8, new 7
        ].join("\n");
        const ls = multi.split("\n");
        const a = computeDiffLineAnchors(multi);
        expect(a[ls.indexOf(" keep")]).toEqual({ file: "x.ts", line: 5, side: "new" });
        expect(a[ls.indexOf("-gone1")]).toEqual({ file: "x.ts", line: 6, side: "old" });
        expect(a[ls.indexOf("-gone2")]).toEqual({ file: "x.ts", line: 7, side: "old" });
        expect(a[ls.indexOf("+new1")]).toEqual({ file: "x.ts", line: 6, side: "new" });
        expect(a[ls.indexOf(" tail")]).toEqual({ file: "x.ts", line: 7, side: "new" });
    });

    it("tracks the current file across multiple file sections", () => {
        const two = [
            "+++ b/one.ts",
            "@@ -1 +1,2 @@",
            "+first",
            "+++ b/two.ts",
            "@@ -5,0 +6,1 @@",
            "+second",
        ].join("\n");
        const ls = two.split("\n");
        const a = computeDiffLineAnchors(two);
        expect(a[ls.indexOf("+first")]).toEqual({ file: "one.ts", line: 1, side: "new" });
        expect(a[ls.indexOf("+second")]).toEqual({ file: "two.ts", line: 6, side: "new" });
    });
});
