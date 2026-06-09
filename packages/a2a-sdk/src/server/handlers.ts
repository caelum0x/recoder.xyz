import type { AgentCard } from '../schemas/agent-card';
import type { TaskEnvelope } from '../schemas/task-envelope';

export type A2AServerHandlers = {
  agentCard(): Promise<AgentCard> | AgentCard;
  listTasks(): Promise<TaskEnvelope[]> | TaskEnvelope[];
  getTask(taskId: string): Promise<TaskEnvelope | null> | TaskEnvelope | null;
  sendMessage(envelope: TaskEnvelope): Promise<TaskEnvelope> | TaskEnvelope;
  cancelTask(taskId: string): Promise<TaskEnvelope | null> | TaskEnvelope | null;
};
