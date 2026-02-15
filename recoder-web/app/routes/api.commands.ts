/**
 * Commands API - Execute slash commands and workflows
 *
 * Endpoints:
 * - POST /api/commands - Execute a command
 * - GET /api/commands - List available commands (for a project)
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { JsonResponse } from '~/lib/http/json-response';

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

  // Load custom commands from .recoder/commands/ if projectId provided
  if (projectId) {
    try {
      const { loadProjectCommands } = await import('~/lib/.server/commands/loader');
      const customCommands = await loadProjectCommands('/workspace');
      for (const cmd of customCommands) {
        commands.push({
          id: cmd.id,
          type: cmd.action as 'shell' | 'prompt' | 'workflow',
          isBuiltin: false,
        });
      }
    } catch {
      // Custom command loader may not be available in all environments
    }
  }

  return JsonResponse.json({ commands });
}

/**
 * Sanitize shell args to prevent command injection.
 * Rejects characters commonly used for injection (;, |, &, $, `, etc.)
 */
function sanitizeArgs(args: string): string {
  const forbidden = /[;&|`$(){}[\]<>!\n\r\\]/;
  if (forbidden.test(args)) {
    throw new Error('Invalid characters in command arguments');
  }
  return args;
}

/**
 * POST /api/commands - Execute a command
 * SECURITY: Requires authentication
 */
export async function action({ request }: ActionFunctionArgs) {
  // SECURITY: Verify user is authenticated before allowing command execution
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);

  if (!session?.user) {
    return JsonResponse.json(
      { success: false, error: 'Authentication required' } as CommandResult,
      { status: 401 },
    );
  }

  const body = (await request.json()) as ExecuteCommandRequest;
  const { commandId, projectId, args } = body;

  // SECURITY: Validate workingDir to prevent path traversal
  const workingDir = body.workingDir || '/workspace';
  if (!workingDir.startsWith('/workspace') || workingDir.includes('..')) {
    return JsonResponse.json(
      { success: false, error: 'Invalid working directory' } as CommandResult,
      { status: 400 },
    );
  }

  if (!commandId) {
    return JsonResponse.json({ success: false, error: 'Missing commandId' } as CommandResult, { status: 400 });
  }

  // Sanitize args to prevent command injection
  let safeArgs: string | undefined;
  if (args) {
    try {
      safeArgs = sanitizeArgs(args);
    } catch (e) {
      return JsonResponse.json(
        { success: false, error: e instanceof Error ? e.message : 'Invalid arguments', type: 'shell' } as CommandResult,
        { status: 400 },
      );
    }
  }

  // Check if it's a built-in command
  const builtinCmd = BUILTIN_COMMANDS[commandId];

  if (builtinCmd) {
    if (builtinCmd.type === 'shell' && builtinCmd.shell) {
      // Execute shell command
      let shellCommand = builtinCmd.shell;

      // Append sanitized args if provided
      if (safeArgs) {
        shellCommand = `${shellCommand} ${safeArgs}`;
      }

      try {
        const { executeShellCommand } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await executeShellCommand(shellCommand, workingDir);

        return JsonResponse.json({
          success: result.success,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          type: 'shell',
        } as CommandResult);
      } catch (error) {
        return JsonResponse.json(
          {
            success: false,
            error: 'Shell execution failed',
            type: 'shell',
          } as CommandResult,
          { status: 500 }
        );
      }
    }

    if (builtinCmd.type === 'prompt' && builtinCmd.prompt) {
      // Return prompt to be sent to AI
      let prompt = builtinCmd.prompt;

      // Replace {args} placeholder (safe - prompt goes to AI, not shell)
      if (safeArgs) {
        prompt = prompt.replace('{args}', safeArgs);
      }

      return JsonResponse.json({
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
        if (safeArgs) {
          shellCommand = `${shellCommand} ${safeArgs}`;
        }

        const { executeShellCommand } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await executeShellCommand(shellCommand, workingDir);

        return JsonResponse.json({
          success: result.success,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          type: 'shell',
        } as CommandResult);
      }

      if (customCmd.action === 'prompt' && customCmd.prompt) {
        let prompt = customCmd.prompt;
        if (safeArgs) {
          prompt = prompt.replace('{args}', safeArgs);
        }

        return JsonResponse.json({
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
              return JsonResponse.json({
                success: false,
                error: `Workflow failed at step "${step.name}": ${result.error}`,
                output: `Completed: ${completedSteps.join(' -> ')}\nFailed: ${step.name}`,
                type: 'workflow',
              } as CommandResult);
            }

            completedSteps.push(step.name);
          }
        }

        return JsonResponse.json({
          success: true,
          output: `Workflow completed: ${completedSteps.join(' -> ')}`,
          type: 'workflow',
        } as CommandResult);
      }
    }
  } catch {
    // Custom command loader not available or failed
  }

  return JsonResponse.json({ success: false, error: `Command not found: ${commandId}`, type: 'shell' } as CommandResult, {
    status: 404,
  });
}
