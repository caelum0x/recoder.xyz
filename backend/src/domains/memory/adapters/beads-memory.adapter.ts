/**
 * beads-memory.adapter — adapts the legacy beads memory service
 * (`backend/src/conductor/beads-memory.ts`) to the domain `BeadsMemoryPort`.
 * beads (`bd`) is the issue-graph SHARED memory layer (candidate→promote,
 * Dolt-versioned). The legacy module already degrades to `undefined`/`[]`/`false`
 * when `bd` is missing or the DB is locked; this adapter narrows its shapes.
 *
 * DEGRADE-SAFE: `available()` reflects whether the `bd` binary resolves; every
 * method returns the legacy degrade value (never throws, never fabricates).
 */
import {
  appendMemoryNote,
  promoteMemory,
  recallMemories,
  rememberCandidate,
  type MemoryEntry,
} from '../../../conductor/beads-memory.js';
import { beadsAvailability } from '../../../conductor/beads-sync.js';
import type { BeadsMemoryEntry, BeadsMemoryPort, BeadsRememberInput } from '../ports/beads-memory.port.js';

function toEntry(e: MemoryEntry): BeadsMemoryEntry {
  return {
    id: e.id,
    title: e.title,
    // Legacy uses `description` for the memory body; normalize the field name.
    body: e.description,
    status: e.status,
    labels: e.labels,
  };
}

/** Build the beads memory adapter over the legacy conductor module. */
export function createBeadsMemoryAdapter(): BeadsMemoryPort {
  return {
    available(): boolean {
      try {
        return beadsAvailability().available;
      } catch {
        return false;
      }
    },

    remember(input: BeadsRememberInput): string | undefined {
      try {
        return rememberCandidate({
          title: input.title,
          body: input.body,
          ...(input.scope ? { scope: input.scope } : {}),
          ...(input.discoveredFrom ? { discoveredFrom: input.discoveredFrom } : {}),
        });
      } catch {
        return undefined;
      }
    },

    recall(query: string, options: { scope?: string; limit?: number } = {}): readonly BeadsMemoryEntry[] {
      try {
        return recallMemories(query, options).map(toEntry);
      } catch {
        return [];
      }
    },

    promote(id: string): boolean {
      try {
        return promoteMemory(id);
      } catch {
        return false;
      }
    },

    note(id: string, text: string): boolean {
      try {
        return appendMemoryNote(id, text);
      } catch {
        return false;
      }
    },
  };
}
