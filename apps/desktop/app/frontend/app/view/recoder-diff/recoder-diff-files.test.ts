// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { deriveFileJumpList, parseDiffFileSections, parseGitHeaderPath } from "./recoder-diff-files";

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
            renamed: false,
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

    it("marks a rename section (discard suppression depends on this — a single-path revert would delete the file)", () => {
        const patch = [
            "diff --git a/old.ts b/new.ts",
            "similarity index 90%",
            "rename from old.ts",
            "rename to new.ts",
            "--- a/old.ts",
            "+++ b/new.ts",
            "@@ -1,2 +1,2 @@",
            "-before",
            "+after",
            " same",
        ].join("\n");
        const [s] = parseDiffFileSections(patch);
        expect(s.path).toBe("new.ts");
        expect(s.renamed).toBe(true);
    });

    it("does NOT mark adds/deletes as renames (/dev/null sides)", () => {
        const added = ["diff --git a/x.ts b/x.ts", "--- /dev/null", "+++ b/x.ts", "@@ -0,0 +1 @@", "+hi"].join("\n");
        expect(parseDiffFileSections(added)[0].renamed).toBe(false);
        const deleted = ["diff --git a/y.ts b/y.ts", "--- a/y.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-bye"].join("\n");
        expect(parseDiffFileSections(deleted)[0].renamed).toBe(false);
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
            { path: "", adds: 0, dels: 0, startIndex: 0, endIndex: 1, renamed: false },
        ]);
    });
});

describe("deriveFileJumpList", () => {
    const twoFilePatch = [
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

    it("folds sections into jump rows with path + counts, marking the current file", () => {
        const items = deriveFileJumpList(parseDiffFileSections(twoFilePatch), 1);
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ sectionIndex: 0, label: "one.ts", adds: 1, dels: 0, current: false });
        expect(items[1]).toEqual({ sectionIndex: 1, label: "two.ts", adds: 0, dels: 1, current: true });
    });

    it("marks exactly one file current for an in-range cursor", () => {
        const items = deriveFileJumpList(parseDiffFileSections(twoFilePatch), 0);
        expect(items.filter((i) => i.current).map((i) => i.sectionIndex)).toEqual([0]);
    });

    it("labels a pathless section '(file)' and marks nothing current for an out-of-range cursor", () => {
        const items = deriveFileJumpList(parseDiffFileSections(""), 5);
        expect(items[0].label).toBe("(file)");
        expect(items.every((i) => !i.current)).toBe(true);
    });
});
