import { randomUUID } from 'node:crypto';
import {
  createTaskEnvelope,
  TaskStateEnum,
  transitionTaskEnvelope,
  type RecoderPayload,
  type TaskArtifact,
  type TaskEnvelope,
} from '@recoder/a2a-sdk';
import { A2ATaskSubscriptionHub } from './task-subscription';
import type { A2AAgentOsProjection } from './agent-os-projection';

export type A2AMessageInput = {
  workspaceId?: string;
  threadId?: string;
  traceId?: string;
  requesterAgentId?: string;
  assigneeAgentId?: string;
  payload: RecoderPayload | RecoderPayload[];
  metadata?: Record<string, unknown>;
};

export type A2AArtifactInput = {
  taskId: string;
  artifact: TaskArtifact;
};

export class A2AMessageHandler {
  private readonly tasks = new Map<string, TaskEnvelope>();

  constructor(
    private readonly subscriptions = new A2ATaskSubscriptionHub(),
    private readonly projection?: A2AAgentOsProjection,
  ) {}

  get subscriptionHub(): A2ATaskSubscriptionHub {
    return this.subscriptions;
  }

  listTasks(): TaskEnvelope[] {
    return [...this.tasks.values()];
  }

  getTask(taskId: string): TaskEnvelope | null {
    return this.tasks.get(taskId) ?? null;
  }

  sendMessage(input: A2AMessageInput): TaskEnvelope {
    const task = createTaskEnvelope({
      id: `task_${randomUUID()}`,
      workspace_id: input.workspaceId ?? 'default',
      thread_id: input.threadId ?? `thread_${randomUUID()}`,
      trace_id: input.traceId ?? `trace_${randomUUID()}`,
      requester: {
        agent_id: input.requesterAgentId ?? 'external-agent',
        platform: 'custom',
      },
      assignee: {
        agent_id: input.assigneeAgentId ?? 'recoder-agent-gateway',
        platform: 'recoder_backend',
      },
      connector: {
        platform: 'recoder_backend',
        protocol: 'a2a',
        connector_id: 'agent-gateway',
        name: 'Recoder Agent Gateway',
      },
      payload: input.payload,
      metadata: {
        ...(input.metadata ?? {}),
        source: 'a2a-message',
      },
    });

    this.tasks.set(task.id, task);
    this.projection?.onTaskCreated(task);
    this.subscriptions.publish(task.id, { type: 'task.updated', task });
    return task;
  }

  startTask(taskId: string): TaskEnvelope {
    const task = this.requireTask(taskId);
    const updated = transitionTaskEnvelope(task, TaskStateEnum.Working, {
      reason: 'Task stream started.',
      triggered_by: 'agent-gateway',
    });
    this.tasks.set(taskId, updated);
    this.projection?.onTaskStateChanged({
      previous: task,
      current: updated,
      reason: 'task_stream_started',
    });
    this.subscriptions.publish(taskId, { type: 'task.updated', task: updated });
    return updated;
  }

  cancelTask(taskId: string): TaskEnvelope {
    const task = this.requireTask(taskId);
    const updated = transitionTaskEnvelope(task, TaskStateEnum.Cancelled, {
      reason: 'Task cancelled through A2A gateway.',
      triggered_by: 'agent-gateway',
    });
    this.tasks.set(taskId, updated);
    this.projection?.onTaskStateChanged({
      previous: task,
      current: updated,
      reason: 'task_cancelled',
    });
    this.subscriptions.publish(taskId, { type: 'task.cancelled', task: updated });
    return updated;
  }

  attachArtifact(input: A2AArtifactInput): TaskEnvelope {
    const task = this.requireTask(input.taskId);
    const artifacts = [...(task.result?.artifacts ?? []), input.artifact];
    const updated: TaskEnvelope = {
      ...task,
      result: {
        ...(task.result ?? {}),
        artifacts,
      },
      updated_at: new Date().toISOString(),
    };
    this.tasks.set(input.taskId, updated);
    this.projection?.onArtifactAttached({
      task: updated,
      artifact: input.artifact,
    });
    this.subscriptions.publish(input.taskId, { type: 'artifact.created', taskId: input.taskId, artifact: input.artifact });
    this.subscriptions.publish(input.taskId, { type: 'task.updated', task: updated });
    return updated;
  }

  private requireTask(taskId: string): TaskEnvelope {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`A2A task not found: ${taskId}`);
    }
    return task;
  }
}
