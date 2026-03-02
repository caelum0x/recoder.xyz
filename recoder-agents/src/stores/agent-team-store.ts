import { create } from 'zustand';

export type AgentStatus = 'online' | 'working' | 'idle' | 'error' | 'offline';

export interface AgentTeamMember {
  agentId: string;
  name: string;
  platform: string;
  status: AgentStatus;
  currentTaskId?: string;
  currentTaskTitle?: string;
  skills: string[];
  lastSeen?: string;
  /** True when connected via the local agent bridge (recoder-code CLI). */
  isLocal?: boolean;
  /** Capabilities reported by bridge-connected agents. */
  capabilities?: string[];
}

interface AgentTeamState {
  agents: AgentTeamMember[];
  agentStatuses: Record<string, AgentStatus>;

  setAgents: (agents: AgentTeamMember[]) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateAgentTask: (agentId: string, taskId: string | undefined, taskTitle: string | undefined) => void;
  addAgent: (agent: AgentTeamMember) => void;
  removeAgent: (agentId: string) => void;
}

export const useAgentTeamStore = create<AgentTeamState>()((set) => ({
  agents: [],
  agentStatuses: {},

  setAgents: (agents) =>
    set({
      agents,
      agentStatuses: Object.fromEntries(agents.map((a) => [a.agentId, a.status])),
    }),

  updateAgentStatus: (agentId, status) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.agentId === agentId ? { ...a, status } : a,
      ),
      agentStatuses: { ...state.agentStatuses, [agentId]: status },
    })),

  updateAgentTask: (agentId, taskId, taskTitle) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.agentId === agentId
          ? { ...a, currentTaskId: taskId, currentTaskTitle: taskTitle, status: taskId ? 'working' : 'idle' }
          : a,
      ),
    })),

  addAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents, agent],
      agentStatuses: { ...state.agentStatuses, [agent.agentId]: agent.status },
    })),

  removeAgent: (agentId) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.agentId !== agentId),
    })),
}));

// Optimized selectors
export const useAgentTeamMembers = () =>
  useAgentTeamStore((state) => state.agents);
export const useAgentStatus = (agentId: string) =>
  useAgentTeamStore((state) => state.agentStatuses[agentId] ?? 'offline');
export const useOnlineAgents = () =>
  useAgentTeamStore((state) =>
    state.agents.filter((a) => a.status !== 'offline'),
  );
export const useWorkingAgents = () =>
  useAgentTeamStore((state) =>
    state.agents.filter((a) => a.status === 'working'),
  );
export const useLocalAgents = () =>
  useAgentTeamStore((state) =>
    state.agents.filter((a) => a.isLocal),
  );
