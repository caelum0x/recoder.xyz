import { Pool } from 'pg';
import { InMemoryAgentOsRepository } from './repositories/in-memory-agent-os.repository';
import { JsonFileAgentOsRepository } from './repositories/json-file-agent-os.repository';
import { PostgresAgentOsRepository } from './repositories/postgres-agent-os.repository';
import type { AgentOsRepository } from './repositories/agent-os.repository';
import { WorkLockService } from '@recoder/agent-os';
import { BrainService, createBrainService } from './brain-service';
import { RecoderGitService, createRecoderGitService } from './recodergit-service';

export type AgentOsRepositoryDriver = 'memory' | 'json' | 'postgres';

export type AgentOsServiceContainer = {
  repository: AgentOsRepository;
  repositoryDriver: AgentOsRepositoryDriver;
  /**
   * The live pg Pool backing the Postgres repository, when that driver is active.
   * Undefined for the memory/json drivers. Exposed so boot can auto-apply the
   * Agent OS schema migrations (degrade-safe) when running on Postgres.
   */
  pgPool?: Pool;
  workLocks: WorkLockService;
  // Flag-gated (RECODER_BRAIN_ENABLED). No-op when disabled; never throws.
  brain: BrainService;
  // Flag-gated (RECODER_CODE_GRAPH_ENABLED). Owns the code-graph index lifecycle.
  // No-op when disabled; fail-safe (never throws into a request path).
  codeGraph: RecoderGitService;
};

export const agentOsContainer: AgentOsServiceContainer = {
  ...createRepository(),
  workLocks: new WorkLockService(),
  brain: createBrainService(),
  codeGraph: createRecoderGitService(),
};

function createRepository(): Pick<AgentOsServiceContainer, 'repository' | 'repositoryDriver' | 'pgPool'> {
  const configuredDriver = process.env.AGENT_OS_REPOSITORY?.trim().toLowerCase();
  const databaseUrl = process.env.AGENT_OS_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configuredDriver === 'postgres' || databaseUrl) {
    if (!databaseUrl) {
      throw new Error('AGENT_OS_REPOSITORY=postgres requires AGENT_OS_DATABASE_URL or DATABASE_URL.');
    }

    const pgPool = new Pool({ connectionString: databaseUrl });
    return {
      repository: new PostgresAgentOsRepository(pgPool),
      repositoryDriver: 'postgres',
      pgPool,
    };
  }

  const stateFilePath = process.env.AGENT_OS_STATE_FILE;
  if (stateFilePath) {
    return {
      repository: new JsonFileAgentOsRepository(stateFilePath),
      repositoryDriver: 'json',
    };
  }

  return {
    repository: new InMemoryAgentOsRepository(),
    repositoryDriver: 'memory',
  };
}
