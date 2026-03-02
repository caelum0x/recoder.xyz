import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  agentTeamWorkspaceId,
  agentTeamAgents,
  agentTeamTasks,
  addAgentTeamMessage,
  updateAgentStatus,
  type AgentTeamAgent,
  type AgentTeamTask,
} from '~/lib/stores/agent-team';

/**
 * SSE hook for real-time agent team updates.
 * Connects to workspace-scoped event stream.
 */
export function useAgentTeamSSE() {
  const wsId = useStore(agentTeamWorkspaceId);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!wsId) return;

    // Close existing connection
    eventSourceRef.current?.close();

    const url = `/api/a2a/events/stream?types=task.started,task.completed,task.failed,message.new,agent.online,agent.offline`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.addEventListener('task.started', (event) => {
      try {
        const data = JSON.parse(event.data);
        const agentId = data.data?.assignee_agent_id;
        if (agentId) {
          updateAgentStatus(agentId, 'working');
        }

        const tasks = agentTeamTasks.get();
        const newTask: AgentTeamTask = {
          taskId: data.data?.task?.id ?? data.taskId ?? '',
          prompt: data.data?.task?.prompt ?? '',
          agentId: agentId ?? '',
          status: 'working',
          createdAt: data.timestamp ?? new Date().toISOString(),
        };
        agentTeamTasks.set([newTask, ...tasks.slice(0, 9)]);
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('task.completed', (event) => {
      try {
        const data = JSON.parse(event.data);
        const agentId = data.data?.assignee_agent_id;
        if (agentId) {
          updateAgentStatus(agentId, 'idle');
        }

        const tasks = agentTeamTasks.get();
        const taskId = data.data?.task?.id ?? data.taskId;
        agentTeamTasks.set(
          tasks.map((t) => (t.taskId === taskId ? { ...t, status: 'completed' } : t)),
        );
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('task.failed', (event) => {
      try {
        const data = JSON.parse(event.data);
        const agentId = data.data?.assignee_agent_id;
        if (agentId) {
          updateAgentStatus(agentId, 'error');
        }
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('message.new', (event) => {
      try {
        const data = JSON.parse(event.data);
        addAgentTeamMessage({
          id: data.id ?? String(Date.now()),
          senderId: data.data?.senderId ?? '',
          senderName: data.data?.senderName ?? 'Agent',
          text: data.data?.text ?? '',
          timestamp: data.timestamp ?? new Date().toISOString(),
        });
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('agent.online', (event) => {
      try {
        const data = JSON.parse(event.data);
        const agentId = data.data?.agentId;
        if (agentId) {
          updateAgentStatus(agentId, 'online');
        }
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('agent.offline', (event) => {
      try {
        const data = JSON.parse(event.data);
        const agentId = data.data?.agentId;
        if (agentId) {
          updateAgentStatus(agentId, 'offline');
        }
      } catch { /* ignore */ }
    });

    eventSource.onerror = () => {
      // EventSource auto-reconnects
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [wsId]);
}
