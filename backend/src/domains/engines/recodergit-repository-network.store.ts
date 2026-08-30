import {
  findRepositoryConsumerImpact,
  type CrossRepositoryConsumer,
  type RepositoryConsumerImpact,
  type RepositoryRegistration,
} from '@recoder/recodergit';
import type { RecoderGitStateKv } from './recodergit-index-state.store.js';

export const RECODERGIT_REPOSITORY_NETWORK_NAMESPACE = 'engines.recodergit.repository-network';
const REGISTRY_KEY = 'registry';
const STORE_VERSION = 1 as const;
const MAX_REPOSITORIES = 200;

type StoredRepositoryNetwork = {
  version: typeof STORE_VERSION;
  registrations: RepositoryRegistration[];
};

export interface RecoderGitRepositoryNetwork {
  register(
    registration: RepositoryRegistration,
    aliases?: readonly string[],
  ): Promise<void>;
  consumers(input: {
    providerRepoId: string;
    providerAliases?: readonly string[];
    targetPath: string;
    limit?: number;
  }): Promise<CrossRepositoryConsumer[]>;
  consumerImpact(input: {
    providerRepoId: string;
    providerAliases?: readonly string[];
    targetPath: string;
    limit?: number;
  }): Promise<RepositoryConsumerImpact>;
}

function validRegistration(value: unknown): value is RepositoryRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.repoId === 'string' && Boolean(row.repoId) &&
    typeof row.repoRoot === 'string' &&
    typeof row.revision === 'string' && Boolean(row.revision) &&
    typeof row.indexedAt === 'string' &&
    Array.isArray(row.packages) &&
    Array.isArray(row.externalImports);
}

function parseRegistry(value: unknown): RepositoryRegistration[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  if (row.version !== STORE_VERSION || !Array.isArray(row.registrations)) return [];
  return row.registrations.filter(validRegistration).slice(0, MAX_REPOSITORIES);
}

/** Durable canonical registry used to connect provider changes to indexed consumers. */
export function createRecoderGitRepositoryNetwork(
  kv: RecoderGitStateKv,
): RecoderGitRepositoryNetwork {
  const memory = new Map<string, RepositoryRegistration>();
  let hydrate: Promise<void> | null = null;
  let writes: Promise<void> = Promise.resolve();

  async function load(): Promise<void> {
    if (!hydrate) {
      hydrate = (async () => {
        try {
          const stored = await kv.getJson<unknown>(RECODERGIT_REPOSITORY_NETWORK_NAMESPACE, REGISTRY_KEY);
          for (const registration of parseRegistry(stored)) memory.set(registration.repoId, registration);
        } catch {
          // The process-local registry remains usable while canonical KV recovers.
        }
      })();
    }
    await hydrate;
  }

  async function persist(): Promise<void> {
    const registrations = [...memory.values()]
      .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt) || a.repoId.localeCompare(b.repoId))
      .slice(0, MAX_REPOSITORIES);
    memory.clear();
    for (const item of registrations) memory.set(item.repoId, item);
    const stored: StoredRepositoryNetwork = { version: STORE_VERSION, registrations };
    try {
      await kv.setJson(RECODERGIT_REPOSITORY_NETWORK_NAMESPACE, REGISTRY_KEY, stored);
    } catch {
      // Live cross-repo reads continue from memory; KV health owns durability reporting.
    }
  }

  return {
    async register(registration, aliases = []): Promise<void> {
      await load();
      writes = writes.then(async () => {
        for (const alias of aliases) {
          if (alias && alias !== registration.repoId) memory.delete(alias);
        }
        memory.set(registration.repoId, registration);
        await persist();
      });
      await writes;
    },
    async consumerImpact(input): Promise<RepositoryConsumerImpact> {
      await load();
      await writes;
      const ids = [input.providerRepoId, ...(input.providerAliases ?? [])];
      const provider = ids.map((id) => memory.get(id)).find((item): item is RepositoryRegistration => Boolean(item));
      if (!provider) return { consumers: [], total: 0, consumerRepositories: 0, partial: false };
      return findRepositoryConsumerImpact(
        provider,
        [...memory.values()],
        input.targetPath,
        input.limit ?? 100,
      );
    },
    async consumers(input): Promise<CrossRepositoryConsumer[]> {
      return (await this.consumerImpact(input)).consumers;
    },
  };
}
