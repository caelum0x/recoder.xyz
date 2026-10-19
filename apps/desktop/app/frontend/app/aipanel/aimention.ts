// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure text/matching logic for the "@file" mention popup in the AI panel
// composer. Kept free of RpcApi/jotai so it is trivially unit testable; the
// RPC-driven file walk lives in aimention-filewalker.ts and the jotai/RPC
// wiring lives in aimention-controller.ts.

import { fuzzyMatch } from "@/app/view/recoder/recoder-command-palette";

export interface MentionFileEntry {
    // Path relative to the resolved mention root, always "/"-separated.
    relPath: string;
    // Absolute filesystem path (connection-local, no wsh:// prefix).
    absPath: string;
    // Absolute path of the directory containing the file.
    dirPath: string;
}

export interface MentionTrigger {
    // Index of the "@" character that opened the mention.
    triggerStart: number;
    // Text typed after "@", up to the cursor.
    query: string;
}

// Directory names a workspace-wide file search should never descend into —
// dependency trees, build output, and VCS internals that would otherwise
// dwarf the project's own source in the results.
const IgnoredMentionDirNames = new Set([
    "node_modules",
    "dist",
    "build",
    "out",
    ".git",
    ".next",
    ".turbo",
    ".cache",
    ".pnpm",
    ".yarn",
    "target",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    "coverage",
    ".idea",
    ".vscode",
    "tmp",
    ".wrangler",
]);

export function shouldSkipMentionDir(dirName: string): boolean {
    if (dirName == null || dirName === "") return false;
    if (dirName.startsWith(".")) return true;
    return IgnoredMentionDirNames.has(dirName);
}

// Finds the "@token" immediately to the left of the cursor, if any. A
// mention only triggers when "@" starts a token (string start or preceded by
// whitespace) and nothing after it up to the cursor breaks the token
// (whitespace or another "@" cancels it — the user has moved past it).
export function detectActiveMention(text: string, cursorPos: number): MentionTrigger {
    if (text == null || cursorPos <= 0) return null;
    const head = text.slice(0, cursorPos);
    const triggerStart = head.lastIndexOf("@");
    if (triggerStart === -1) return null;

    const precedingChar = triggerStart === 0 ? null : head[triggerStart - 1];
    if (precedingChar != null && !/\s/.test(precedingChar)) {
        return null;
    }

    const query = head.slice(triggerStart + 1);
    if (/\s/.test(query) || query.includes("@")) {
        return null;
    }

    return { triggerStart, query };
}

// Replaces the "@query" token with "@relPath" and returns the cursor
// position that should follow the insertion. A trailing space is only added
// when the remaining text does not already start with whitespace (end of
// input, or text was typed past the mention without a separating space) —
// otherwise the existing space after the token would double up.
export function insertMention(
    text: string,
    triggerStart: number,
    cursorPos: number,
    relPath: string
): { text: string; cursorPos: number } {
    const remainder = text.slice(cursorPos);
    const needsTrailingSpace = remainder.length === 0 || !/^\s/.test(remainder);
    const inserted = `@${relPath}${needsTrailingSpace ? " " : ""}`;
    const newText = text.slice(0, triggerStart) + inserted + remainder;
    return { text: newText, cursorPos: triggerStart + inserted.length };
}

// Ranks shorter relative paths above longer ones (a tighter match is usually
// the more relevant file) and falls back to alphabetical order.
function compareMentionEntries(a: MentionFileEntry, b: MentionFileEntry): number {
    if (a.relPath.length !== b.relPath.length) {
        return a.relPath.length - b.relPath.length;
    }
    return a.relPath.localeCompare(b.relPath);
}

export function filterMentionEntries(entries: MentionFileEntry[], query: string, limit = 8): MentionFileEntry[] {
    const matches = (entries ?? []).filter((entry) => fuzzyMatch(query, entry.relPath));
    return matches.sort(compareMentionEntries).slice(0, limit);
}
