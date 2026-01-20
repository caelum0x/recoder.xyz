/**
 * Command Registry Store
 *
 * Manages built-in commands, custom commands, and workflows for task automation.
 * Commands can be executed via slash commands (/test) or command palette (Ctrl+Shift+P).
 */

import { atom, map } from 'nanostores';

// =============================================================================
// Types
// =============================================================================

export type CommandCategory = 'test' | 'deploy' | 'lint' | 'build' | 'custom';
export type CommandAction = 'shell' | 'prompt' | 'workflow';
export type CommandType = 'builtin' | 'custom' | 'workflow';

export interface WorkflowStep {
  id: string;
  name: string;
  action: 'shell' | 'prompt' | 'file';
  command?: string;
  prompt?: string;
  file?: { path: string; content: string };
  condition?: string; // Skip if condition fails
}

export interface Command {
  id: string;
  name: string;
  description: string;
  type: CommandType;

  // Execution
  action: CommandAction;
  shell?: string;
  prompt?: string;
  steps?: WorkflowStep[];

  // Metadata
  icon?: string;
  shortcut?: string;
  category?: CommandCategory;
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface WorkflowResult {
  success: boolean;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
}

// =============================================================================
// Built-in Commands
// =============================================================================

export const builtinCommands: Command[] = [
  {
    id: 'test',
    name: 'Run Tests',
    description: 'Run project tests (auto-detects Jest, Vitest, pytest)',
    type: 'builtin',
    action: 'shell',
    shell: 'npm test || yarn test || pnpm test || bun test || pytest',
    icon: 'i-ph-test-tube',
    shortcut: 'Ctrl+Shift+T',
    category: 'test',
  },
  {
    id: 'lint',
    name: 'Run Linter',
    description: 'Run ESLint/Prettier on the codebase',
    type: 'builtin',
    action: 'shell',
    shell: 'npm run lint || eslint . --fix',
    icon: 'i-ph-magnifying-glass',
    category: 'lint',
  },
  {
    id: 'build',
    name: 'Build Project',
    description: 'Build the project for production',
    type: 'builtin',
    action: 'shell',
    shell: 'npm run build || yarn build || bun run build',
    icon: 'i-ph-hammer',
    shortcut: 'Ctrl+Shift+B',
    category: 'build',
  },
  {
    id: 'typecheck',
    name: 'Type Check',
    description: 'Run TypeScript type checking',
    type: 'builtin',
    action: 'shell',
    shell: 'npx tsc --noEmit',
    icon: 'i-ph-brackets-curly',
    category: 'lint',
  },
  {
    id: 'format',
    name: 'Format Code',
    description: 'Format code with Prettier',
    type: 'builtin',
    action: 'shell',
    shell: 'npx prettier --write .',
    icon: 'i-ph-text-align-left',
    category: 'lint',
  },
  {
    id: 'clean',
    name: 'Clean Install',
    description: 'Remove node_modules and reinstall',
    type: 'builtin',
    action: 'shell',
    shell: 'rm -rf node_modules && npm install',
    icon: 'i-ph-broom',
    category: 'build',
  },
  {
    id: 'dev',
    name: 'Start Dev Server',
    description: 'Start the development server',
    type: 'builtin',
    action: 'shell',
    shell: 'npm run dev || yarn dev || bun dev',
    icon: 'i-ph-play',
    category: 'build',
  },
  {
    id: 'install',
    name: 'Install Dependencies',
    description: 'Install project dependencies',
    type: 'builtin',
    action: 'shell',
    shell: 'npm install || yarn install || bun install',
    icon: 'i-ph-package',
    category: 'build',
  },
  // Refactoring Commands
  {
    id: 'refactor',
    name: 'Refactor Code',
    description: 'Analyze current file for code improvements',
    type: 'builtin',
    action: 'prompt',
    prompt: `Analyze the currently open file for code improvements.

First, use the readFile tool to read the current file, then:
1. Identify areas for improvement (readability, maintainability, best practices)
2. For each issue, show the BEFORE code with line numbers
3. Explain WHY it should change
4. Show the AFTER code
5. Rate impact: [LOW/MEDIUM/HIGH]

Focus on actionable changes that provide real value. Don't suggest trivial changes.
After analysis, ask if I want to apply any changes using str_replace or multi_apply_diff tools.`,
    icon: 'i-ph-wrench',
    category: 'custom',
  },
  {
    id: 'simplify',
    name: 'Simplify Code',
    description: 'Reduce complexity and remove redundant code',
    type: 'builtin',
    action: 'prompt',
    prompt: `Simplify the currently open file.

First, use the readFile tool to read the current file, then:
1. Find redundant or overly complex code
2. Suggest simplifications with before/after examples
3. Reduce nesting depth where possible
4. Use built-in functions instead of manual implementations
5. Estimate lines of code reduction

After analysis, ask if I want to apply any changes.`,
    icon: 'i-ph-scissors',
    category: 'custom',
  },
  {
    id: 'optimize',
    name: 'Optimize Performance',
    description: 'Find performance improvements',
    type: 'builtin',
    action: 'prompt',
    prompt: `Optimize the currently open file for performance.

First, use the readFile tool to read the current file, then:
1. Analyze algorithm complexity (Big O notation)
2. Find performance bottlenecks (unnecessary loops, redundant calculations)
3. Suggest optimizations with complexity analysis
4. Identify caching/memoization opportunities

After analysis, ask if I want to apply any changes.`,
    icon: 'i-ph-lightning',
    category: 'custom',
  },
  {
    id: 'document',
    name: 'Add Documentation',
    description: 'Generate JSDoc/TSDoc comments',
    type: 'builtin',
    action: 'prompt',
    prompt: `Add documentation to the currently open file.

First, use the readFile tool to read the current file, then:
1. Identify undocumented functions and classes
2. Generate JSDoc/TSDoc comments with @param and @returns
3. Add inline comments for complex logic
4. Include @example where helpful

After analysis, apply the documentation changes using str_replace or multi_apply_diff.`,
    icon: 'i-ph-file-doc',
    category: 'custom',
  },
  {
    id: 'explain',
    name: 'Explain Code',
    description: 'Get detailed explanation of code',
    type: 'builtin',
    action: 'prompt',
    prompt: `Explain the currently open file in detail.

First, use the readFile tool to read the current file, then:
1. Summarize the file's purpose (1-2 sentences)
2. Explain key functions and their roles
3. Describe the data flow and dependencies
4. Note any patterns or design decisions used
5. Identify any potential issues or areas for improvement`,
    icon: 'i-ph-question',
    category: 'custom',
  },
];

// =============================================================================
// Stores
// =============================================================================

/** Custom commands loaded from .recoder/commands/ */
export const customCommands = map<Record<string, Command>>({});

/** Command execution history (most recent first) */
export const commandHistory = atom<string[]>([]);

/** Currently executing command ID (null if none) */
export const executingCommand = atom<string | null>(null);

// =============================================================================
// Functions
// =============================================================================

/**
 * Get all available commands (builtin + custom)
 */
export function getAllCommands(): Command[] {
  const custom = Object.values(customCommands.get());
  return [...builtinCommands, ...custom];
}

/**
 * Get a command by ID
 */
export function getCommand(id: string): Command | undefined {
  // Check builtin first
  const builtin = builtinCommands.find((c) => c.id === id);
  if (builtin) return builtin;

  // Check custom
  return customCommands.get()[id];
}

/**
 * Register a custom command
 */
export function registerCustomCommand(command: Command): void {
  const current = customCommands.get();
  customCommands.set({ ...current, [command.id]: command });
}

/**
 * Unregister a custom command
 */
export function unregisterCustomCommand(id: string): void {
  const current = customCommands.get();
  const { [id]: _, ...rest } = current;
  customCommands.set(rest);
}

/**
 * Clear all custom commands
 */
export function clearCustomCommands(): void {
  customCommands.set({});
}

/**
 * Add command to history
 */
export function addToHistory(commandId: string): void {
  const history = commandHistory.get();
  // Remove if already exists, add to front
  const filtered = history.filter((id) => id !== commandId);
  commandHistory.set([commandId, ...filtered].slice(0, 20)); // Keep last 20
}

/**
 * Get recent commands
 */
export function getRecentCommands(limit: number = 5): Command[] {
  const history = commandHistory.get().slice(0, limit);
  return history.map((id) => getCommand(id)).filter((c): c is Command => c !== undefined);
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: CommandCategory): Command[] {
  return getAllCommands().filter((c) => c.category === category);
}

/**
 * Search commands by query (name or description)
 */
export function searchCommands(query: string): Command[] {
  const q = query.toLowerCase();
  return getAllCommands().filter(
    (c) => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  );
}

/**
 * Execute a shell command via the API
 */
export async function executeShellCommand(
  command: string,
  projectId: string,
  workingDir: string = '/workspace'
): Promise<CommandResult> {
  try {
    const response = await fetch('/api/enterprise-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'executeShell',
        params: { command, workingDir },
      }),
    });

    const result = await response.json() as any;

    if (result.success) {
      return {
        success: true,
        output: result.output,
        exitCode: result.exitCode ?? 0,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Command failed',
        exitCode: result.exitCode ?? 1,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exitCode: 1,
    };
  }
}

