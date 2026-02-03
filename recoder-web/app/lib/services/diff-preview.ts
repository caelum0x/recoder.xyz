/**
 * Diff Preview Service
 * Provides diff preview and change management for AI modifications
 *
 * Features:
 * 1. Generate unified diff view
 * 2. Allow accept/reject changes
 * 3. Support partial acceptance
 * 4. Track pending changes
 */

import { createTwoFilesPatch, structuredPatch, parsePatch } from 'diff';

export interface FileDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
}

export interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface PendingChange {
  id: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  description: string;
  timestamp: Date;
  diff: FileDiff;
  applied: boolean;
}

// Store for pending changes
const pendingChanges: Map<string, PendingChange> = new Map();

/**
 * Generate a structured diff between old and new content
 */
export function generateDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): FileDiff {
  const patch = structuredPatch(
    filePath,
    filePath,
    oldContent,
    newContent,
    'original',
    'modified'
  );

  const hunks: DiffHunk[] = patch.hunks.map((hunk, index) => {
    const lines: DiffLine[] = [];
    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    for (const line of hunk.lines) {
      const type: DiffLine['type'] =
        line.startsWith('+') ? 'add' :
        line.startsWith('-') ? 'remove' : 'context';

      const content = line.substring(1);

      lines.push({
        type,
        content,
        oldLineNumber: type !== 'add' ? oldLineNum : undefined,
        newLineNumber: type !== 'remove' ? newLineNum : undefined,
      });

      if (type !== 'add') oldLineNum++;
      if (type !== 'remove') newLineNum++;
    }

    return {
      id: `hunk-${index}`,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines,
      status: 'pending',
    };
  });

  return {
    filePath,
    oldContent,
    newContent,
    hunks,
    status: 'pending',
  };
}

/**
 * Generate a unified diff patch string
 */
export function generateUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): string {
  return createTwoFilesPatch(
    filePath,
    filePath,
    oldContent,
    newContent,
    'original',
    'modified'
  );
}

/**
 * Parse a unified diff string into structured format
 */
export function parseUnifiedDiff(diffString: string): FileDiff[] {
  const patches = parsePatch(diffString);

  return patches.map(patch => {
    const hunks: DiffHunk[] = patch.hunks.map((hunk, index) => {
      const lines: DiffLine[] = [];
      let oldLineNum = hunk.oldStart;
      let newLineNum = hunk.newStart;

      for (const line of hunk.lines) {
        const type: DiffLine['type'] =
          line.startsWith('+') ? 'add' :
          line.startsWith('-') ? 'remove' : 'context';

        const content = line.substring(1);

        lines.push({
          type,
          content,
          oldLineNumber: type !== 'add' ? oldLineNum : undefined,
          newLineNumber: type !== 'remove' ? newLineNum : undefined,
        });

        if (type !== 'add') oldLineNum++;
        if (type !== 'remove') newLineNum++;
      }

      return {
        id: `hunk-${index}`,
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines,
        status: 'pending' as const,
      };
    });

    return {
      filePath: patch.newFileName?.replace(/^b\//, '') || 'unknown',
      oldContent: '',
      newContent: '',
      hunks,
      status: 'pending' as const,
    };
  });
}

/**
 * Apply selected hunks to create new content
 */
export function applySelectedHunks(
  oldContent: string,
  diff: FileDiff,
  acceptedHunkIds: string[]
): string {
  // If no hunks are accepted, return original content
  if (acceptedHunkIds.length === 0) {
    return oldContent;
  }

  // If all hunks are accepted, return new content
  if (acceptedHunkIds.length === diff.hunks.length) {
    return diff.newContent;
  }

  // Apply only selected hunks
  const lines = oldContent.split('\n');
  const acceptedHunks = diff.hunks.filter(h => acceptedHunkIds.includes(h.id));

  // Sort hunks by oldStart in reverse order to apply from bottom to top
  acceptedHunks.sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of acceptedHunks) {
    const startIndex = hunk.oldStart - 1;
    const oldLines = hunk.lines.filter(l => l.type !== 'add').length;
    const newLines = hunk.lines
      .filter(l => l.type !== 'remove')
      .map(l => l.content);

    lines.splice(startIndex, oldLines, ...newLines);
  }

  return lines.join('\n');
}

/**
 * Add a pending change
 */
