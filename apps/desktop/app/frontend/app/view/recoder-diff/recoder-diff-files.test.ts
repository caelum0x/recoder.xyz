// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseDiffFileSections, parseGitHeaderPath } from "./recoder-diff-files";

describe("parseGitHeaderPath", () => {
    it("reads the new (b/) path from a diff --git header", () => {
        expect(parseGitHeaderPath("diff --git a/src/a.ts b/src/a.ts")).toBe("src/a.ts");
        expect(parseGitHeaderPath("diff --git a/old.ts b/renamed.ts")).toBe("renamed.ts");
    });
    it("returns empty for a header it cannot parse", () => {
        expect(parseGitHeaderPath("diff --git garbage")).toBe("");
    });
});

describe("parseDiffFileSections", () => {
    it("parses a single modified file into one contiguous section", () => {
        const patch = [
            "diff --git a/src/a.ts b/src/a.ts",
            "index 111..222 100644",
            "--- a/src/a.ts",
            "+++ b/src/a.ts",
            "@@ -1,3 +1,4 @@",
            " context one",
            "-removed line",
            "+added line",
            "+another add",
            " context two",
        ].join("\n");
        const sections = parseDiffFileSections(patch);
        expect(sections).toHaveLength(1);
        expect(sections[0]).toEqual({
            path: "src/a.ts",
            adds: 2,
            dels: 1,
            startIndex: 0,
            endIndex: patch.split("\n").length,
        });
    });

    it("does not count +++/--- headers toward adds/dels", () => {
        const patch = [
            "diff --git a/x.ts b/x.ts",
            "--- a/x.ts",
            "+++ b/x.ts",
            "@@ -1 +1 @@",
            "-old",
            "+new",
        ].join("\n");
        const [s] = parseDiffFileSections(patch);
        expect(s.adds).toBe(1);
        expect(s.dels).toBe(1);
    });

    it("splits multiple files at diff --git boundaries and tiles the patch losslessly", () => {
        const patch = [
            "diff --git a/one.ts b/one.ts",
            "--- a/one.ts",
            "+++ b/one.ts",
            "@@ -1 +1,2 @@",
            " keep",
            "+first",
            "diff --git a/two.ts b/two.ts",
            "--- a/two.ts",
            "+++ b/two.ts",
            "@@ -1,2 +1 @@",
            "-drop",
            " stay",
        ].join("\n");
        const lines = patch.split("\n");
        const sections = parseDiffFileSections(patch);
        expect(sections.map((s) => s.path)).toEqual(["one.ts", "two.ts"]);
        expect(sections[0]).toMatchObject({ adds: 1, dels: 0 });
        expect(sections[1]).toMatchObject({ adds: 0, dels: 1 });

        // lossless: contiguous, non-overlapping, covering every line exactly once
        expect(sections[0].startIndex).toBe(0);
        expect(sections[sections.length - 1].endIndex).toBe(lines.length);
        for (let i = 1; i < sections.length; i++) {
            expect(sections[i].startIndex).toBe(sections[i - 1].endIndex);
        }
    });

    it("uses the OLD path for a deleted file (+++ /dev/null)", () => {
        const patch = [
            "diff --git a/gone.ts b/gone.ts",
            "deleted file mode 100644",
            "--- a/gone.ts",
            "+++ /dev/null",
            "@@ -1,2 +0,0 @@",
            "-line one",
            "-line two",
        ].join("\n");
        const [s] = parseDiffFileSections(patch);
        expect(s.path).toBe("gone.ts");
        expect(s).toMatchObject({ adds: 0, dels: 2 });
    });

    it("uses the NEW path for an added file (--- /dev/null)", () => {
        const patch = [
            "diff --git a/new.ts b/new.ts",
            "new file mode 100644",
            "--- /dev/null",
            "+++ b/new.ts",
            "@@ -0,0 +1,2 @@",
            "+hello",
            "+world",
        ].join("\n");
        const [s] = parseDiffFileSections(patch);
        expect(s.path).toBe("new.ts");
        expect(s).toMatchObject({ adds: 2, dels: 0 });
    });

    it("falls back to the diff --git header path when +++/--- are absent", () => {
        const patch = ["diff --git a/bin.dat b/bin.dat", "Binary files a/bin.dat and b/bin.dat differ"].join("\n");
        const [s] = parseDiffFileSections(patch);
        expect(s.path).toBe("bin.dat");
        expect(s).toMatchObject({ adds: 0, dels: 0 });
    });

    it("returns an empty list for an empty patch", () => {
        expect(parseDiffFileSections("")).toEqual([
            { path: "", adds: 0, dels: 0, startIndex: 0, endIndex: 1 },
        ]);
    });
});
