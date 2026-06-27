import * as path from 'node:path';
import { tool, type Schema, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { getSandbox } from './tool-loop-context';
import {
  isDotEnvFilePath,
  isSensitiveDotEnvPath,
  resolveWorkspacePath,
  toDisplayPath,
} from './path-security';

/**
 * ADAPT of `ts/open-agents/packages/agent/tools/*` (read/write/edit/bash/grep/glob).
 *
 * The descriptions, schemas, security guards (workspace containment, dotenv approval), and
 * output shapes are preserved verbatim. The only fusion change: these run against our
 * in-process `LocalSandbox` (local FS at a policy-bounded cwd) instead of the cloud
 * `@open-agents/sandbox`, so the driver compiles inside `@recoder/runtime` and runs
 * fully offline. Shell-bearing tools (bash/grep/glob) inherit `policy.allowShell` from the
 * sandbox, so they fail truthfully when shell is denied.
 */

// ---------------------------------------------------------------------------
// `defineTool` — the `ai` generics boundary (docs §5: keep `ai` real, narrow at the seam).
//
// `ai`'s `tool({ inputSchema: <zod schema> })` infers INPUT through `FlexibleSchema`, which
// for Zod v4 is `z4.core.$ZodType<INPUT, any>`. Letting tsc infer INPUT from a real Zod
// object schema instantiates that machinery so deeply it trips TS2589 ("excessively deep")
// — and when tsc bails, every tool's `execute`/`needsApproval` argument collapses to
// `{ [x: string]: unknown }`, cascading into a wall of TS2339s. It also drags those deep
// generics toward the DTS surface.
//
// The fix keeps `ai` as the REAL dependency and the Zod schema as the REAL runtime
// validator, but narrows the type seam: each tool declares its INPUT/OUTPUT as concrete
// local Recoder types, and we hand `ai`'s `tool()` explicit type arguments plus a concrete
// `Schema<INPUT>` so the deep `FlexibleSchema` inference never runs. `needsApproval`
// (runtime-supported by `ai@5`, but absent from the bundled provider-utils `.d.ts`) is
// threaded through here so the human-in-the-loop dotenv/dangerous-command gates stay live.
// ---------------------------------------------------------------------------

/** Options handed to a fused tool's `execute`, narrowed from `ai`'s `ToolCallOptions`. */
type ToolExecuteOptions = {
  readonly experimental_context?: unknown;
  readonly abortSignal?: AbortSignal;
};

type ToolExecute<INPUT, OUTPUT> = (
  input: INPUT,
  options: ToolExecuteOptions,
) => Promise<OUTPUT>;

interface DefineToolConfig<INPUT, OUTPUT> {
  readonly description: string;
  readonly inputSchema: z.ZodType<INPUT>;
  readonly execute: ToolExecute<INPUT, OUTPUT>;
  /** Human-in-the-loop gate. Runtime-supported by `ai@5`; threaded through the seam. */
  readonly needsApproval?: (input: INPUT) => boolean | Promise<boolean>;
}

/**
 * Construct an `ai` tool with concrete INPUT/OUTPUT types. Internally still the real
 * `ai.tool()`; the explicit type arguments + `Schema<INPUT>` cast keep the heavy
 * `FlexibleSchema` inference (and its TS2589 blowup) out of the program.
 */
function defineTool<INPUT, OUTPUT>(
  config: DefineToolConfig<INPUT, OUTPUT>,
): Tool<INPUT, OUTPUT> {
  const { inputSchema, ...rest } = config;
  return tool<INPUT, OUTPUT>({
    ...(rest as object),
    inputSchema: inputSchema as unknown as Schema<INPUT>,
  } as Parameters<typeof tool<INPUT, OUTPUT>>[0]);
}

/** Escape a string for safe use inside a single-quoted shell argument. */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const GREP_EXEC_TIMEOUT_MS = 30_000;
const GLOB_EXEC_TIMEOUT_MS = 30_000;
const BASH_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

const readInputSchema = z.object({
  filePath: z
    .string()
    .describe('Workspace-relative path to the file to read (e.g., src/index.ts)'),
  offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
  limit: z.number().optional().describe('Maximum number of lines to read. Default: 2000'),
});
type ReadInput = z.infer<typeof readInputSchema>;
type ReadOutput =
  | { success: false; error: string }
  | {
      success: true;
      path: string;
      totalLines: number;
      startLine: number;
      endLine: number;
      content: string;
    };

export const readFileTool = () =>
  defineTool<ReadInput, ReadOutput>({
    needsApproval: async ({ filePath }) => isDotEnvFilePath(filePath),
    description: `Read a file from the filesystem.

USAGE:
- Use workspace-relative paths (e.g., "src/index.ts")
- Paths are resolved from the workspace root
- By default reads up to 2000 lines starting from line 1
- Use offset and limit for long files (both are line-based, 1-indexed)
- Results include line numbers starting at 1 in "N: content" format`,
    inputSchema: readInputSchema,
    execute: async ({ filePath, offset = 1, limit = 2000 }, { experimental_context }) => {
      const sandbox = getSandbox(experimental_context, 'read');
      const workingDirectory = sandbox.workingDirectory;
      try {
        const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
        if (!absolutePath) {
          return { success: false, error: 'Path must stay within the workspace.' };
        }
        const stats = await sandbox.stat(absolutePath);
        if (stats.isDirectory()) {
          return {
            success: false,
            error: 'Cannot read a directory. Use glob or ls command instead.',
          };
        }
        const content = await sandbox.readFile(absolutePath, 'utf-8');
        const lines = content.split('\n');
        const startLine = Math.max(1, offset) - 1;
        const endLine = Math.min(lines.length, startLine + limit);
        const selectedLines = lines.slice(startLine, endLine);
        const numberedLines = selectedLines.map((line, i) => `${startLine + i + 1}: ${line}`);
        return {
          success: true,
          path: toDisplayPath(absolutePath, workingDirectory),
          totalLines: lines.length,
          startLine: startLine + 1,
          endLine,
          content: numberedLines.join('\n'),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Failed to read file: ${message}` };
      }
    },
  });

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

const writeInputSchema = z.object({
  filePath: z
    .string()
    .describe('Workspace-relative path to the file to write (e.g., src/user.test.ts)'),
  content: z.string().describe('Content to write to the file'),
});
type WriteInput = z.infer<typeof writeInputSchema>;
type WriteOutput =
  | { success: false; error: string }
  | { success: true; path: string; bytesWritten: number };

export const writeFileTool = () =>
  defineTool<WriteInput, WriteOutput>({
    needsApproval: async ({ filePath }) =>
      isSensitiveDotEnvPath({ requestedPath: filePath, absolutePath: filePath }),
    description: `Write content to a file on the filesystem.

WHEN TO USE:
- Creating a new file that does not yet exist
- Completely replacing the contents of an existing file after you've read it

USAGE:
- Use workspace-relative paths (e.g., "src/user.test.ts")
- This will OVERWRITE existing files entirely
- Parent directories are created automatically if they do not exist

IMPORTANT:
- ALWAYS read an existing file before overwriting it
- Do not write files that contain secrets or credentials (API keys, passwords, .env, etc.)`,
    inputSchema: writeInputSchema,
    execute: async ({ filePath, content }, { experimental_context }) => {
      const sandbox = getSandbox(experimental_context, 'write');
      const workingDirectory = sandbox.workingDirectory;
      try {
        const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
        if (!absolutePath) {
          return { success: false, error: 'Path must stay within the workspace.' };
        }
        await sandbox.mkdir(path.dirname(absolutePath), { recursive: true });
        await sandbox.writeFile(absolutePath, content, 'utf-8');
        const stats = await sandbox.stat(absolutePath);
        return {
          success: true,
          path: toDisplayPath(absolutePath, workingDirectory),
          bytesWritten: stats.size,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Failed to write file: ${message}` };
      }
    },
  });

// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

const editInputSchema = z.object({
  filePath: z
    .string()
    .describe('Workspace-relative path to the file to edit (e.g., src/auth.ts)'),
  oldString: z.string().describe('The exact text to replace'),
  newString: z
    .string()
    .describe('The text to replace it with (must differ from oldString)'),
  replaceAll: z.boolean().optional().describe('Replace all occurrences. Default: false'),
  startLine: z
    .number()
    .optional()
    .describe('Line number where oldString starts (for diff display)'),
});
type EditInput = z.infer<typeof editInputSchema>;
type EditOutput =
  | { success: false; error: string; hint?: string }
  | { success: true; path: string; replacements: number; startLine: number };

export const editFileTool = () =>
  defineTool<EditInput, EditOutput>({
    needsApproval: async ({ filePath }) =>
      isSensitiveDotEnvPath({ requestedPath: filePath, absolutePath: filePath }),
    description: `Perform exact string replacement in a file.

WHEN TO USE:
- Making small, precise edits to an existing file you have already read
- Renaming a variable or identifier consistently within a single file

USAGE:
- Use workspace-relative file paths (e.g., "src/auth.ts")
- You must read the file first in this conversation
- Provide oldString as the EXACT text to replace, including whitespace and indentation
- By default, oldString must be UNIQUE in the file; otherwise the edit will fail
- Use replaceAll: true to change ALL occurrences of oldString in the file

IMPORTANT:
- Preserve exact indentation and spacing from the file's content
- Never include the "N: " line prefixes from the read output in oldString or newString`,
    inputSchema: editInputSchema,
    execute: async (
      { filePath, oldString, newString, replaceAll = false },
      { experimental_context },
    ) => {
      const sandbox = getSandbox(experimental_context, 'edit');
      const workingDirectory = sandbox.workingDirectory;
      try {
        if (oldString === newString) {
          return { success: false, error: 'oldString and newString must be different' };
        }
        const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
        if (!absolutePath) {
          return { success: false, error: 'Path must stay within the workspace.' };
        }
        const content = await sandbox.readFile(absolutePath, 'utf-8');
        if (!content.includes(oldString)) {
          return {
            success: false,
            error: 'oldString not found in file',
            hint: 'Make sure to match exact whitespace and indentation',
          };
        }
        const occurrences = content.split(oldString).length - 1;
        if (occurrences > 1 && !replaceAll) {
          return {
            success: false,
            error: `oldString found ${occurrences} times. Use replaceAll=true or provide more context to make it unique.`,
          };
        }
        const matchIndex = content.indexOf(oldString);
        const startLine = content.slice(0, matchIndex).split('\n').length;
        const newContent = replaceAll
          ? content.split(oldString).join(newString)
          : content.replace(oldString, newString);
        await sandbox.writeFile(absolutePath, newContent, 'utf-8');
        return {
          success: true,
          path: toDisplayPath(absolutePath, workingDirectory),
          replacements: replaceAll ? occurrences : 1,
          startLine,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Failed to edit file: ${message}` };
      }
    },
  });

// ---------------------------------------------------------------------------
// bash — approval heuristics ported verbatim from open-agents tools/bash.ts
// ---------------------------------------------------------------------------

const DANGEROUS_COMMAND_PATTERNS: readonly RegExp[] = [
  /\bcurl\b/,
  /\brm\s+(?:[^\n;&|]*\s)?(?:-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r|-r\s+-f|-f\s+-r|-{1,2}recursive\b.*-{1,2}force\b|-{1,2}force\b.*-{1,2}recursive\b)/,
  /\bfind\b[^\n;&|]*(?:-delete|-exec\s+rm\b)/,
  /\b(?:shred|mkfs|dd)\b/,
  /:\(\)\s*\{\s*:\|:/,
];

const SENSITIVE_FILE_PATTERNS: readonly RegExp[] = [
  /\.\s*env/i,
  /\.e(?:['"]{2}|\\|\$\{[^}]*\}|\$\([^)]*\))?nv/i,
  /\.e\$\([^)]*nv[^)]*\)/i,
  /\$\([^)]*env[^)]*\)/i,
  /`[^`]*env[^`]*`/i,
  /\b(?:aws\/credentials|id_rsa|id_ed25519|\.ssh|proc\/self\/environ)\b/i,
];

/** Whether a command should require approval (dangerous or dotenv-referencing). */
export function commandNeedsApproval(command: string): boolean {
  const trimmedCommand = command.trim();
  const lowerCommand = trimmedCommand.toLowerCase();
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmedCommand)) return true;
  }
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(lowerCommand));
}

const bashInputSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  cwd: z
    .string()
    .optional()
    .describe('Workspace-relative working directory for the command (e.g., apps/web)'),
});
type BashInput = z.infer<typeof bashInputSchema>;
type BashOutput = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated?: true;
};

export const bashTool = () =>
  defineTool<BashInput, BashOutput>({
    needsApproval: async ({ command }) => commandNeedsApproval(command),
    description: `Execute a bash command in the user's shell (non-interactive).

WHEN TO USE:
- Running existing project commands (build, test, lint, typecheck)
- Using read-only CLI tools (git status, git diff, ls, etc.)
- Invoking language/package managers (npm, pnpm, yarn, pip, go, etc.)

USAGE:
- Runs bash -c "<command>" in a non-interactive shell (no TTY/PTY)
- Commands automatically run in the working directory by default — do NOT prepend "cd /path &&"
- Use the cwd parameter ONLY with a workspace-relative subdirectory
- Commands automatically timeout after ~2 minutes
- Combined stdout/stderr output is truncated after ~50,000 characters

DO NOT USE FOR:
- File reading (cat, head, tail) - use the read tool
- File editing (sed, awk, editors) - use the edit / write tools
- Code search (grep, rg) - use the grep tool`,
    inputSchema: bashInputSchema,
    execute: async ({ command, cwd }, { experimental_context, abortSignal }) => {
      const sandbox = getSandbox(experimental_context, 'bash');
      const workingDirectory = sandbox.workingDirectory;
      const workingDir = cwd
        ? path.isAbsolute(cwd)
          ? cwd
          : path.resolve(workingDirectory, cwd)
        : workingDirectory;
      const result = await sandbox.exec(command, workingDir, BASH_TIMEOUT_MS, {
        signal: abortSignal,
      });
      return {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        ...(result.truncated && { truncated: true }),
      };
    },
  });

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

const grepInputSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z
    .string()
    .describe('Workspace-relative file or directory to search in (e.g., src)'),
  glob: z.string().optional().describe("Glob pattern to filter files (e.g., '*.ts')"),
  caseSensitive: z.boolean().optional().describe('Case-sensitive search. Default: true'),
});
type GrepInput = z.infer<typeof grepInputSchema>;
type GrepMatch = { file: string; line: number; content: string };
type GrepOutput =
  | { success: false; error: string }
  | {
      success: true;
      pattern: string;
      matchCount: number;
      filesWithMatches: number;
      matches: GrepMatch[];
    };

export const grepTool = () =>
  defineTool<GrepInput, GrepOutput>({
    description: `Search for patterns in files using POSIX Extended Regular Expressions (ERE).

WHEN TO USE:
- Finding where a function, variable, or string literal is used
- Locating configuration keys, routes, or error messages across files

USAGE:
- Uses POSIX ERE syntax; Perl shorthands like \\s, \\w, \\d are NOT supported
- Search a specific file OR an entire directory via the path parameter
- Optionally filter files with glob (e.g., "*.ts")
- Results are limited to 100 matches total, with up to 10 matches per file`,
    inputSchema: grepInputSchema,
    execute: async (
      { pattern, path: searchPath, glob, caseSensitive = true },
      { experimental_context, abortSignal },
    ) => {
      const sandbox = getSandbox(experimental_context, 'grep');
      const workingDirectory = sandbox.workingDirectory;
      try {
        const absolutePath = path.isAbsolute(searchPath)
          ? searchPath
          : path.resolve(workingDirectory, searchPath);
        const maxTotal = 100;
        const maxPerFile = 10;
        const args: string[] = ['grep', '-rn'];
        if (!caseSensitive) args.push('-i');
        args.push(`--exclude-dir=${shellEscape('.*')}`, `--exclude-dir=${shellEscape('node_modules')}`);
        if (glob) args.push(`--include=${shellEscape(glob)}`);
        args.push('-m', String(maxPerFile), '-E', shellEscape(pattern), shellEscape(absolutePath));
        const command = args.join(' ');
        const result = await sandbox.exec(command, workingDirectory, GREP_EXEC_TIMEOUT_MS, {
          signal: abortSignal,
        });
        if (!result.success && result.exitCode !== 1) {
          const errorOutput = (result.stderr || result.stdout).slice(0, 500);
          return { success: false, error: `Grep failed (exit ${result.exitCode}): ${errorOutput}` };
        }
        const matches: Array<{ file: string; line: number; content: string }> = [];
        const filesSet = new Set<string>();
        const fileMatchCounts = new Map<string, number>();
        const lines = result.stdout.split('\n').filter(Boolean);
        for (const line of lines) {
          if (matches.length >= maxTotal) break;
          const match = line.match(/:(\d+):/);
          if (!match || match.index === undefined) continue;
          const file = line.slice(0, match.index);
          const rest = line.slice(match.index + 1);
          const colonIndex = rest.indexOf(':');
          if (colonIndex === -1) continue;
          const lineNum = Number.parseInt(rest.slice(0, colonIndex), 10);
          const content = rest.slice(colonIndex + 1);
          if (Number.isNaN(lineNum)) continue;
          const displayFile = toDisplayPath(file, workingDirectory);
          filesSet.add(displayFile);
          const currentFileCount = fileMatchCounts.get(displayFile) ?? 0;
          if (currentFileCount >= maxPerFile) continue;
          fileMatchCounts.set(displayFile, currentFileCount + 1);
          matches.push({ file: displayFile, line: lineNum, content: content.slice(0, 200) });
        }
        return {
          success: true,
          pattern,
          matchCount: matches.length,
          filesWithMatches: filesSet.size,
          matches,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Grep failed: ${message}` };
      }
    },
  });

// ---------------------------------------------------------------------------
// glob
// ---------------------------------------------------------------------------

const globInputSchema = z.object({
  pattern: z.string().describe("Glob pattern to match (e.g., '**/*.ts')"),
  path: z
    .string()
    .optional()
    .describe('Workspace-relative base directory to search from (e.g., src)'),
  limit: z.number().optional().describe('Maximum number of results. Default: 100'),
});
type GlobInput = z.infer<typeof globInputSchema>;
type GlobFile = { path: string; size: number; modifiedAt: string };
type GlobOutput =
  | { success: false; error: string }
  | {
      success: true;
      pattern: string;
      baseDir: string;
      count: number;
      files: GlobFile[];
    };

export const globTool = () =>
  defineTool<GlobInput, GlobOutput>({
    description: `Find files matching a glob pattern.

WHEN TO USE:
- Locating files by extension or naming pattern (e.g., all *.test.ts files)
- Discovering where components, migrations, or configs live

USAGE:
- Supports patterns like "**/*.ts", "src/**/*.js", "*.json"
- Returns FILES (not directories) sorted by modification time (newest first)
- Skips hidden files (names starting with ".") and node_modules
- If path is omitted, the current working directory is used as the base`,
    inputSchema: globInputSchema,
    execute: async (
      { pattern, path: basePath, limit = 100 },
      { experimental_context, abortSignal },
    ) => {
      const sandbox = getSandbox(experimental_context, 'glob');
      const workingDirectory = sandbox.workingDirectory;
      try {
        let searchDir = basePath
          ? path.isAbsolute(basePath)
            ? basePath
            : path.resolve(workingDirectory, basePath)
          : workingDirectory;
        const patternParts = pattern.split('/').filter(Boolean);
        const namePattern = patternParts[patternParts.length - 1] ?? '*';
        const literalPrefix: string[] = [];
        for (let i = 0; i < patternParts.length - 1; i++) {
          const part = patternParts[i]!;
          if (part.includes('*') || part.includes('?') || part.includes('[')) break;
          literalPrefix.push(part);
        }
        if (literalPrefix.length > 0) searchDir = path.join(searchDir, ...literalPrefix);
        const remainingDirSegments = patternParts.slice(literalPrefix.length, patternParts.length - 1);
        const hasRecursiveWildcard =
          remainingDirSegments.some((s: string) => s === '**') || namePattern === '**';
        let maxDepth: number | undefined;
        if (!hasRecursiveWildcard) maxDepth = remainingDirSegments.length + 1;
        const findArgs: string[] = ['find', shellEscape(searchDir)];
        if (maxDepth !== undefined) findArgs.push('-maxdepth', String(maxDepth));
        findArgs.push(
          '-not', '-path', "'*/.*'",
          '-not', '-path', "'*/node_modules/*'",
          '-type', 'f',
          '-name', shellEscape(namePattern),
        );
        const findBase = findArgs.join(' ');
        const command = [
          `{ ${findBase} -printf '%T@\\t%s\\t%p\\n' 2>/dev/null`,
          `|| ${findBase} -print0 | xargs -0 stat -f '%m%t%z%t%N' ; }`,
          `| sort -t$'\\t' -k1 -rn | head -n ${limit}`,
        ].join(' ');
        const result = await sandbox.exec(command, workingDirectory, GLOB_EXEC_TIMEOUT_MS, {
          signal: abortSignal,
        });
        if (!result.success && result.exitCode !== 1) {
          return {
            success: false,
            error: `Glob failed (exit ${result.exitCode}): ${result.stdout.slice(0, 500)}`,
          };
        }
        const files: Array<{ path: string; size: number; modifiedAt: number }> = [];
        const lines = result.stdout.split('\n').filter(Boolean);
        for (const line of lines) {
          const firstTab = line.indexOf('\t');
          if (firstTab === -1) continue;
          const secondTab = line.indexOf('\t', firstTab + 1);
          if (secondTab === -1) continue;
          const mtimeSeconds = Number.parseFloat(line.slice(0, firstTab));
          const size = Number.parseInt(line.slice(firstTab + 1, secondTab), 10);
          const filePath = line.slice(secondTab + 1);
          if (Number.isNaN(mtimeSeconds) || Number.isNaN(size) || !filePath) continue;
          files.push({
            path: toDisplayPath(filePath, workingDirectory),
            size,
            modifiedAt: mtimeSeconds * 1000,
          });
        }
        return {
          success: true,
          pattern,
          baseDir: toDisplayPath(searchDir, workingDirectory),
          count: files.length,
          files: files.map((f) => ({
            path: f.path,
            size: f.size,
            modifiedAt: new Date(f.modifiedAt).toISOString(),
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Glob failed: ${message}` };
      }
    },
  });

/**
 * The fused tool set the in-process agent loop exposes. Mirrors the open-agents
 * `ToolLoopAgent` tools (read/write/edit/bash/grep/glob); the higher-level
 * todo/task/skill/ask/web tools are out of scope for the headless runtime surface.
 */
export function buildToolLoopTools(): ToolSet {
  return {
    read: readFileTool(),
    write: writeFileTool(),
    edit: editFileTool(),
    bash: bashTool(),
    grep: grepTool(),
    glob: globTool(),
  } satisfies ToolSet;
}

/**
 * Best-effort tool-mode classification used by the engine's policy guards
 * (work-lock / forbidden-path / shell / network). Maps each fused tool name to the
 * `ToolCallMode[]` the engine understands.
 */
export function classifyToolModes(toolName: string): Array<'read' | 'write' | 'execute' | 'network' | 'custom'> {
  switch (toolName) {
    case 'read':
    case 'grep':
    case 'glob':
      return ['read'];
    case 'write':
    case 'edit':
      return ['write'];
    case 'bash':
      return ['execute'];
    default:
      return ['custom'];
  }
}

/** Best-effort extraction of the path(s) a tool call intends to touch (for path guards). */
export function extractToolPaths(toolName: string, input: unknown): string[] | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const record = input as Record<string, unknown>;
  const filePath = record['filePath'];
  if ((toolName === 'read' || toolName === 'write' || toolName === 'edit') && typeof filePath === 'string') {
    return [filePath];
  }
  const searchPath = record['path'];
  if ((toolName === 'grep' || toolName === 'glob') && typeof searchPath === 'string') {
    return [searchPath];
  }
  return undefined;
}
