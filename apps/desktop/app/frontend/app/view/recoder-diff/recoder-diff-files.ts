// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure parse of a raw unified git diff into per-file sections, so the Review view
// can render each file as its own collapsible block with a jump list. Nothing here
// touches jotai/fetch. Sections are CONTIGUOUS ranges into `patch.split("\n")` and
// carry the SAME global line indices the comment anchors (recoder-diff-comments)
// use — the view renders `lines.slice(startIndex, endIndex)` and looks each line's
// anchor up by its global index, so per-file grouping never disturbs the inline
// comment composer or the per-file comment queue.

import { stripDiffPathPrefix } from "./recoder-diff-comments";

// One file's slice of the patch. `path` is the repo-relative display path (the NEW
// path, falling back to the OLD path for a deletion, then the "diff --git" header,
// then ""). `adds`/`dels` count changed lines (excluding the +++/--- file headers).
// `startIndex` is inclusive and `endIndex` exclusive into `patch.split("\n")`, so
// the sections tile the whole patch with no gaps or overlaps.
type DiffFileSection = {
    path: string;
    adds: number;
    dels: number;
    startIndex: number;
    endIndex: number;
    // True for a rename section (old path != new path, both real). Discard is
    // suppressed for renames: the backend's single-path re-diff cannot pair a
    // rename, so a hunk/file discard would delete the renamed file outright
    // instead of reverting the change (empirically verified).
    renamed: boolean;
};

const GitHeaderPrefix = "diff --git ";

// Best-effort NEW path from a "diff --git a/old b/new" header. Used only as a
// fallback when the +++/--- headers are absent; paths with spaces are ambiguous
// here (git offers no unambiguous split), so we accept the last-resort guess.
function parseGitHeaderPath(line: string): string {
    const rest = line.slice(GitHeaderPrefix.length).trim();
    const match = /^a\/(.*) b\/(.*)$/.exec(rest);
    if (match == null) {
        return "";
    }
    return match[2].trim();
}

// Resolve one section's fields by scanning only its own lines. The +++/--- headers
// are matched before the generic +/- counters so they never inflate adds/dels.
function buildSection(lines: string[], start: number, end: number): DiffFileSection {
    let adds = 0;
    let dels = 0;
    let newPath = "";
    let oldPath = "";
    let gitPath = "";
    for (let i = start; i < end; i++) {
        const line = lines[i];
        if (line.startsWith("+++ ")) {
            newPath = stripDiffPathPrefix(line.slice(4));
            continue;
        }
        if (line.startsWith("--- ")) {
            oldPath = stripDiffPathPrefix(line.slice(4));
            continue;
        }
        if (line.startsWith(GitHeaderPrefix)) {
            gitPath = parseGitHeaderPath(line);
            continue;
        }
        if (line.startsWith("+")) {
            adds += 1;
            continue;
        }
        if (line.startsWith("-")) {
            dels += 1;
        }
    }
    const path = newPath || oldPath || gitPath || "";
    const renamed = oldPath != "" && newPath != "" && oldPath != newPath && oldPath != "/dev/null" && newPath != "/dev/null";
    return { path, adds, dels, startIndex: start, endIndex: end, renamed };
}

// Split a raw unified diff into per-file sections at each "diff --git" boundary.
// Any content before the first boundary (or a patch with none) still yields a
// section so the render stays lossless — every line belongs to exactly one section.
function parseDiffFileSections(patch: string): DiffFileSection[] {
    const lines = patch.split("\n");
    const sections: DiffFileSection[] = [];
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(GitHeaderPrefix)) {
            if (start >= 0) {
                sections.push(buildSection(lines, start, i));
            }
            start = i;
            continue;
        }
        if (start < 0) {
            start = i;
        }
    }
    if (start >= 0) {
        sections.push(buildSection(lines, start, lines.length));
    }
    return sections;
}

// Anchor for one `@@` hunk-header line: the file's repo-relative path plus the
// hunk's ORDINAL within that file's diff. The ordinal is exactly the index the
// discard-hunks edge expects — the backend re-diffs the single path against the
// SAME review base and splits on `@@` headers in order, so the nth header seen
// here is the nth hunk it parses. No client-side patch math.
type DiffHunkAnchor = {
    path: string;
    hunkIndex: number;
};

// Map global line index (into patch.split("\n")) → hunk anchor for every `@@`
// line in a section with a resolvable path. Pathless sections yield no anchors —
// there is nothing safe to POST for them.
function computeDiffHunkAnchors(patch: string): Record<number, DiffHunkAnchor> {
    const lines = patch.split("\n");
    const anchors: Record<number, DiffHunkAnchor> = {};
    for (const section of parseDiffFileSections(patch)) {
        if (section.path == "") {
            continue;
        }
        let hunkIndex = 0;
        for (let i = section.startIndex; i < section.endIndex; i++) {
            if (lines[i].startsWith("@@")) {
                anchors[i] = { path: section.path, hunkIndex };
                hunkIndex += 1;
            }
        }
    }
    return anchors;
}

export { computeDiffHunkAnchors, parseDiffFileSections, parseGitHeaderPath, type DiffFileSection, type DiffHunkAnchor };
