/**
 * Execute Action
 * Handles execution of action nodes based on their provider
 */

import {
  type QueuedGeneration,
  type GenerationOutput,
  type GenerationContext,
  type NodeId,
  type OutputId,
  type ActionConfiguredState,
  type ExecutionContext,
  type OperationNode,
  isActionNode,
  ActionExecutionError,
} from './types';
import {
  useGenerationExecutor,
  type AppEntryResolver,
  type GenerationMetadata,
} from './generation-executor';

// ============================================================================
// Action Registry
// ============================================================================

/** Registry of action handlers by provider */
const actionHandlers = new Map<string, ActionHandler>();

/** Action handler interface */
export interface ActionHandler {
  /** Unique identifier for the action */
  id: string;
  /** Display name */
  name: string;
  /** Provider (shell, file, docker, etc.) */
  provider: string;
  /** Schema for the action payload */
  payloadSchema?: Record<string, unknown>;
  /** Execute the action */
  execute: (params: ActionExecuteParams) => Promise<unknown>;
}

/** Parameters for action execution */
export interface ActionExecuteParams {
  inputs: Record<string, string>;
  state: ActionConfiguredState;
  context: ExecutionContext;
  generationContext: GenerationContext;
}

/**
 * Register an action handler
 */
export function registerAction(handler: ActionHandler): void {
  const key = `${handler.provider}.${handler.id}`;
  actionHandlers.set(key, handler);
}

/**
 * Get a registered action handler
 */
export function getAction(provider: string, id: string): ActionHandler | undefined {
  return actionHandlers.get(`${provider}.${id}`);
}

/**
 * Get all registered actions
 */
export function getAllActions(): ActionHandler[] {
  return Array.from(actionHandlers.values());
}

/**
 * Get actions by provider
 */
export function getActionsByProvider(provider: string): ActionHandler[] {
  return getAllActions().filter(a => a.provider === provider);
}

// ============================================================================
// Main Execution Function
// ============================================================================

/**
 * Execute an action generation
 */
export function executeAction(args: {
  context: ExecutionContext;
  generation: QueuedGeneration;
  metadata?: GenerationMetadata;
}) {
  return useGenerationExecutor({
    context: args.context,
    generation: args.generation,
    metadata: args.metadata,
    execute: async ({
      generationContext,
      generationContentResolver,
      appEntryResolver,
      finishGeneration,
    }) => {
      const operationNode = generationContext.operationNode;
      if (!isActionNode(operationNode)) {
        throw new ActionExecutionError('Invalid generation type', 'INVALID_NODE_TYPE');
      }

      const command = operationNode.content.command;
      if (command.state.status !== 'configured') {
        throw new ActionExecutionError('Action is not configured', 'NOT_CONFIGURED');
      }

      let generationOutputs: GenerationOutput[];

      // Execute based on provider
      switch (command.provider) {
        case 'shell':
          generationOutputs = await executeShellAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        case 'file':
          generationOutputs = await executeFileAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        case 'docker':
          generationOutputs = await executeDockerAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        case 'api':
          generationOutputs = await executeApiAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        case 'github':
          generationOutputs = await executeGitHubAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        case 'database':
          generationOutputs = await executeDatabaseAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        case 'custom':
          generationOutputs = await executeCustomAction({
            state: command.state,
            context: args.context,
            generationContext,
            generationContentResolver,
            appEntryResolver,
          });
          break;

        default:
          throw new ActionExecutionError(
            `Unhandled provider: ${(command as any).provider}`,
            'UNKNOWN_PROVIDER'
          );
      }

      await finishGeneration({
        inputMessages: [],
        outputs: generationOutputs,
      });
    },
  });
}

// ============================================================================
// Input Resolution
// ============================================================================

/**
 * Resolve action inputs from connected nodes
 */