/**
 * Execute a command by ID
 */
export async function executeCommand(commandId: string, projectId: string): Promise<CommandResult> {
  const command = getCommand(commandId);
  if (!command) {
    return { success: false, error: `Command not found: ${commandId}` };
  }

  executingCommand.set(commandId);
  addToHistory(commandId);

  try {
    switch (command.action) {
      case 'shell':
        if (!command.shell) {
          return { success: false, error: 'No shell command defined' };
        }
        return await executeShellCommand(command.shell, projectId);

      case 'prompt':
        // Prompt commands return the prompt to be sent to AI
        return {
          success: true,
          output: command.prompt || '',
        };

      case 'workflow':
        if (!command.steps || command.steps.length === 0) {
          return { success: false, error: 'No workflow steps defined' };
        }
        return await executeWorkflow(command.steps, projectId);

      default:
        return { success: false, error: `Unknown action: ${command.action}` };
    }
  } finally {
    executingCommand.set(null);
  }
}

/**
 * Execute a multi-step workflow
 */
export async function executeWorkflow(steps: WorkflowStep[], projectId: string): Promise<CommandResult> {
  const completedSteps: string[] = [];

  for (const step of steps) {
    // Check condition if present
    if (step.condition) {
      // Simple condition evaluation (can be expanded)
      // For now, skip if condition starts with "skip"
      if (step.condition.toLowerCase().startsWith('skip')) {
        continue;
      }
    }

    let result: CommandResult;

    switch (step.action) {
      case 'shell':
        if (!step.command) {
          return {
            success: false,
            error: `Step "${step.name}" has no command`,
          };
        }
        result = await executeShellCommand(step.command, projectId);
        break;

      case 'prompt':
        // Prompt steps are informational
        result = { success: true, output: step.prompt || '' };
        break;

      case 'file':
        // File steps would create/modify files (not implemented yet)
        result = { success: true, output: `File step: ${step.file?.path}` };
        break;

      default:
        return {
          success: false,
          error: `Unknown step action: ${step.action}`,
        };
    }

    if (!result.success) {
      return {
        success: false,
        error: `Workflow failed at step "${step.name}": ${result.error}`,
        output: `Completed steps: ${completedSteps.join(', ')}\nFailed step: ${step.name}`,
      };
    }

    completedSteps.push(step.name);
  }

  return {
    success: true,
    output: `Workflow completed successfully. Steps: ${completedSteps.join(' -> ')}`,
  };
}
