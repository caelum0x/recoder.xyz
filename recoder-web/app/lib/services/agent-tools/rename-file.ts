/**
 * Rename File Tool
 * Renames or moves files in the codebase
 */

import { z } from 'zod';
import type { AgentContext, ToolDefinition } from './types';
import { escapeXmlAttr, safeJoin, isPathSafe } from './types';

// ============================================================================
// Schema
// ============================================================================

const renameFileSchema = z.object({
  from: z.string().describe('The current file path'),
  to: z.string().describe('The new file path'),
});

export type RenameFileArgs = z.infer<typeof renameFileSchema>;

// ============================================================================
// Rename File Implementation
// ============================================================================

/**
 * Rename or move a file
 */
export async function renameFile(
  args: RenameFileArgs,
  ctx: AgentContext,
): Promise<string> {
  const { from, to } = args;

  // Validate path safety
  if (!isPathSafe(from)) {
    throw new Error(`Invalid source path: ${from} (path traversal not allowed)`);
  }
  if (!isPathSafe(to)) {
    throw new Error(`Invalid destination path: ${to} (path traversal not allowed)`);
  }

  // Calculate full paths
  const fromPath = ctx.basePath ? safeJoin(ctx.basePath, from) : from;
  const toPath = ctx.basePath ? safeJoin(ctx.basePath, to) : to;

  try {
    // Call docker backend to rename file
    const response = await fetch(`/api/projects/${ctx.projectId}/files/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromPath,
        to: toPath,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to rename file: ${error}`);
    }

    ctx.log?.(`Renamed file: ${from} -> ${to}`, 'info');

    return `Successfully renamed ${from} to ${to}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to rename ${from} to ${to}: ${errorMessage}`);
  }
}

/**
 * Move multiple files
 */
export async function moveFiles(
  moves: Array<{ from: string; to: string }>,
  ctx: AgentContext,
): Promise<string[]> {
  const results: string[] = [];

  for (const move of moves) {
    try {
      const result = await renameFile(move, ctx);
      results.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push(`Failed to move ${move.from}: ${errorMessage}`);
    }
  }

  return results;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const renameFileTool: ToolDefinition<RenameFileArgs> = {
  name: 'rename_file',
  description: 'Rename or move a file in the codebase',
  inputSchema: renameFileSchema,
  defaultConsent: 'always',
  modifiesState: true,

  getConsentPreview: (args) => `Rename ${args.from} to ${args.to}`,

  buildXml: (args, _isComplete) => {
    if (!args.from || !args.to) return undefined;
    return `<recoder-rename from="${escapeXmlAttr(args.from)}" to="${escapeXmlAttr(args.to)}"></recoder-rename>`;
  },

  execute: renameFile,
};
