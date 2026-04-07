"use strict";
/**
 * File Diff Utilities for CLI-Web Sync
 * Provides utilities for comparing files between CLI and web IDE
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashContent = hashContent;
exports.createFileMetaMap = createFileMetaMap;
exports.diffFileSets = diffFileSets;
exports.getDetailedDiff = getDetailedDiff;
exports.generateUnifiedDiff = generateUnifiedDiff;
exports.getDiffStats = getDiffStats;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Calculate SHA256 hash of content
 */
function hashContent(content) {
    const hash = crypto_1.default.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
}
/**
 * Create file metadata map from content map
 */
function createFileMetaMap(files) {
    const metaMap = new Map();
    for (const [path, content] of Object.entries(files)) {
        metaMap.set(path, {
            path,
            hash: hashContent(content),
            size: Buffer.byteLength(content, 'utf-8'),
        });
    }
    return metaMap;
}
/**
 * Compare two file sets and return differences
 */
function diffFileSets(localFiles, remoteFiles) {
    const added = [];
    const modified = [];
    const deleted = [];
    const unchanged = [];
    const localMeta = createFileMetaMap(localFiles);
    const remoteMeta = createFileMetaMap(remoteFiles);
    // Check local files against remote
    for (const [path, meta] of localMeta) {
        const remoteMeta_ = remoteMeta.get(path);
        if (!remoteMeta_) {
            added.push(path);
        }
        else if (meta.hash !== remoteMeta_.hash) {
            modified.push(path);
        }
        else {
            unchanged.push(path);
        }
    }
    // Check for deleted files (in remote but not in local)
    for (const path of remoteMeta.keys()) {
        if (!localMeta.has(path)) {
            deleted.push(path);
        }
    }
    return { added, modified, deleted, unchanged };
}
/**
 * Get detailed diff information for each file
 */
function getDetailedDiff(localFiles, remoteFiles) {
    const diffs = [];
    const localMeta = createFileMetaMap(localFiles);
    const remoteMeta = createFileMetaMap(remoteFiles);
    const allPaths = new Set([...localMeta.keys(), ...remoteMeta.keys()]);
    for (const path of allPaths) {
        const local = localMeta.get(path);
        const remote = remoteMeta.get(path);
        if (local && !remote) {
            diffs.push({
                path,
                status: 'added',
                localHash: local.hash,
                localSize: local.size,
            });
        }
        else if (!local && remote) {
            diffs.push({
                path,
                status: 'deleted',
                remoteHash: remote.hash,
                remoteSize: remote.size,
            });
        }
        else if (local && remote) {
            if (local.hash !== remote.hash) {
                diffs.push({
                    path,
                    status: 'modified',
                    localHash: local.hash,
                    remoteHash: remote.hash,
                    localSize: local.size,
                    remoteSize: remote.size,
                });
            }
            else {
                diffs.push({
                    path,
                    status: 'unchanged',
                    localHash: local.hash,
                    remoteHash: remote.hash,
                    localSize: local.size,
                    remoteSize: remote.size,
                });
            }
        }
    }
    // Sort by status priority: modified, added, deleted, unchanged
    const statusOrder = { modified: 0, added: 1, deleted: 2, unchanged: 3 };
    diffs.sort((a, b) => {
        const orderDiff = statusOrder[a.status] - statusOrder[b.status];
        if (orderDiff !== 0)
            return orderDiff;
        return a.path.localeCompare(b.path);
    });
    return diffs;
}
/**
 * Generate unified diff between two file contents
 */
