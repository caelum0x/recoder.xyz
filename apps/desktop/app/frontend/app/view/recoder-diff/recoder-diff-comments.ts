// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure mapping from RENDERED unified-diff lines to their real (file, new-line)
// anchor, so a reviewer can click a changed line and attach a comment the agent
// receives as precise `file:line` context (POST …/review-comments). Nothing here
// touches jotai/fetch — the view renders `patch.split("\n")` and this returns a
// parallel array indexed the same way.

// The anchor for one rendered diff line. `newLine` is the 1-based line number in
// the NEW file for an added or context line; it is null for deletions, hunk
// headers, and file/meta headers (nothing in the new file to point a comment at).
type DiffLineAnchor = {
    file: string;
    newLine: number | null;
};

// A reviewer's draft comment, anchored at a changed line (or file-level when the
// line is null). Mirrors the backend ReviewComment shape the route accepts.
type ReviewCommentDraft = {
    file: string;
    line: number | null;
    body: string;
};

// Strip a git diff path prefix ("a/" or "b/") so anchors carry the repo-relative
// path the backend expects. "/dev/null" (a pure add/delete side) yields "".
function stripDiffPathPrefix(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed === "/dev/null") {
        return "";
    }
    if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
        return trimmed.slice(2);
    }
    return trimmed;
}

// Parse the "+u,v" side of a hunk header "@@ -a,b +u,v @@" into the starting
// new-file line `u`. Returns null when the header is malformed (the caller then
// leaves following lines unanchored rather than guessing a wrong line number).
function parseHunkNewStart(line: string): number | null {
    const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (match == null) {
        return null;
    }
    const start = Number(match[1]);
    return Number.isFinite(start) ? start : null;
}

// Fold a raw unified diff into a per-rendered-line anchor array. Tracks the
// current new-file line from hunk headers and the current file from "+++ b/…"
// headers, exactly mirroring how the view splits and renders the patch. A line
// with no meaningful new-file position (deletion, hunk/meta header) gets a null
// newLine; a line before any file header gets file "" (the view then offers no
// comment affordance).
function computeDiffLineAnchors(patch: string): DiffLineAnchor[] {
    const lines = patch.split("\n");
    const anchors: DiffLineAnchor[] = [];
    let currentFile = "";
    let newLine = 0;
    let inHunk = false;
    for (const line of lines) {
        // File headers reset the current file; "+++ b/<path>" carries the NEW path
        // (the one a new-file line number belongs to). "diff --git"/"index"/"---"
        // are neutral meta with no anchorable position.
        if (line.startsWith("+++ ")) {
            currentFile = stripDiffPathPrefix(line.slice(4));
            inHunk = false;
            anchors.push({ file: currentFile, newLine: null });
            continue;
        }
        if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ")) {
            inHunk = false;
            anchors.push({ file: currentFile, newLine: null });
            continue;
        }
        if (line.startsWith("@@")) {
            const start = parseHunkNewStart(line);
            if (start == null) {
                inHunk = false;
                anchors.push({ file: currentFile, newLine: null });
                continue;
            }
            newLine = start;
            inHunk = true;
            anchors.push({ file: currentFile, newLine: null });
            continue;
        }
        if (!inHunk) {
            anchors.push({ file: currentFile, newLine: null });
            continue;
        }
        if (line.startsWith("-")) {
            // Deletion: present only in the OLD file — nothing to anchor in the new.
            anchors.push({ file: currentFile, newLine: null });
            continue;
        }
        // Added ("+") or context (" ") line: it occupies `newLine` in the new file.
        anchors.push({ file: currentFile, newLine });
        newLine += 1;
    }
    return anchors;
}

export { computeDiffLineAnchors, stripDiffPathPrefix, parseHunkNewStart, type DiffLineAnchor, type ReviewCommentDraft };
