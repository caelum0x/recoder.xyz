/**
 * Commands API - Execute slash commands and workflows
 *
 * Endpoints:
 * - POST /api/commands - Execute a command
 * - GET /api/commands - List available commands (for a project)
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';

interface ExecuteCommandRequest {
  commandId: string;
  projectId: string;
  args?: string;
  workingDir?: string;
}

interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  type: 'shell' | 'prompt' | 'workflow';
}

// Built-in commands (same as client-side, but server-authoritative)
const BUILTIN_COMMANDS: Record<
  string,
  { shell?: string; prompt?: string; type: 'shell' | 'prompt' | 'workflow' }
> = {
  test: {
    shell: 'npm test || yarn test || pnpm test || bun test || pytest',
    type: 'shell',
  },
  lint: {
    shell: 'npm run lint || eslint . --fix',
    type: 'shell',
  },
  build: {
    shell: 'npm run build || yarn build || bun run build',
    type: 'shell',
  },
  typecheck: {
    shell: 'npx tsc --noEmit',
    type: 'shell',
  },
  format: {
    shell: 'npx prettier --write .',
    type: 'shell',
  },
  clean: {
    shell: 'rm -rf node_modules && npm install',
    type: 'shell',
  },
  dev: {
    shell: 'npm run dev || yarn dev || bun dev',
    type: 'shell',
  },
  install: {
    shell: 'npm install || yarn install || bun install',
    type: 'shell',
  },
};

/**
 * GET /api/commands - List commands for a project
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  // Return built-in commands + any custom commands for the project
  const commands = Object.entries(BUILTIN_COMMANDS).map(([id, cmd]) => ({
    id,
    type: cmd.type,
    isBuiltin: true,
  }));

  // TODO: Load custom commands from .recoder/commands/ if projectId provided

  return json({ commands });
}

/**
 * POST /api/commands - Execute a command
 */
export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json()) as ExecuteCommandRequest;
  const { commandId, projectId, args, workingDir = '/workspace' } = body;

  if (!commandId) {
    return json({ success: false, error: 'Missing commandId' } as CommandResult, { status: 400 });
  }

  // Check if it's a built-in command
  const builtinCmd = BUILTIN_COMMANDS[commandId];

  if (builtinCmd) {
    if (builtinCmd.type === 'shell' && builtinCmd.shell) {
      // Execute shell command
      let shellCommand = builtinCmd.shell;

      // Append args if provided
      if (args) {
        shellCommand = `${shellCommand} ${args}`;
      }

      try {
        const { executeShellCommand } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await executeShellCommand(shellCommand, workingDir);

        return json({
          success: result.success,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          type: 'shell',
        } as CommandResult);
      } catch (error) {
        return json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Shell execution failed',
            type: 'shell',
          } as CommandResult,
          { status: 500 }
        );
      }
    }

    if (builtinCmd.type === 'prompt' && builtinCmd.prompt) {
      // Return prompt to be sent to AI
      let prompt = builtinCmd.prompt;

      // Replace {args} placeholder
      if (args) {
        prompt = prompt.replace('{args}', args);
      }

      return json({
        success: true,
        output: prompt,
        type: 'prompt',
      } as CommandResult);
    }
  }

  // Try to load custom command from .recoder/commands/
  try {
    const { loadProjectCommands } = await import('~/lib/.server/commands/loader');
    const customCommands = await loadProjectCommands(workingDir);
    const customCmd = customCommands.find((c) => c.id === commandId);

    if (customCmd) {
      if (customCmd.action === 'shell' && customCmd.shell) {
        let shellCommand = customCmd.shell;
        if (args) {
          shellCommand = `${shellCommand} ${args}`;
        }

        const { executeShellCommand } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await executeShellCommand(shellCommand, workingDir);

        return json({
          success: result.success,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          type: 'shell',
        } as CommandResult);
      }

      if (customCmd.action === 'prompt' && customCmd.prompt) {
        let prompt = customCmd.prompt;
        if (args) {
          prompt = prompt.replace('{args}', args);
        }

        return json({
          success: true,
          output: prompt,
          type: 'prompt',
        } as CommandResult);
      }

      if (customCmd.action === 'workflow' && customCmd.steps) {
        // Execute workflow steps sequentially
        const completedSteps: string[] = [];

        for (const step of customCmd.steps) {
          if (step.action === 'shell' && step.command) {
            const { executeShellCommand } = await import('~/lib/.server/llm/enterprise-integration');
            const result = await executeShellCommand(step.command, workingDir);

            if (!result.success) {
              return json({
                success: false,
                error: `Workflow failed at step "${step.name}": ${result.error}`,
                output: `Completed: ${completedSteps.join(' -> ')}\nFailed: ${step.name}`,
                type: 'workflow',
              } as CommandResult);
            }

            completedSteps.push(step.name);
          }
        }

        return json({
          success: true,
          output: `Workflow completed: ${completedSteps.join(' -> ')}`,
          type: 'workflow',
        } as CommandResult);
      }
    }
  } catch {
    // Custom command loader not available or failed
  }

  return json({ success: false, error: `Command not found: ${commandId}`, type: 'shell' } as CommandResult, {
    status: 404,
  });
}
