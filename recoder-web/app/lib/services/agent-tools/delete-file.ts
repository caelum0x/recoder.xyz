/**
 * Delete File Tool
 * Removes files or directories from the codebase
 */

import { z } from 'zod';
import type { AgentContext, ToolDefinition } from './types';
import { escapeXmlAttr, safeJoin, isPathSafe } from './types';

// ============================================================================
// Schema
// ============================================================================

const deleteFileSchema = z.object({
  path: z.string().describe('The file path to delete'),
});

export type DeleteFileArgs = z.infer<typeof deleteFileSchema>;

// ============================================================================
// Delete File Implementation
// ============================================================================

/**
 * Delete a file from the project
 */
export async function deleteFile(
  args: DeleteFileArgs,
  ctx: AgentContext,
): Promise<string> {
  const { path } = args;

  // Validate path safety
  if (!isPathSafe(path)) {
    throw new Error(`Invalid path: ${path} (path traversal not allowed)`);
  }

  // Calculate full path
  const fullPath = ctx.basePath ? safeJoin(ctx.basePath, path) : path;

  try {
    // Call docker backend to delete file
    const response = await fetch(`/api/projects/${ctx.projectId}/files`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: fullPath }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete file: ${error}`);
    }

    ctx.log?.(`Deleted file: ${path}`, 'info');

    return `Successfully deleted ${path}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to delete ${path}: ${errorMessage}`);
  }
}

/**
 * Delete multiple files
 */
export async function deleteFiles(
  paths: string[],
  ctx: AgentContext,
): Promise<string[]> {
  const results: string[] = [];

  for (const path of paths) {
    try {
      const result = await deleteFile({ path }, ctx);
      results.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push(`Failed to delete ${path}: ${errorMessage}`);
    }
  }

  return results;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const deleteFileTool: ToolDefinition<DeleteFileArgs> = {
  name: 'delete_file',
  description: 'Delete a file or directory from the codebase',
  inputSchema: deleteFileSchema,
  defaultConsent: 'always',
  modifiesState: true,

  getConsentPreview: (args) => `Delete ${args.path}`,

  buildXml: (args, _isComplete) => {
    if (!args.path) return undefined;
    return `<recoder-delete path="${escapeXmlAttr(args.path)}"></recoder-delete>`;
  },

  execute: deleteFile,
};