async function resolveActionInputs(args: {
  state: ActionConfiguredState;
  generationContext: GenerationContext;
  generationContentResolver: (nodeId: NodeId, outputId: OutputId) => Promise<string | undefined>;
  appEntryResolver: AppEntryResolver;
}): Promise<Record<string, string>> {
  const inputs: Record<string, string> = {};
  const { generationContext, state } = args;

  // Get expected input keys from payload
  const payloadKeys = Object.keys(state.payload || {});

  for (const payloadKey of payloadKeys) {
    const input = generationContext.operationNode.inputs.find(
      (input) => input.accessor === payloadKey
    );

    const connection = generationContext.connections.find(
      (connection) => connection.inputId === input?.id
    );

    const sourceNode = generationContext.sourceNodes.find(
      (sourceNode) => sourceNode.id === connection?.outputNode.id
    );

    if (!connection || !sourceNode) {
      // Use payload value if no connection
      const payloadValue = state.payload[payloadKey];
      if (payloadValue !== undefined) {
        inputs[payloadKey] = String(payloadValue);
      }
      continue;
    }

    // Resolve from source node based on type
    if (sourceNode.type === 'operation') {
      const content = await args.generationContentResolver(
        connection.outputNode.id as NodeId,
        connection.outputId as OutputId
      );
      if (content) {
        inputs[payloadKey] = content;
      }
    } else if (sourceNode.type === 'variable') {
      if (sourceNode.content.type === 'text') {
        inputs[payloadKey] = (sourceNode.content as any).text || '';
      } else if (sourceNode.content.type === 'file') {
        inputs[payloadKey] = (sourceNode.content as any).content || '';
      }
    } else {
      // Try to get from payload
      const fallbackValue = state.payload[payloadKey];
      if (fallbackValue !== undefined) {
        inputs[payloadKey] = String(fallbackValue);
      }
    }
  }

  return inputs;
}

/**
 * Create an action output from a result
 */
function createActionOutput(
  result: unknown,
  generationContext: GenerationContext
): GenerationOutput[] {
  const resultOutput = generationContext.operationNode.outputs.find(
    (output) => output.accessor === 'action-result'
  );

  if (!resultOutput) {
    return [];
  }

  return [
    {
      type: 'action-result',
      content: result,
      outputId: resultOutput.id,
    },
  ];
}

// ============================================================================
// Provider-Specific Executors
// ============================================================================

interface ActionExecutorArgs {
  state: ActionConfiguredState;
  context: ExecutionContext;
  generationContext: GenerationContext;
  generationContentResolver: (nodeId: NodeId, outputId: OutputId) => Promise<string | undefined>;
  appEntryResolver: AppEntryResolver;
}

/**
 * Execute a shell action
 */
async function executeShellAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  const command = inputs.command || args.state.payload.command as string;
  const workDir = inputs.workDir || args.context.workDir;

  // Execute shell command via fetch to backend
  try {
    const response = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        cwd: workDir,
        projectId: args.context.projectId,
      }),
    });

    if (!response.ok) {
      throw new ActionExecutionError(
        `Shell command failed: ${response.statusText}`,
        'SHELL_ERROR'
      );
    }

    const result = await response.json();
    return createActionOutput(result, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'Shell execution failed',
      'SHELL_ERROR',
      error
    );
  }
}

/**
 * Execute a file action
 */
async function executeFileAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  const action = args.state.commandId;
  const path = inputs.path || args.state.payload.path as string;
  const content = inputs.content || args.state.payload.content as string;

  try {
    let result: unknown;

    switch (action) {
      case 'file.read':
        const readResponse = await fetch(`/api/files?path=${encodeURIComponent(path)}&projectId=${args.context.projectId}`);
        result = await readResponse.json();
        break;

      case 'file.write':
        const writeResponse = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            content,
            projectId: args.context.projectId,
          }),
        });
        result = await writeResponse.json();
        break;

      case 'file.delete':
        const deleteResponse = await fetch('/api/files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            projectId: args.context.projectId,
          }),
        });
        result = await deleteResponse.json();
        break;

      case 'file.rename':
        const newPath = inputs.newPath || args.state.payload.newPath as string;
        const renameResponse = await fetch('/api/files/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldPath: path,
            newPath,
            projectId: args.context.projectId,
          }),
        });
        result = await renameResponse.json();
        break;

      default:
        throw new ActionExecutionError(`Unknown file action: ${action}`, 'UNKNOWN_ACTION');
    }

    return createActionOutput(result, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'File operation failed',
      'FILE_ERROR',
      error
    );
  }
}

/**
 * Execute a Docker action
 */
