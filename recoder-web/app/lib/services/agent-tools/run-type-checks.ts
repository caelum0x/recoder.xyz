/**
 * Run Type Checks Tool
 * Execute TypeScript type checking on the workspace
 */

import { z } from 'zod';
import type { AgentContext, ToolDefinition } from './types';
import { escapeXmlAttr, escapeXmlContent, normalizePath } from './types';

// ============================================================================
// Schema
// ============================================================================

const runTypeChecksSchema = z.object({
  paths: z
    .array(z.string())
    .optional()
    .describe(
      'Optional. An array of paths to files or directories to read type errors for. If provided, returns diagnostics for the specified files/directories only. If not provided, returns diagnostics for all files in the workspace.'
    ),
});

export type RunTypeChecksArgs = z.infer<typeof runTypeChecksSchema>;

// ============================================================================
// Types
// ============================================================================

export interface TypeCheckProblem {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export interface TypeCheckResult {
  problems: TypeCheckProblem[];
  summary: string;
}

// ============================================================================
// Run Type Checks Implementation
// ============================================================================

const DESCRIPTION = `Run TypeScript type checks on the current workspace. You can provide paths to specific files or directories, or omit the argument to get diagnostics for all files.

- If a file path is provided, returns diagnostics for that file only
- If a directory path is provided, returns diagnostics for all files within that directory
- If no path is provided, returns diagnostics for all files in the workspace
- This tool can return type errors that were already present before your edits, so avoid calling it with a very wide scope of files
- NEVER call this tool on a file unless you've edited it or are about to edit it`;

/**
 * Check if a problem file matches any of the specified paths
 */
function matchesPaths(problemFile: string, paths: string[]): boolean {
  const normalizedProblemFile = normalizePath(problemFile);

  for (const targetPath of paths) {
    const normalizedTarget = normalizePath(targetPath);

    // Exact file match
    if (normalizedProblemFile === normalizedTarget) {
      return true;
    }

    // Directory prefix match
    if (normalizedProblemFile.startsWith(normalizedTarget + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Format problems into a readable text output
 */
function formatProblems(problems: TypeCheckProblem[]): string {
  if (problems.length === 0) {
    return 'No type errors found.';
  }

  const lines = problems.map(
    (p) => `${p.file}:${p.line}:${p.column}: ${p.message}`
  );

  return `Found ${problems.length} type error(s):\n\n${lines.join('\n')}`;
}

/**
 * Run TypeScript type checks
 */
export async function runTypeChecks(
  args: RunTypeChecksArgs,
  ctx: AgentContext,
): Promise<string> {
  const title =
    args.paths && args.paths.length > 0
      ? `Type checking: ${args.paths.join(', ')}`
      : 'Type checking all files';

  ctx.onXmlStream?.(`<recoder-status title="${escapeXmlAttr(title)}"></recoder-status>`);

  try {
    // Call the type check API
    const response = await fetch(`/api/projects/${ctx.projectId}/typecheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: args.paths }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Type check failed: ${error}`);
    }

    const data: TypeCheckResult = await response.json();
    let problems = data.problems;

    // Filter by paths if specified
    if (args.paths && args.paths.length > 0) {
      problems = problems.filter((p) => matchesPaths(p.file, args.paths!));
    }

    const result = formatProblems(problems);

    ctx.onXmlComplete?.(`<recoder-status title="${escapeXmlAttr(title)}">\n${escapeXmlContent(result)}\n</recoder-status>`);

    ctx.log?.(`Type check completed: ${problems.length} errors`, 'info');

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.onXmlComplete?.(`<recoder-status title="${escapeXmlAttr(title)}" error="${escapeXmlAttr(errorMessage)}"></recoder-status>`);
    throw new Error(`Type check failed: ${errorMessage}`);
  }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const runTypeChecksTool: ToolDefinition<RunTypeChecksArgs> = {
  name: 'run_type_checks',
  description: DESCRIPTION,
  inputSchema: runTypeChecksSchema,
  defaultConsent: 'always',

  getConsentPreview: (args) =>
    args.paths && args.paths.length > 0
      ? `Check types for: ${args.paths.join(', ')}`
      : 'Check types for all files',

  execute: runTypeChecks,
};
