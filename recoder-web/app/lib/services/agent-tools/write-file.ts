/**
 * Agent Tool: Write File
 *
 * Create or completely overwrite a file in the codebase.
 * This is a state-modifying operation that requires appropriate permissions.
 */

import { z } from 'zod';
import {
  escapeXmlAttr,
  normalizePath,
  isPathSafe,
  safeJoin,
  type ToolDefinition,
  type AgentContext,
} from './types';
import { dockerWriteFile } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const writeFileSchema = z.object({
  path: z.string().describe('The file path relative to the project root'),
  content: z.string().describe('The content to write to the file'),
  description: z
    .string()
    .optional()
    .describe('Brief description of the change'),
});

export type WriteFileArgs = z.infer<typeof writeFileSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const writeFileTool: ToolDefinition<WriteFileArgs> = {
  name: 'write_file',
  description: `Create or completely overwrite a file in the codebase.

Use this tool when:
- Creating a new file from scratch
- Completely replacing the content of an existing file

Do NOT use this tool when:
- Making targeted edits to existing files (use search_replace or edit_file instead)
- The file is very large and you only need to change a small portion`,
  inputSchema: writeFileSchema,
  defaultConsent: 'always',
  modifiesState: true,

  getConsentPreview: (args) => `Write to ${args.path}`,

  buildXml: (args, isComplete) => {
    if (!args.path) return undefined;

    let xml = `<recoder-write path="${escapeXmlAttr(args.path)}" description="${escapeXmlAttr(args.description ?? '')}">\n${args.content ?? ''}`;
    if (isComplete) {
      xml += '\n</recoder-write>';
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    // Check modification permissions
    if (!ctx.canModify) {
      throw new Error('File modification not allowed in current context');
    }

    const normalizedPath = normalizePath(args.path);

    // Safety check
    if (!isPathSafe(args.path)) {
      throw new Error(`Invalid path: ${args.path} - path traversal not allowed`);
    }

    const fullPath = ctx.basePath
      ? safeJoin(ctx.basePath, normalizedPath)
      : normalizedPath;

    ctx.log?.(`Writing file: ${fullPath}`, 'debug');

    try {
      await dockerWriteFile(ctx.projectId, fullPath, args.content);
      ctx.log?.(`Successfully wrote file: ${fullPath}`, 'info');
      return `Successfully wrote ${args.path}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write file ${args.path}: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Write a file to the project
 */
export async function writeFile(
  projectId: string,
  path: string,
  content: string,
  options?: { basePath?: string; description?: string },
): Promise<void> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: true,
  };

  await writeFileTool.execute({ path, content, description: options?.description }, ctx);
}

/**
 * Write multiple files
 */
export async function writeFiles(
  projectId: string,
  files: Array<{ path: string; content: string; description?: string }>,
  options?: { basePath?: string; continueOnError?: boolean },
): Promise<{
  success: boolean;
  completed: number;
  failed: Array<{ path: string; error: string }>;
}> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: true,
  };

  const failed: Array<{ path: string; error: string }> = [];
  let completed = 0;

  for (const file of files) {
    try {
      await writeFileTool.execute(file, ctx);
      completed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failed.push({ path: file.path, error: errorMessage });

      if (!options?.continueOnError) {
        break;
      }
    }
  }

  return {
    success: failed.length === 0,
    completed,
    failed,
  };
}
