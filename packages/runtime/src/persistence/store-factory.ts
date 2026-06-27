import type { RuntimeConfig } from '../types/runtime-config';
import { runtimeError } from '../errors/runtime-error';
import type { RunStore } from './run-store';
import { createMemoryRunStore } from './memory-run-store';
import { createJsonlRunStore } from './jsonl-run-store';

/**
 * Choose a `RunStore` from `RuntimeConfig.journalStore`. `memory` is the default; `jsonl`
 * requires `journalDir` and fails truthfully (`env_unavailable`) when it is missing rather
 * than silently degrading to ephemeral memory and losing the durable journal a caller asked
 * for.
 */
export function createRunStore(config: Pick<RuntimeConfig, 'journalStore' | 'journalDir'>): RunStore {
  if (config.journalStore === 'jsonl') {
    if (!config.journalDir) {
      throw runtimeError(
        'env_unavailable',
        'journalStore=jsonl requires journalDir to be configured.',
        { retryable: false },
      );
    }
    return createJsonlRunStore({ dir: config.journalDir });
  }
  return createMemoryRunStore();
}
