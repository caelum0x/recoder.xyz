// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Breadth-first directory walk that builds the candidate file list for the
// "@file" mention popup. The actual directory listing is injected (ListDirFn)
// so this stays testable without RpcApi; aimention-controller.ts supplies the
// real FileListCommand-backed implementation.

import { shouldSkipMentionDir, type MentionFileEntry } from "./aimention";

export interface MentionDirEntry {
    name: string;
    path: string;
    isDir: boolean;
}

export type ListDirFn = (dirPath: string) => Promise<MentionDirEntry[]>;

export interface MentionWalkLimits {
    maxFiles: number;
    maxDirsVisited: number;
    maxDepth: number;
}

export const DefaultMentionWalkLimits: MentionWalkLimits = {
    maxFiles: 400,
    maxDirsVisited: 150,
    maxDepth: 6,
};

function toRelPath(rootPath: string, absPath: string): string {
    const normalizedRoot = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
    if (absPath.startsWith(normalizedRoot)) {
        return absPath.slice(normalizedRoot.length);
    }
    return absPath;
}

// Walks the tree rooted at rootPath, skipping ignored directories, until it
// hits whichever limit comes first. Each listDir failure is treated as an
// empty directory rather than aborting the whole walk — one unreadable
// subtree should not blank the popup for the rest of the workspace.
export async function collectWorkspaceFiles(
    rootPath: string,
    listDir: ListDirFn,
    limits: MentionWalkLimits = DefaultMentionWalkLimits
): Promise<MentionFileEntry[]> {
    const results: MentionFileEntry[] = [];
    const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
    let dirsVisited = 0;

    while (queue.length > 0 && results.length < limits.maxFiles && dirsVisited < limits.maxDirsVisited) {
        const next = queue.shift();
        let entries: MentionDirEntry[];
        try {
            entries = await listDir(next.path);
        } catch {
            entries = [];
        }
        dirsVisited++;

        for (const entry of entries ?? []) {
            if (entry.isDir) {
                if (next.depth < limits.maxDepth && !shouldSkipMentionDir(entry.name)) {
                    queue.push({ path: entry.path, depth: next.depth + 1 });
                }
                continue;
            }
            results.push({
                relPath: toRelPath(rootPath, entry.path),
                absPath: entry.path,
                dirPath: next.path,
            });
            if (results.length >= limits.maxFiles) {
                break;
            }
        }
    }

    return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
