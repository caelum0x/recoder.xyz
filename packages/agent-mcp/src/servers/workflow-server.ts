import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * `recoder.workflow` — the MCP skin over the Workflow+Hooks engine (RECODER-ENGINES
 * E12). Two tools: `workflow.verify` (run a named verification workflow over a
 * TaskSpec/run → a truthful verdict `{ status, checks[], passed }`) and
 * `workflow.capture_hook` (capture a hook artifact + run a secret-scan →
 * `{ status, findings[] }`).
 *
 * The package stays runtime-agnostic: it owns NO engine logic. The host
 * (docker-backend) injects a concrete `WorkflowPort` built over
 * `@recoder/workflow-engine` (which skins `@recoder/agent-workflows` +
 * `@recoder/agent-hooks`). Every handler degrades truthfully — the engine returns a
 * `not_configured` status (never throws, never fabricates) when no verification
 * runner / hook runner is wired.
 */
export const workflowMcpServer: McpServerRegistration = {
  serverId: 'recoder.workflow',
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: 'custom',
  displayName: 'Recoder Workflow',
  transport: 'http',
  enabled: true,
  toolNames: ['workflow.verify', 'workflow.capture_hook'],
  metadata: { engine: 'workflow' },
};

/**
 * The host-injected workflow engine. Structurally satisfied by
 * `@recoder/workflow-engine`'s `WorkflowEngine`; typed loosely (`unknown` results)
 * so this package needs no dependency on the engine implementation.
 */
export type WorkflowPort = {
  verify(input: {
    workflow?: string;
    taskId?: string;
    runId?: string;
    task?: { taskId?: string; intent?: string } & Record<string, unknown>;
    checks?: Array<{
      name: string;
      kind?: string;
      command?: string;
      config?: Record<string, unknown>;
    }>;
  }): Promise<unknown>;
  captureHook(input: {
    hook?: string;
    content?: string;
    command?: string;
    changedFiles?: string[];
    output?: string;
    exitCode?: number;
    taskId?: string;
    runId?: string;
  }): Promise<unknown>;
};

export function registerWorkflowMcpTools(router: McpToolRouter, port: WorkflowPort): void {
  router.register(workflowMcpServer, 'workflow.verify', async (input) => {
    const result = await port.verify({
      workflow: readString(input.args.workflow),
      taskId: readString(input.args.taskId) ?? input.task?.taskId,
      runId: readString(input.args.runId),
      task: readTask(input.args.task) ?? readTaskFromSpec(input.task),
      checks: readChecks(input.args.checks),
    });
    return { content: result, metadata: { engine: 'workflow' } };
  });

  router.register(workflowMcpServer, 'workflow.capture_hook', async (input) => {
    const result = await port.captureHook({
      hook: readString(input.args.hook),
      content: readString(input.args.content),
      command: readString(input.args.command),
      changedFiles: readStringArray(input.args.changedFiles),
      output: readString(input.args.output),
      exitCode: readNumber(input.args.exitCode),
      taskId: readString(input.args.taskId) ?? input.task?.taskId,
      runId: readString(input.args.runId),
    });
    return { content: result, metadata: { engine: 'workflow' } };
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

type WorkflowCheckArg = {
  name: string;
  kind?: string;
  command?: string;
  config?: Record<string, unknown>;
};

function readChecks(value: unknown): WorkflowCheckArg[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const checks = value
    .map((entry): WorkflowCheckArg | undefined => {
      if (typeof entry !== 'object' || entry === null) return undefined;
      const record = entry as Record<string, unknown>;
      const name = readString(record.name);
      if (!name) return undefined;
      return {
        name,
        kind: readString(record.kind),
        command: readString(record.command),
        config: readRecord(record.config),
      };
    })
    .filter((entry): entry is WorkflowCheckArg => entry !== undefined);
  return checks.length > 0 ? checks : undefined;
}

function readTask(value: unknown):
  | ({ taskId?: string; intent?: string } & Record<string, unknown>)
  | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as { taskId?: string; intent?: string } & Record<string, unknown>;
}

function readTaskFromSpec(task: { taskId?: string; intent?: string } | undefined):
  | ({ taskId?: string; intent?: string } & Record<string, unknown>)
  | undefined {
  if (!task) return undefined;
  return { taskId: task.taskId, intent: task.intent };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