export function addPendingChange(
  filePath: string,
  oldContent: string,
  newContent: string,
  description: string = 'AI modification'
): PendingChange {
  const id = `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const diff = generateDiff(filePath, oldContent, newContent);

  const change: PendingChange = {
    id,
    filePath,
    oldContent,
    newContent,
    description,
    timestamp: new Date(),
    diff,
    applied: false,
  };

  pendingChanges.set(id, change);
  return change;
}

/**
 * Get all pending changes
 */
export function getPendingChanges(): PendingChange[] {
  return Array.from(pendingChanges.values()).filter(c => !c.applied);
}

/**
 * Get pending changes for a specific file
 */
export function getPendingChangesForFile(filePath: string): PendingChange[] {
  return getPendingChanges().filter(c => c.filePath === filePath);
}

/**
 * Accept a pending change
 */
export function acceptChange(changeId: string): PendingChange | null {
  const change = pendingChanges.get(changeId);
  if (change) {
    change.applied = true;
    change.diff.status = 'accepted';
    change.diff.hunks.forEach(h => h.status = 'accepted');
    return change;
  }
  return null;
}

/**
 * Reject a pending change
 */
export function rejectChange(changeId: string): PendingChange | null {
  const change = pendingChanges.get(changeId);
  if (change) {
    change.applied = true; // Mark as processed
    change.diff.status = 'rejected';
    change.diff.hunks.forEach(h => h.status = 'rejected');
    return change;
  }
  return null;
}

/**
 * Accept specific hunks from a change
 */
export function acceptPartialChange(
  changeId: string,
  hunkIds: string[]
): { newContent: string; change: PendingChange } | null {
  const change = pendingChanges.get(changeId);
  if (!change) return null;

  // Update hunk statuses
  change.diff.hunks.forEach(hunk => {
    hunk.status = hunkIds.includes(hunk.id) ? 'accepted' : 'rejected';
  });
  change.diff.status = 'partial';
  change.applied = true;

  // Generate new content with only accepted hunks
  const newContent = applySelectedHunks(
    change.oldContent,
    change.diff,
    hunkIds
  );

  return { newContent, change };
}

/**
 * Clear all pending changes
 */
export function clearPendingChanges(): void {
  pendingChanges.clear();
}

/**
 * Clear pending changes for a file
 */
export function clearPendingChangesForFile(filePath: string): void {
  for (const [id, change] of pendingChanges) {
    if (change.filePath === filePath) {
      pendingChanges.delete(id);
    }
  }
}

/**
 * Format diff for display in chat
 */
export function formatDiffForDisplay(diff: FileDiff, maxLines: number = 50): string {
  const lines: string[] = [];
  lines.push(`**File:** \`${diff.filePath}\``);
  lines.push('```diff');

  let lineCount = 0;
  for (const hunk of diff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);

    for (const line of hunk.lines) {
      if (lineCount >= maxLines) {
        lines.push('... (truncated)');
        break;
      }

      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      lines.push(prefix + line.content);
      lineCount++;
    }

    if (lineCount >= maxLines) break;
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Calculate diff statistics
 */
export function getDiffStats(diff: FileDiff): {
  additions: number;
  deletions: number;
  changes: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions++;
      else if (line.type === 'remove') deletions++;
    }
  }

  return {
    additions,
    deletions,
    changes: additions + deletions,
  };
}

/**
 * Check if content has significant changes
 */
export function hasSignificantChanges(diff: FileDiff): boolean {
  const stats = getDiffStats(diff);
  // Consider significant if more than 5 changes or more than 10% of the file
  const totalLines = (diff.oldContent.match(/\n/g) || []).length + 1;
  return stats.changes > 5 || (stats.changes / totalLines) > 0.1;
}

/**
 * Generate inline diff HTML for preview
 */
export function generateInlineDiffHtml(diff: FileDiff): string {
  const lines: string[] = [];
  lines.push('<div class="diff-preview">');

  for (const hunk of diff.hunks) {
    lines.push(`<div class="diff-hunk" data-hunk-id="${hunk.id}">`);
    lines.push(`<div class="diff-header">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>`);

    for (const line of hunk.lines) {
      const className =
        line.type === 'add' ? 'diff-add' :
        line.type === 'remove' ? 'diff-remove' : 'diff-context';

      const lineNum = line.type === 'add'
        ? `<span class="line-num"></span><span class="line-num">${line.newLineNumber}</span>`
        : line.type === 'remove'
        ? `<span class="line-num">${line.oldLineNumber}</span><span class="line-num"></span>`
        : `<span class="line-num">${line.oldLineNumber}</span><span class="line-num">${line.newLineNumber}</span>`;

      lines.push(`<div class="diff-line ${className}">${lineNum}<span class="line-content">${escapeHtml(line.content)}</span></div>`);
    }

    lines.push('</div>');
  }

  lines.push('</div>');
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
