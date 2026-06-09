import type { AgentProfile, TaskIntent } from '../domain';

export class AgentService {
  canHandleIntent(agent: AgentProfile, intent: TaskIntent): boolean {
    return agent.supportedTaskIntents.includes(intent);
  }

  isHealthy(agent: AgentProfile): boolean {
    return agent.health.status === 'healthy' || agent.health.status === 'degraded';
  }

  rankForIntent(agents: AgentProfile[], intent: TaskIntent): AgentProfile[] {
    return agents
      .filter((agent) => this.isHealthy(agent) && this.canHandleIntent(agent, intent))
      .sort((a, b) => b.capabilities.length - a.capabilities.length);
  }
}
