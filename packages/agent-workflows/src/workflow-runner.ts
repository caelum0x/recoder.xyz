import type {
  Approval,
  Artifact,
  InstructionBundle,
  MemoryCandidate,
  RunEvent,
  RuntimeAdapterPort,
  RuntimeTaskRequest,
  TaskSpec,
} from '@recoder/agent-os';
import { validateWorkflowDefinition, type WorkflowDefinition, type WorkflowNode } from './workflow-definition';

export type WorkflowRunStatus = 'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type WorkflowNodeStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';

export type WorkflowNodeExecution = {
  nodeId: string;
  kind: WorkflowNode['kind'];
  status: WorkflowNodeStatus;
  startedAt: string;
  completedAt?: string;
  output?: Record<string, unknown>;
  error?: string;
};

export type WorkflowRun = {
  workflowRunId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  taskId?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  artifacts?: Artifact[];
  approvals?: Approval[];
  memoryCandidates?: MemoryCandidate[];
  runEvents?: RunEvent[];
  nodeExecutions?: WorkflowNodeExecution[];
};

export type WorkflowSignal =
  | { type: 'approval_decision'; approvalId: string; approved: boolean; reason?: string }
  | { type: 'input'; nodeId: string; data: Record<string, unknown> }
  | { type: 'cancel'; reason?: string };

export interface WorkflowDriver {
  start(definition: WorkflowDefinition): Promise<WorkflowRun>;
  signal(runId: string, signal: WorkflowSignal): Promise<void>;
  cancel(runId: string): Promise<void>;
}

export type WorkflowNodeHandlerResult = {
  status?: WorkflowNodeStatus;
  output?: Record<string, unknown>;
  error?: string;
  artifacts?: Artifact[];
  approvals?: Approval[];
  memoryCandidates?: MemoryCandidate[];
  runEvents?: RunEvent[];
};

export type WorkflowExecutionContext = {
  workflowRunId: string;
  definition: WorkflowDefinition;
  task?: TaskSpec;
  bundle?: InstructionBundle;
  policy: RuntimeTaskRequest['policy'];
  getNodeExecution(nodeId: string): WorkflowNodeExecution | undefined;
};

export type AgentOsWorkflowRunnerPorts = {
  now?: () => string;
  createRunId?: (definition: WorkflowDefinition) => string;
  resolveRuntime?: (node: WorkflowNode, context: WorkflowExecutionContext) => RuntimeAdapterPort | Promise<RuntimeAdapterPort | undefined>;
  executeTool?: (node: WorkflowNode, context: WorkflowExecutionContext) => Promise<WorkflowNodeHandlerResult>;
  requestApproval?: (node: WorkflowNode, context: WorkflowExecutionContext) => Promise<WorkflowNodeHandlerResult>;
  runVerification?: (node: WorkflowNode, context: WorkflowExecutionContext) => Promise<WorkflowNodeHandlerResult>;
  openPullRequest?: (node: WorkflowNode, context: WorkflowExecutionContext) => Promise<WorkflowNodeHandlerResult>;
  runDeploy?: (node: WorkflowNode, context: WorkflowExecutionContext) => Promise<WorkflowNodeHandlerResult>;
  executeNode?: (node: WorkflowNode, context: WorkflowExecutionContext) => Promise<WorkflowNodeHandlerResult>;
};

export type RunWorkflowInput = {
  definition: WorkflowDefinition;
  task?: TaskSpec;
  bundle?: InstructionBundle;
  policy?: RuntimeTaskRequest['policy'];
};

const DEFAULT_RUNTIME_POLICY: RuntimeTaskRequest['policy'] = {
  requireSignedEnvelope: true,
  enforceWorkLocks: true,
  allowNetwork: false,
  allowShell: false,
  approvalMode: 'manual',
};

export class AgentOsWorkflowRunner {
  constructor(private readonly ports: AgentOsWorkflowRunnerPorts = {}) {}

