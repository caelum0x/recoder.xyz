/**
 * Agent Tool: Edit File
 *
 * Edit an existing file using an AI-powered smart merge system.
 * The edit output uses "// ... existing code ..." markers to indicate
 * unchanged portions, which are then applied by a fast-apply model.
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
import { dockerReadFile, dockerWriteFile } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const editFileSchema = z.object({
  path: z.string().describe('The file path relative to the project root'),
  content: z.string().describe('The updated code snippet to apply'),
  description: z.string().optional().describe('Brief description of the edit'),
});

export type EditFileArgs = z.infer<typeof editFileSchema>;

// ============================================================================
// Edit Application Logic
// ============================================================================

/**
 * Apply edits with "// ... existing code ..." markers.
 *
 * This is a simplified implementation that handles basic cases.
 * For production use, this should call a specialized fast-apply API.
 */
export async function applySmartEdit(
  originalContent: string,
  editContent: string,
  _description?: string,
): Promise<string> {
  // If the edit doesn't contain markers, treat it as a full replacement
  if (!editContent.includes('// ... existing code ...')) {
    return editContent;
  }

  const lines = originalContent.split('\n');
  const editLines = editContent.split('\n');
  const result: string[] = [];

  let originalIndex = 0;
  let editIndex = 0;

  while (editIndex < editLines.length) {
    const editLine = editLines[editIndex];

    // Check for "existing code" marker
    if (editLine.trim() === '// ... existing code ...') {
      // Find the next non-marker line in the edit
      let nextEditIndex = editIndex + 1;
      while (
        nextEditIndex < editLines.length &&
        editLines[nextEditIndex].trim() === '// ... existing code ...'
      ) {
        nextEditIndex++;
      }

      if (nextEditIndex >= editLines.length) {
        // Marker at the end - include all remaining original lines
        while (originalIndex < lines.length) {
          result.push(lines[originalIndex]);
          originalIndex++;
        }
        break;
      }

      // Find where the next edit line matches in the original
      const nextEditLine = editLines[nextEditIndex];
      const nextEditLineNormalized = nextEditLine.trim();

      // Search for the match point in original
      let foundMatch = false;
      const searchStart = originalIndex;

      for (let i = originalIndex; i < lines.length; i++) {
        const originalLineNormalized = lines[i].trim();

        if (originalLineNormalized === nextEditLineNormalized) {
          // Found match - include all original lines up to but not including this one
          while (originalIndex < i) {
            result.push(lines[originalIndex]);
            originalIndex++;
          }
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // No match found - include remaining original content up to a reasonable point
        // This handles the case where the marker is at the beginning
        const linesToAdd = Math.min(10, lines.length - originalIndex);
        for (let i = 0; i < linesToAdd && originalIndex < lines.length; i++) {
          result.push(lines[originalIndex]);
          originalIndex++;
        }
      }

      editIndex = nextEditIndex;
      continue;
    }

    // Regular edit line - add it and advance original index if matching
    result.push(editLine);
    editIndex++;

    // Try to sync with original content
    const editLineNormalized = editLine.trim();
    if (
      originalIndex < lines.length &&
      lines[originalIndex].trim() === editLineNormalized
    ) {
      originalIndex++;
    }
  }

  return result.join('\n');
}

// ============================================================================
// Tool Definition
// ============================================================================

const DESCRIPTION = `
## When to Use edit_file

Use the \`edit_file\` tool ONLY when you are editing an existing file. The edit output will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.

**Use only ONE edit_file call per file.** If you need to make multiple changes to the same file, include all edits in sequence using \`// ... existing code ...\` comments between them.

## When NOT to Use edit_file

Do NOT use this tool when:
- You are creating a brand-new file (use write_file instead).
- You are rewriting most of an existing file (use write_file instead).

## Basic Format

When writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.

Basic example:
\`\`\`
edit_file(path="file.js", description="change code", content="""
// ... existing code ...
FIRST_EDIT
// ... existing code ...
SECOND_EDIT
// ... existing code ...
THIRD_EDIT
// ... existing code ...
""")
\`\`\`

## General Principles

You should bias towards repeating as few lines of the original file as possible to convey the change.

NEVER show unmodified code in the edit, unless sufficient context of unchanged lines around the code you're editing is needed to resolve ambiguity.

DO NOT omit spans of pre-existing code without using the // ... existing code ... comment to indicate its absence.
`;

export const editFileTool: ToolDefinition<EditFileArgs> = {
  name: 'edit_file',
  description: DESCRIPTION,
  inputSchema: editFileSchema,
  defaultConsent: 'always',
  modifiesState: true,

  getConsentPreview: (args) => `Edit ${args.path}`,

  buildXml: (args, isComplete) => {
    if (!args.path) return undefined;

    let xml = `<recoder-edit path="${escapeXmlAttr(args.path)}" description="${escapeXmlAttr(args.description ?? '')}">\n${args.content ?? ''}`;
    if (isComplete) {
      xml += '\n</recoder-edit>';
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

    ctx.log?.(`Editing file: ${fullPath}`, 'debug');

    // Read original file content
    let originalContent: string;
    try {
      originalContent = await dockerReadFile(ctx.projectId, fullPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.toLowerCase().includes('not found')) {
        throw new Error(`File does not exist: ${args.path}`);
      }
      throw new Error(`Failed to read file ${args.path}: ${message}`);
    }

    // Apply the smart edit
    const newContent = await applySmartEdit(
      originalContent,
      args.content,
      args.description,
    );

    // Write the updated content
    try {
      await dockerWriteFile(ctx.projectId, fullPath, newContent);
      ctx.log?.(`Successfully edited file: ${fullPath}`, 'info');
      return `Successfully edited ${args.path}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write edited file ${args.path}: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Edit a file in the project using smart merge
 */
export async function editFile(
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

  await editFileTool.execute(
    { path, content, description: options?.description },
    ctx,
  );
}
