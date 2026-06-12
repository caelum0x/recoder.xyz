import { InMemoryAgentOsRepository } from './repositories/in-memory-agent-os.repository';
import { JsonFileAgentOsRepository } from './repositories/json-file-agent-os.repository';
import type { AgentOsRepository } from './repositories/agent-os.repository';
import { WorkLockService } from '@recoder/agent-os';

export type AgentOsServiceContainer = {
  repository: AgentOsRepository;
  workLocks: WorkLockService;
};

export const agentOsContainer: AgentOsServiceContainer = {
  repository: createRepository(),
  workLocks: new WorkLockService(),
};

function createRepository(): AgentOsRepository {
  const stateFilePath = process.env.AGENT_OS_STATE_FILE;
  if (stateFilePath) {
    return new JsonFileAgentOsRepository(stateFilePath);
  }

  return new InMemoryAgentOsRepository();
}
