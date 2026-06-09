import { InMemoryAgentOsRepository } from './repositories/in-memory-agent-os.repository';
import { WorkLockService } from '@recoder/agent-os';

export type AgentOsServiceContainer = {
  repository: InMemoryAgentOsRepository;
  workLocks: WorkLockService;
};

export const agentOsContainer: AgentOsServiceContainer = {
  repository: new InMemoryAgentOsRepository(),
  workLocks: new WorkLockService(),
};