async function executeDockerAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  const action = args.state.commandId;

  try {
    let result: unknown;
    const baseUrl = process.env.DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';

    switch (action) {
      case 'docker.exec':
        const execResponse = await fetch(`${baseUrl}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: inputs.command,
            workDir: args.context.workDir,
          }),
        });
        result = await execResponse.json();
        break;

      case 'docker.build':
        const buildResponse = await fetch(`${baseUrl}/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dockerfile: inputs.dockerfile,
            context: inputs.context || args.context.workDir,
            tag: inputs.tag,
          }),
        });
        result = await buildResponse.json();
        break;

      case 'docker.run':
        const runResponse = await fetch(`${baseUrl}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: inputs.image,
            command: inputs.command,
            volumes: inputs.volumes ? JSON.parse(inputs.volumes) : undefined,
            env: inputs.env ? JSON.parse(inputs.env) : undefined,
          }),
        });
        result = await runResponse.json();
        break;

      default:
        throw new ActionExecutionError(`Unknown docker action: ${action}`, 'UNKNOWN_ACTION');
    }

    return createActionOutput(result, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'Docker operation failed',
      'DOCKER_ERROR',
      error
    );
  }
}

/**
 * Execute an API action
 */
async function executeApiAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  try {
    const url = inputs.url || args.state.payload.url as string;
    const method = (inputs.method || args.state.payload.method as string || 'GET').toUpperCase();
    const headers: Record<string, string> = inputs.headers
      ? JSON.parse(inputs.headers)
      : (args.state.payload.headers as Record<string, string>) || {};
    const body = inputs.body || args.state.payload.body;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (method !== 'GET' && method !== 'HEAD' && body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    let result: unknown;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      result = await response.json();
    } else {
      result = await response.text();
    }

    // Extract headers safely
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return createActionOutput({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: result,
    }, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'API request failed',
      'API_ERROR',
      error
    );
  }
}

/**
 * Execute a GitHub action
 */
async function executeGitHubAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  const action = args.state.commandId;

  try {
    // GitHub actions are proxied through our API to handle auth
    const response = await fetch('/api/github/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        inputs,
        projectId: args.context.projectId,
      }),
    });

    if (!response.ok) {
      throw new ActionExecutionError(
        `GitHub action failed: ${response.statusText}`,
        'GITHUB_ERROR'
      );
    }

    const result = await response.json();
    return createActionOutput(result, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'GitHub action failed',
      'GITHUB_ERROR',
      error
    );
  }
}

/**
 * Execute a database action
 */
async function executeDatabaseAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  const action = args.state.commandId;

  try {
    const response = await fetch('/api/database/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        inputs,
        projectId: args.context.projectId,
      }),
    });

    if (!response.ok) {
      throw new ActionExecutionError(
        `Database action failed: ${response.statusText}`,
        'DATABASE_ERROR'
      );
    }

    const result = await response.json();
    return createActionOutput(result, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'Database action failed',
      'DATABASE_ERROR',
      error
    );
  }
}

/**
 * Execute a custom action
 */
async function executeCustomAction(args: ActionExecutorArgs): Promise<GenerationOutput[]> {
  const inputs = await resolveActionInputs({
    state: args.state,
    generationContext: args.generationContext,
    generationContentResolver: args.generationContentResolver,
    appEntryResolver: args.appEntryResolver,
  });

  const handlerKey = args.state.commandId;
  const handler = actionHandlers.get(handlerKey);

  if (!handler) {
    throw new ActionExecutionError(
      `Custom action handler not found: ${handlerKey}`,
      'HANDLER_NOT_FOUND'
    );
  }

  try {
    const result = await handler.execute({
      inputs,
      state: args.state,
      context: args.context,
      generationContext: args.generationContext,
    });

    return createActionOutput(result, args.generationContext);
  } catch (error) {
    throw new ActionExecutionError(
      error instanceof Error ? error.message : 'Custom action failed',
      'CUSTOM_ERROR',
      error
    );
  }
}

// ============================================================================
// Built-in Actions Registration
// ============================================================================

// Register built-in shell actions
registerAction({
  id: 'run',
  name: 'Run Command',
  provider: 'shell',
  payloadSchema: {
    command: { type: 'string', required: true },
    workDir: { type: 'string', required: false },
  },
  execute: async ({ inputs, context }) => {
    const response = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: inputs.command,
        cwd: inputs.workDir || context.workDir,
        projectId: context.projectId,
      }),
    });
    return response.json();
  },
});

// Register built-in file actions
registerAction({
  id: 'read',
  name: 'Read File',
  provider: 'file',
  payloadSchema: {
    path: { type: 'string', required: true },
  },
  execute: async ({ inputs, context }) => {
    const response = await fetch(
      `/api/files?path=${encodeURIComponent(inputs.path)}&projectId=${context.projectId}`
    );
    return response.json();
  },
});

registerAction({
  id: 'write',
  name: 'Write File',
  provider: 'file',
  payloadSchema: {
    path: { type: 'string', required: true },
    content: { type: 'string', required: true },
  },
  execute: async ({ inputs, context }) => {
    const response = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: inputs.path,
        content: inputs.content,
        projectId: context.projectId,
      }),
    });
    return response.json();
  },
});

registerAction({
  id: 'delete',
  name: 'Delete File',
  provider: 'file',
  payloadSchema: {
    path: { type: 'string', required: true },
  },
  execute: async ({ inputs, context }) => {
    const response = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: inputs.path,
        projectId: context.projectId,
      }),
    });
    return response.json();
  },
});
