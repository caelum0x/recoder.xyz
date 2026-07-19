/**
 * In-memory {@link RepoSetupStorePort} — the degrade-safe default the composer
 * uses when no durable store is injected. Bounded and process-local: it survives
 * across requests within one backend process, not across a restart. This mirrors
 * the conductor's "no DB ⇒ bounded in-process store" posture (see the workspace
 * repository) — a durable executor-backed store can replace it at the
 * composition root without any caller change.
 */
import type {
  RepoSetupConfig,
  RepoSetupStorePort,
} from '../ports/repo-setup-store.port.js';

/** Build a bounded, process-local repo-setup store (immutable snapshots on set). */
export function createInMemoryRepoSetupStore(): RepoSetupStorePort {
  const store = new Map<string, RepoSetupConfig>();
  return {
    async get(repoKey: string): Promise<RepoSetupConfig | null> {
      return store.get(repoKey) ?? null;
    },
    async set(config: RepoSetupConfig): Promise<RepoSetupConfig> {
      // Store a frozen copy so a later caller mutation can never reach the map.
      const snapshot: RepoSetupConfig = Object.freeze({ ...config });
      store.set(config.repoKey, snapshot);
      return snapshot;
    },
  };
}
