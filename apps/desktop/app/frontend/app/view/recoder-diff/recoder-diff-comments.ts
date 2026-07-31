// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure mapping from RENDERED unified-diff lines to their real (file, line, side)
// anchor, so a reviewer can click ANY changed line — added, context, OR deleted —
// and attach a comment the agent receives as precise `file:line` context (POST
// …/review-comments). Nothing here touches jotai/fetch — the view renders
// `patch.split("\n")` and this returns a parallel array indexed the same way.

// The anchor for one rendered diff line. `line` is the 1-based line number in the
// file identified by `side`: the NEW file for an added/context line (side "new"),
// the OLD file for a deletion (side "old"). Both are null for hunk/file/meta
// headers (nothing to point a comment at).
type DiffLineAnchor = {
    file: string;
    line: number | null;
    side: "old" | "new" | null;
};

// A reviewer's draft comment, anchored at a changed line (or file-level when the
// line is null). Mirrors the backend ReviewComment shape the route accepts,
// including difit's diff-source `side` (defaults to "new").
type ReviewCommentDraft = {
    file: string;
    line: number | null;
    side?: "old" | "new";
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

// Parse a hunk header "@@ -a,b +u,v @@" into the starting OLD (`a`) and NEW (`u`)
// file lines. Returns null when the header is malformed (the caller then leaves
// following lines unanchored rather than guessing a wrong line number).
function parseHunkStarts(line: string): { oldStart: number; newStart: number } | null {
    const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (match == null) {
        return null;
    }
    const oldStart = Number(match[1]);
    const newStart = Number(match[2]);
    if (!Number.isFinite(oldStart) || !Number.isFinite(newStart)) {
        return null;
    }
    return { oldStart, newStart };
}

// Fold a raw unified diff into a per-rendered-line anchor array. Tracks BOTH the
// old-file and new-file line counters from hunk headers (context advances both,
// an add advances new, a deletion advances old) and the current file from
// "+++ b/…" headers, exactly mirroring how the view splits and renders the patch.
function computeDiffLineAnchors(patch: string): DiffLineAnchor[] {
    const lines = patch.split("\n");
    const anchors: DiffLineAnchor[] = [];
    let currentFile = "";
    let oldLine = 0;
    let newLine = 0;
    let inHunk = false;
    const meta = (): DiffLineAnchor => ({ file: currentFile, line: null, side: null });
    for (const line of lines) {
        if (line.startsWith("+++ ")) {
            currentFile = stripDiffPathPrefix(line.slice(4));
            inHunk = false;
            anchors.push(meta());
            continue;
        }
        if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ")) {
            inHunk = false;
            anchors.push(meta());
            continue;
        }
        if (line.startsWith("@@")) {
            const starts = parseHunkStarts(line);
            if (starts == null) {
                inHunk = false;
                anchors.push(meta());
                continue;
            }
            oldLine = starts.oldStart;
            newLine = starts.newStart;
            inHunk = true;
            anchors.push(meta());
            continue;
        }
        if (!inHunk) {
            anchors.push(meta());
            continue;
        }
        if (line.startsWith("-")) {
            // Deletion: anchor to its OLD-file line (side "old"); advances old only.
            anchors.push({ file: currentFile, line: oldLine, side: "old" });
            oldLine += 1;
            continue;
        }
        if (line.startsWith("+")) {
            // Addition: anchor to its NEW-file line; advances new only.
            anchors.push({ file: currentFile, line: newLine, side: "new" });
            newLine += 1;
            continue;
        }
        // Context line: present in both files — anchor to the NEW side by default;
        // advances both counters.
        anchors.push({ file: currentFile, line: newLine, side: "new" });
        oldLine += 1;
        newLine += 1;
    }
    return anchors;
}

export { computeDiffLineAnchors, stripDiffPathPrefix, parseHunkStarts, type DiffLineAnchor, type ReviewCommentDraft };