  async run(input: RunWorkflowInput): Promise<WorkflowRun> {
    const now = this.now();
    const workflowRunId = this.ports.createRunId?.(input.definition)
      ?? `workflow_run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const run: WorkflowRun = {
      workflowRunId,
      workflowId: input.definition.workflowId,
      status: 'running',
      taskId: input.task?.taskId,
      startedAt: now,
      updatedAt: now,
      artifacts: [],
      approvals: [],
      memoryCandidates: [],
      runEvents: [],
      nodeExecutions: [],
    };
    const validationErrors = validateWorkflowDefinition(input.definition);

    if (validationErrors.length > 0) {
      return this.failRun(run, validationErrors.join('; '));
    }

    let orderedNodes: WorkflowNode[];
    try {
      orderedNodes = orderWorkflowNodes(input.definition);
    } catch (error) {
      return this.failRun(run, error instanceof Error ? error.message : String(error));
    }

    const context = this.createContext(input, workflowRunId, run.nodeExecutions ?? []);

    for (const node of orderedNodes) {
      if (hasFailedDependency(node, run.nodeExecutions ?? [])) {
        run.nodeExecutions?.push(createNodeExecution(node, 'skipped', this.now(), {
          error: 'Skipped because a dependency failed.',
        }));
        continue;
      }

      if (hasWaitingDependency(node, run.nodeExecutions ?? [])) {
        run.status = 'waiting';
        run.updatedAt = this.now();
        return run;
      }

      const execution = createNodeExecution(node, 'running', this.now());
      run.nodeExecutions?.push(execution);

      try {
        const result = await this.executeNode(node, context);
        const completed = completeNodeExecution(
          execution,
          result.status ?? 'completed',
          this.now(),
          result.output,
          result.error,
        );
        replaceNodeExecution(run.nodeExecutions ?? [], completed);
        appendNodeResult(run, result);

        if (completed.status === 'waiting') {
          run.status = 'waiting';
          run.updatedAt = completed.completedAt ?? this.now();
          return run;
        }

        if (completed.status === 'failed') {
          return this.failRun(run, completed.error ?? `Workflow node failed: ${node.nodeId}`);
        }
      } catch (error) {
        const failed = completeNodeExecution(
          execution,
          'failed',
          this.now(),
          undefined,
          error instanceof Error ? error.message : String(error),
        );
        replaceNodeExecution(run.nodeExecutions ?? [], failed);
        return this.failRun(run, failed.error ?? `Workflow node failed: ${node.nodeId}`);
      }
    }

    const completedAt = this.now();
    return {
      ...run,
      status: 'completed',
      updatedAt: completedAt,
      completedAt,
    };
  }

  private async executeNode(node: WorkflowNode, context: WorkflowExecutionContext): Promise<WorkflowNodeHandlerResult> {
    if (this.ports.executeNode) {
      return this.ports.executeNode(node, context);
    }

    if (node.kind === 'agent') {
      return this.executeAgentNode(node, context);
    }

    if (node.kind === 'approval') {
      return this.ports.requestApproval
        ? this.ports.requestApproval(node, context)
        : {
          status: 'waiting',
          output: {
            reason: 'Approval node is waiting for an approval handler or external signal.',
          },
        };
    }

    if (node.kind === 'tool') {
      if (!this.ports.executeTool) {
        throw new Error(`No tool handler configured for workflow node ${node.nodeId}.`);
      }
      return this.ports.executeTool(node, context);
    }

    if (node.kind === 'verification') {
      if (!this.ports.runVerification) {
        throw new Error(`No verification handler configured for workflow node ${node.nodeId}.`);
      }
      return this.ports.runVerification(node, context);
    }

    // Approval-wait is the explicit human gate in `verify -> approve -> pr -> deploy`.
    // When a handler is supplied it may resolve the gate; otherwise the node parks the
    // run in `waiting` until an external `approval_decision` signal arrives. This is
    // never a hard failure — an unresolved gate is a legitimate paused state.
    if (node.kind === 'approval-wait') {
      return this.ports.requestApproval
        ? this.ports.requestApproval(node, context)
        : {
          status: 'waiting',
          output: {
            reason: 'Approval-wait node is parked until an approval decision arrives.',
          },
        };
    }

    if (node.kind === 'pull-request') {
      if (!this.ports.openPullRequest) {
        throw new Error(`No pull-request handler configured for workflow node ${node.nodeId}.`);
      }
      return this.ports.openPullRequest(node, context);
    }

    if (node.kind === 'deploy') {
      if (!this.ports.runDeploy) {
        throw new Error(`No deploy handler configured for workflow node ${node.nodeId}.`);
      }
      return this.ports.runDeploy(node, context);
    }

    throw new Error(`No handler configured for workflow node kind ${node.kind}.`);
  }

  private async executeAgentNode(node: WorkflowNode, context: WorkflowExecutionContext): Promise<WorkflowNodeHandlerResult> {
    if (!context.task || !context.bundle) {
      throw new Error(`Agent node ${node.nodeId} requires TaskSpec and InstructionBundle.`);
    }

    const runtime = await this.ports.resolveRuntime?.(node, context);
    if (!runtime) {
      throw new Error(`Agent node ${node.nodeId} has no runtime adapter.`);
    }

    const runEvents: RunEvent[] = [];
    for await (const event of runtime.sendTask({
      task: context.task,
      bundle: context.bundle,
      policy: context.policy,
    })) {
      runEvents.push(event);
      if (event.type === 'failed') {
        return {
          status: 'failed',
          runEvents,
          error: event.message,
          output: {
            eventId: event.eventId,
            message: event.message,
          },
        };
      }
      if (event.type === 'needs_input' || event.type === 'approval_requested') {
        return {
          status: 'waiting',
          runEvents,
          output: {
            eventId: event.eventId,
            message: event.message,
          },
        };
      }
    }

    return {
      status: 'completed',
      runEvents,
    };
  }

  private createContext(
    input: RunWorkflowInput,
    workflowRunId: string,
    nodeExecutions: WorkflowNodeExecution[],
  ): WorkflowExecutionContext {
    return {
      workflowRunId,
      definition: input.definition,
      task: input.task,
      bundle: input.bundle,
      policy: input.policy ?? DEFAULT_RUNTIME_POLICY,
      getNodeExecution(nodeId) {
        return nodeExecutions.find((execution) => execution.nodeId === nodeId);
      },
    };
  }

  private failRun(run: WorkflowRun, error: string): WorkflowRun {
    const failedAt = this.now();
    return {
      ...run,
      status: 'failed',
      updatedAt: failedAt,
      completedAt: failedAt,
      nodeExecutions: [
        ...(run.nodeExecutions ?? []),
        {
          nodeId: '__workflow__',
          kind: 'condition',
          status: 'failed',
          startedAt: failedAt,
          completedAt: failedAt,
          error,
        },
      ],
    };
  }

  private now(): string {
    return this.ports.now?.() ?? new Date().toISOString();
  }
}

function orderWorkflowNodes(definition: WorkflowDefinition): WorkflowNode[] {
  const byId = new Map(definition.nodes.map((node) => [node.nodeId, node]));
  const ordered: WorkflowNode[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(node: WorkflowNode): void {
    if (visited.has(node.nodeId)) {
      return;
    }
    if (visiting.has(node.nodeId)) {
      throw new Error(`Workflow contains a dependency cycle at ${node.nodeId}.`);
    }

    visiting.add(node.nodeId);
    for (const dependencyId of node.dependsOn ?? []) {
      const dependency = byId.get(dependencyId);
      if (dependency) {
        visit(dependency);
      }
    }
    visiting.delete(node.nodeId);
    visited.add(node.nodeId);
    ordered.push(node);
  }

  for (const node of definition.nodes) {
    visit(node);
  }

  return ordered;
}

function hasFailedDependency(node: WorkflowNode, executions: WorkflowNodeExecution[]): boolean {
  return (node.dependsOn ?? []).some((dependencyId) =>
    executions.find((execution) => execution.nodeId === dependencyId)?.status === 'failed',
  );
}

function hasWaitingDependency(node: WorkflowNode, executions: WorkflowNodeExecution[]): boolean {
  return (node.dependsOn ?? []).some((dependencyId) =>
    executions.find((execution) => execution.nodeId === dependencyId)?.status === 'waiting',
  );
}

function createNodeExecution(
  node: WorkflowNode,
  status: WorkflowNodeStatus,
  now: string,
  options: { output?: Record<string, unknown>; error?: string } = {},
): WorkflowNodeExecution {
  return {
    nodeId: node.nodeId,
    kind: node.kind,
    status,
    startedAt: now,
    completedAt: status === 'running' || status === 'pending' ? undefined : now,
    output: options.output,
    error: options.error,
  };
}

function completeNodeExecution(
  execution: WorkflowNodeExecution,
  status: WorkflowNodeStatus,
  now: string,
  output?: Record<string, unknown>,
  error?: string,
): WorkflowNodeExecution {
  return {
    ...execution,
    status,
    completedAt: now,
    output,
    error,
  };
}

function replaceNodeExecution(executions: WorkflowNodeExecution[], execution: WorkflowNodeExecution): void {
  const index = executions.findIndex((item) => item.nodeId === execution.nodeId);
  if (index >= 0) {
    executions[index] = execution;
    return;
  }
  executions.push(execution);
}

function appendNodeResult(run: WorkflowRun, result: WorkflowNodeHandlerResult): void {
  if (result.artifacts?.length) {
    run.artifacts?.push(...result.artifacts);
  }
  if (result.approvals?.length) {
    run.approvals?.push(...result.approvals);
  }
  if (result.memoryCandidates?.length) {
    run.memoryCandidates?.push(...result.memoryCandidates);
  }
  if (result.runEvents?.length) {
    run.runEvents?.push(...result.runEvents);
  }
}
