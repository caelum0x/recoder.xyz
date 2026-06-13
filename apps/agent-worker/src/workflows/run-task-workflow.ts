import type {
  Approval,
  Artifact,
  RuntimeAdapterPort,
  RuntimeTaskRequest,
} from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import { collectRuntimeEvents } from '@recoder/agent-runtimes';
import type { AgentRuntimeAdapter } from '@recoder/agent-runtimes';
import {
  AgentOsWorkflowRunner,
  type AgentOsWorkflowRunnerPorts,
  type RunWorkflowInput,
  type WorkflowExecutionContext,
  type WorkflowNode,
  type WorkflowNodeHandlerResult,
  type WorkflowRun,
} from '@recoder/agent-workflows';

export async function runTaskWorkflow(adapter: AgentRuntimeAdapter, input: RuntimeTaskInput) {
  return collectRuntimeEvents(adapter.sendTask(input));
}

export type AgentWorkerWorkflowPorts = AgentOsWorkflowRunnerPorts & {
  runtimes?: Record<string, RuntimeAdapterPort>;
};

export async function runAgentOsWorkflow(
  input: RunWorkflowInput,
  ports: AgentWorkerWorkflowPorts = {},
): Promise<WorkflowRun> {
  const runner = new AgentOsWorkflowRunner({
    ...ports,
    resolveRuntime: ports.resolveRuntime ?? createRuntimeResolver(ports.runtimes ?? {}),
    requestApproval: ports.requestApproval ?? requestApprovalNode,
    executeTool: ports.executeTool ?? waitForExternalToolHandler,
    runVerification: ports.runVerification ?? waitForExternalVerificationHandler,
  });

  return runner.run(input);
}

function createRuntimeResolver(
  runtimes: Record<string, RuntimeAdapterPort>,
): NonNullable<AgentOsWorkflowRunnerPorts['resolveRuntime']> {
  return async (node) => {
    const runtimeId = readString(node.config['runtimeId'])
      ?? readString(node.config['adapterId'])
      ?? readString(node.config['agentId'])
      ?? readString(node.config['kind']);
    return runtimeId ? runtimes[runtimeId] : undefined;
  };
}

async function requestApprovalNode(
  node: WorkflowNode,
  context: WorkflowExecutionContext,
): Promise<WorkflowNodeHandlerResult> {
  const now = new Date().toISOString();
  const taskId = context.task?.['taskId'] ?? readString(node.config['taskId']) ?? 'task_unknown';
  const approval: Approval = {
    approvalId: readString(node.config['approvalId']) ?? `approval_${context.workflowRunId}_${node.nodeId}`,
    taskId,
    runId: context.workflowRunId,
    status: 'pending',
    reason: readString(node.config['reason']) ?? node.label,
    requestedBy: readString(node.config['requestedBy']) ?? 'agent-worker',
    requestedAt: now,
    requiredAt: readApprovalRequiredAt(node.config['requiredAt']),
    target: readApprovalTarget(node.config['target']),
    metadata: {
      workflowId: context.definition.workflowId,
      nodeId: node.nodeId,
    },
  };

  return {
    status: 'waiting',
    approvals: [approval],
    output: {
      approvalId: approval.approvalId,
      reason: approval.reason,
    },
  };
}

async function waitForExternalToolHandler(
  node: WorkflowNode,
  context: WorkflowExecutionContext,
): Promise<WorkflowNodeHandlerResult> {
  return {
    status: 'waiting',
    artifacts: [createWorkerArtifact(node, context, 'custom', {
      reason: 'Tool node requires an external MCP/tool handler.',
      nodeConfig: node.config,
    })],
    output: {
      reason: 'Tool node requires an external MCP/tool handler.',
      nodeId: node.nodeId,
    },
  };
}

async function waitForExternalVerificationHandler(
  node: WorkflowNode,
  context: WorkflowExecutionContext,
): Promise<WorkflowNodeHandlerResult> {
  return {
    status: 'waiting',
    artifacts: [createWorkerArtifact(node, context, 'verification', {
      reason: 'Verification node requires an external verification handler.',
      verificationCommands: context.bundle?.verificationCommands ?? context.task?.verification.commands ?? [],
      nodeConfig: node.config,
    })],
    output: {
      reason: 'Verification node requires an external verification handler.',
      nodeId: node.nodeId,
    },
  };
}

function createWorkerArtifact(
  node: WorkflowNode,
  context: WorkflowExecutionContext,
  kind: Artifact['kind'],
  content: Record<string, unknown>,
): Artifact {
  const now = new Date().toISOString();
  const taskId = context.task?.['taskId'] ?? readString(node.config['taskId']) ?? 'task_unknown';

  return {
    artifactId: `artifact_${context.workflowRunId}_${node.nodeId}`,
    taskId,
    runId: context.workflowRunId,
    kind,
    mimeType: 'application/json',
    content: JSON.stringify({
      workflowId: context.definition.workflowId,
      nodeId: node.nodeId,
      ...content,
    }, null, 2),
    public: false,
    createdAt: now,
    createdBy: 'agent-worker',
    provenance: {
      sourceTaskId: taskId,
      sourceRunId: context.workflowRunId,
    },
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readApprovalRequiredAt(value: unknown): Approval['requiredAt'] {
  const candidate = readString(value);
  if (
    candidate === 'before_execution'
    || candidate === 'before_write'
    || candidate === 'before_push'
    || candidate === 'before_pr'
    || candidate === 'before_sensitive_action'
    || candidate === 'after_verification'
    || candidate === 'custom'
  ) {
    return candidate;
  }
  return 'before_sensitive_action';
}

function readApprovalTarget(value: unknown): Approval['target'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    path: readString(value['path']),
    command: readString(value['command']),
    toolName: readString(value['toolName']),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type { RunWorkflowInput, RuntimeTaskRequest, WorkflowRun };
