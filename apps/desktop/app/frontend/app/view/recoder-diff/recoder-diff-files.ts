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
    return { path, adds, dels, startIndex: start, endIndex: end };
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

export { parseDiffFileSections, parseGitHeaderPath, type DiffFileSection };
