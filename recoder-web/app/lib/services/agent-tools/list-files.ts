/**
 * Agent Tool: List Files
 *
 * List files in the application directory.
 * By default, lists only the immediate directory contents.
 * Use recursive=true to list all files recursively.
 */

import { z } from 'zod';
import {
  escapeXmlAttr,
  escapeXmlContent,
  normalizePath,
  isPathSafe,
  safeJoin,
  type ToolDefinition,
  type AgentContext,
} from './types';
import { dockerGet } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const listFilesSchema = z.object({
  directory: z.string().optional().describe('Optional subdirectory to list'),
  recursive: z
    .boolean()
    .optional()
    .describe('Whether to list files recursively (default: false)'),
});

export type ListFilesArgs = z.infer<typeof listFilesSchema>;

// ============================================================================
// File Tree Types
// ============================================================================

export interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  name: string;
  size?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getXmlAttributes(args: ListFilesArgs): string {
  const dirAttr = args.directory
    ? ` directory="${escapeXmlAttr(args.directory)}"`
    : '';
  const recursiveAttr =
    args.recursive !== undefined ? ` recursive="${args.recursive}"` : '';
  return `${dirAttr}${recursiveAttr}`;
}

/**
 * Filter files to a specific directory and optionally non-recursive
 */
function filterFiles(
  files: FileEntry[],
  directory?: string,
  recursive?: boolean,
): FileEntry[] {
  let filtered = files;

  // Filter by directory prefix if specified
  if (directory) {
    const normalizedDir = normalizePath(directory);
    filtered = files.filter((f) => {
      const normalizedPath = normalizePath(f.path);
      return normalizedPath.startsWith(normalizedDir + '/') || normalizedPath === normalizedDir;
    });

    // Adjust paths to be relative to the directory
    filtered = filtered.map((f) => ({
      ...f,
      path: f.path.startsWith(directory + '/')
        ? f.path.slice(directory.length + 1)
        : f.path,
    }));
  }

  // If not recursive, filter to only immediate children
  if (!recursive) {
    filtered = filtered.filter((f) => {
      const parts = f.path.split('/');
      return parts.length === 1;
    });
  }

  return filtered;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const listFilesTool: ToolDefinition<ListFilesArgs> = {
  name: 'list_files',
  description: `List files in the application directory.

- By default, lists only the immediate directory contents.
- Use recursive=true to list all files recursively.
- If you are not sure, list all files by omitting the directory parameter.

Returns a formatted list of files and directories.`,
  inputSchema: listFilesSchema,
  defaultConsent: 'always',
  modifiesState: false,

  getConsentPreview: (args) => {
    const recursiveText = args.recursive ? ' (recursive)' : '';
    return args.directory
      ? `List ${args.directory}${recursiveText}`
      : `List all files${recursiveText}`;
  },

  buildXml: (args, isComplete) => {
    if (isComplete) {
      return undefined;
    }
    return `<recoder-list-files${getXmlAttributes(args)}></recoder-list-files>`;
  },

  execute: async (args, ctx: AgentContext) => {
    // Safety check if directory is specified
    if (args.directory && !isPathSafe(args.directory)) {
      throw new Error(`Invalid directory: ${args.directory} - path traversal not allowed`);
    }

    const directory = args.directory
      ? ctx.basePath
        ? safeJoin(ctx.basePath, normalizePath(args.directory))
        : normalizePath(args.directory)
      : ctx.basePath || '';

    ctx.log?.(`Listing files in: ${directory || 'project root'}`, 'debug');

    try {
      // Fetch file tree from docker backend
      const endpoint = `/api/files/${ctx.projectId}`;
      const response = await dockerGet<{
        files: Array<{ path: string; type: 'file' | 'directory' }>;
      }>(endpoint, { timeout: 30000 });

      const allFiles: FileEntry[] = (response.files || []).map((f) => ({
        path: f.path,
        type: f.type,
        name: f.path.split('/').pop() || f.path,
      }));

      // Filter files based on arguments
      const filteredFiles = filterFiles(allFiles, args.directory, args.recursive);

      // Sort: directories first, then alphabetically
      filteredFiles.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.path.localeCompare(b.path);
      });

      // Build full file list for LLM
      const allFilesList =
        filteredFiles.map((file) => ` - ${file.path}${file.type === 'directory' ? '/' : ''}`).join('\n') || '(no files)';

      // Build abbreviated list for UI display
      const MAX_FILES_TO_SHOW = 20;
      const totalCount = filteredFiles.length;
      const displayedFiles = filteredFiles.slice(0, MAX_FILES_TO_SHOW);
      const abbreviatedList =
        displayedFiles.map((file) => ` - ${file.path}${file.type === 'directory' ? '/' : ''}`).join('\n') || '(no files)';
      const countInfo =
        totalCount > MAX_FILES_TO_SHOW
          ? `\n... and ${totalCount - MAX_FILES_TO_SHOW} more files (${totalCount} total)`
          : `\n(${totalCount} files total)`;

      // Write abbreviated list to UI
      ctx.onXmlComplete?.(
        `<recoder-list-files${getXmlAttributes(args)}>${escapeXmlContent(abbreviatedList + countInfo)}</recoder-list-files>`,
      );

      // Return full file list for LLM
      return allFilesList;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list files: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * List files in the project
 */
export async function listFiles(
  projectId: string,
  options?: {
    directory?: string;
    recursive?: boolean;
    basePath?: string;
  },
): Promise<FileEntry[]> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: false,
  };

  // Fetch file tree from docker backend
  const endpoint = `/api/files/${projectId}`;
  const response = await dockerGet<{
    files: Array<{ path: string; type: 'file' | 'directory' }>;
  }>(endpoint, { timeout: 30000 });

  const allFiles: FileEntry[] = (response.files || []).map((f) => ({
    path: f.path,
    type: f.type,
    name: f.path.split('/').pop() || f.path,
  }));

  return filterFiles(allFiles, options?.directory, options?.recursive);
}

/**
 * Get file tree as a structured object
 */
export async function getFileTree(
  projectId: string,
  options?: { basePath?: string },
): Promise<{
  files: FileEntry[];
  directories: FileEntry[];
}> {
  const allFiles = await listFiles(projectId, {
    recursive: true,
    basePath: options?.basePath,
  });

  return {
    files: allFiles.filter((f) => f.type === 'file'),
    directories: allFiles.filter((f) => f.type === 'directory'),
  };
}
