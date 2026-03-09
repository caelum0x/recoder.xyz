import { atom, map } from 'nanostores';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentTeamStatus = 'online' | 'working' | 'idle' | 'error' | 'offline';

export interface AgentTeamAgent {
  agentId: string;
  name: string;
  platform: string;
  status: AgentTeamStatus;
  currentTaskId?: string;
  currentTaskTitle?: string;
}

export interface AgentTeamTask {
  taskId: string;
  prompt: string;
  agentId: string;
  status: string;
  createdAt: string;
  approvalId?: string;
}

export interface AgentTeamMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export const agentTeamWorkspaceId = atom<string | null>(null);
export const agentTeamAgents = atom<AgentTeamAgent[]>([]);
export const agentTeamTasks = atom<AgentTeamTask[]>([]);
export const agentTeamMessages = atom<AgentTeamMessage[]>([]);
export const agentTeamLoading = atom<boolean>(false);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function initAgentTeam(projectId: string): void {
  agentTeamLoading.set(true);
  // The SSE hook will populate data once connected
  agentTeamWorkspaceId.set(projectId);
  agentTeamLoading.set(false);
}

export function updateAgentStatus(agentId: string, status: AgentTeamStatus): void {
  const current = agentTeamAgents.get();
  agentTeamAgents.set(
    current.map((a) => (a.agentId === agentId ? { ...a, status } : a)),
  );
}

export function addAgentTeamMessage(message: AgentTeamMessage): void {
  const current = agentTeamMessages.get();
  agentTeamMessages.set([...current.slice(-49), message]); // Keep last 50
}

export async function dispatchQuickTask(prompt: string, agentId?: string): Promise<void> {
  const wsId = agentTeamWorkspaceId.get();
  if (!wsId) return;

  try {
    const response = await fetch('/api/a2a/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        prompt,
        agentId,
        workspaceId: wsId,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        id?: string;
        data?: { id?: string };
      };
      const tasks = agentTeamTasks.get();
      agentTeamTasks.set([
        {
          taskId: data.data?.id ?? data.id ?? `task_${Date.now()}`,
          prompt,
          agentId: agentId ?? 'auto',
          status: 'submitted',
          createdAt: new Date().toISOString(),
        },
        ...tasks.slice(0, 9), // Keep last 10
      ]);
    }
  } catch {
    // Silently fail for quick dispatch
  }
}

export async function approveAction(approvalId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/a2a/approvals/${approvalId}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ resolvedBy: 'user' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function rejectAction(approvalId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/a2a/approvals/${approvalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ resolvedBy: 'user' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