function generateUnifiedDiff(path, localContent, remoteContent) {
    const lines = [];
    if (!localContent && !remoteContent) {
        return '';
    }
    if (!remoteContent) {
        // New file
        lines.push(`--- /dev/null`);
        lines.push(`+++ b/${path}`);
        const localLines = localContent.split('\n');
        lines.push(`@@ -0,0 +1,${localLines.length} @@`);
        for (const line of localLines) {
            lines.push(`+${line}`);
        }
        return lines.join('\n');
    }
    if (!localContent) {
        // Deleted file
        lines.push(`--- a/${path}`);
        lines.push(`+++ /dev/null`);
        const remoteLines = remoteContent.split('\n');
        lines.push(`@@ -1,${remoteLines.length} +0,0 @@`);
        for (const line of remoteLines) {
            lines.push(`-${line}`);
        }
        return lines.join('\n');
    }
    // Modified file - simple line-by-line diff
    const localLines = localContent.split('\n');
    const remoteLines = remoteContent.split('\n');
    lines.push(`--- a/${path} (remote)`);
    lines.push(`+++ b/${path} (local)`);
    // Simple diff algorithm - show context around changes
    const changes = [];
    // Use LCS-based diff for better results
    const lcs = computeLCS(remoteLines, localLines);
    let remoteIdx = 0;
    let localIdx = 0;
    let lcsIdx = 0;
    while (remoteIdx < remoteLines.length || localIdx < localLines.length) {
        if (lcsIdx < lcs.length && remoteIdx < remoteLines.length && remoteLines[remoteIdx] === lcs[lcsIdx]) {
            if (localIdx < localLines.length && localLines[localIdx] === lcs[lcsIdx]) {
                changes.push({ type: 'context', lineNum: localIdx + 1, content: localLines[localIdx] });
                remoteIdx++;
                localIdx++;
                lcsIdx++;
            }
            else if (localIdx < localLines.length) {
                changes.push({ type: 'add', lineNum: localIdx + 1, content: localLines[localIdx] });
                localIdx++;
            }
        }
        else if (remoteIdx < remoteLines.length) {
            changes.push({ type: 'remove', lineNum: remoteIdx + 1, content: remoteLines[remoteIdx] });
            remoteIdx++;
        }
        else if (localIdx < localLines.length) {
            changes.push({ type: 'add', lineNum: localIdx + 1, content: localLines[localIdx] });
            localIdx++;
        }
    }
    // Format as unified diff
    let i = 0;
    while (i < changes.length) {
        // Find a hunk (group of changes with context)
        let hunkStart = i;
        // Skip leading context (but keep some for display)
        while (hunkStart > 0 && changes[hunkStart - 1].type === 'context') {
            hunkStart--;
        }
        hunkStart = Math.max(0, i - 3);
        // Find end of hunk
        let hunkEnd = i;
        while (hunkEnd < changes.length) {
            if (changes[hunkEnd].type !== 'context') {
                // Found a change, extend to include trailing context
                let j = hunkEnd + 1;
                let contextCount = 0;
                while (j < changes.length && changes[j].type === 'context' && contextCount < 3) {
                    contextCount++;
                    j++;
                }
                hunkEnd = j;
                // Check if there's another change within the context window
                if (j < changes.length && changes[j].type !== 'context') {
                    continue;
                }
                break;
            }
            hunkEnd++;
        }
        // Output hunk header
        const hunkChanges = changes.slice(hunkStart, hunkEnd);
        const removeCount = hunkChanges.filter(c => c.type === 'remove' || c.type === 'context').length;
        const addCount = hunkChanges.filter(c => c.type === 'add' || c.type === 'context').length;
        const startLine = hunkStart + 1;
        lines.push(`@@ -${startLine},${removeCount} +${startLine},${addCount} @@`);
        for (const change of hunkChanges) {
            if (change.type === 'add') {
                lines.push(`+${change.content}`);
            }
            else if (change.type === 'remove') {
                lines.push(`-${change.content}`);
            }
            else {
                lines.push(` ${change.content}`);
            }
        }
        i = hunkEnd;
        // Skip remaining context until next change
        while (i < changes.length && changes[i].type === 'context') {
            i++;
        }
    }
    return lines.join('\n');
}
/**
 * Compute Longest Common Subsequence
 */
function computeLCS(a, b) {
    const m = a.length;
    const n = b.length;
    // Use dp table
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Backtrack to find LCS
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            lcs.unshift(a[i - 1]);
            i--;
            j--;
        }
        else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        }
        else {
            j--;
        }
    }
    return lcs;
}
/**
 * Calculate statistics about a diff
 */
function getDiffStats(diff) {
    return {
        totalChanges: diff.added.length + diff.modified.length + diff.deleted.length,
        addedCount: diff.added.length,
        modifiedCount: diff.modified.length,
        deletedCount: diff.deleted.length,
        unchangedCount: diff.unchanged.length,
        hasChanges: diff.added.length + diff.modified.length + diff.deleted.length > 0,
    };
}
