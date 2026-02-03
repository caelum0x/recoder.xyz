/**
 * Agent Tool: Read File
 *
 * Read the content of a file from the codebase.
 * This is a read-only operation with no side effects.
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
import { dockerReadFile } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const readFileSchema = z.object({
  path: z.string().describe('The file path to read (relative to project root)'),
});

export type ReadFileArgs = z.infer<typeof readFileSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const readFileTool: ToolDefinition<ReadFileArgs> = {
  name: 'read_file',
  description: `Read the content of a file from the codebase.

- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.
- Returns the file content as a string.
- Throws an error if the file does not exist.`,
  inputSchema: readFileSchema,
  defaultConsent: 'always',
  modifiesState: false,

  getConsentPreview: (args) => `Read ${args.path}`,

  buildXml: (args, _isComplete) => {
    if (!args.path) return undefined;
    return `<recoder-read path="${escapeXmlAttr(args.path)}"></recoder-read>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const normalizedPath = normalizePath(args.path);

    // Safety check
    if (!isPathSafe(args.path)) {
      throw new Error(`Invalid path: ${args.path} - path traversal not allowed`);
    }

    const fullPath = ctx.basePath
      ? safeJoin(ctx.basePath, normalizedPath)
      : normalizedPath;

    ctx.log?.(`Reading file: ${fullPath}`, 'debug');

    try {
      const content = await dockerReadFile(ctx.projectId, fullPath);
      return content || '';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Check for file not found
      if (message.toLowerCase().includes('not found')) {
        throw new Error(`File does not exist: ${args.path}`);
      }

      throw new Error(`Failed to read file ${args.path}: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Read a file from the project
 */
export async function readFile(
  projectId: string,
  path: string,
  options?: { basePath?: string },
): Promise<string> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: false,
  };

  return readFileTool.execute({ path }, ctx);
}

/**
 * Read multiple files in parallel
 */
export async function readFiles(
  projectId: string,
  paths: string[],
  options?: { basePath?: string; continueOnError?: boolean },
): Promise<Map<string, string | Error>> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: false,
  };

  const results = new Map<string, string | Error>();

  const promises = paths.map(async (path) => {
    try {
      const content = await readFileTool.execute({ path }, ctx);
      results.set(path, content);
    } catch (error) {
      if (options?.continueOnError) {
        results.set(path, error instanceof Error ? error : new Error(String(error)));
      } else {
        throw error;
      }
    }
  });

  await Promise.all(promises);
  return results;
}
