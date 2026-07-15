/**
 * `scratchpad` — the per-task shared note surface over the frozen
 * {@link TaskStoreRepo}. It is how cooperating runtimes leave short, TTL-bound
 * notes for one another on a task (the server assigns the monotone `seq`; expired
 * notes are filtered on read).
 *
 * Thin + truthful: it adds TTL convenience (`ttlMs → expiresAt`) and defensive
 * note-length bounding on top of the repo, and degrades exactly as the repo does.
 */
import type { TaskStoreRepo } from '../ports/task-store.repo.js';
import type { ScratchpadEntry } from '../types.js';

/** Max stored note length (defensive bound; longer notes are truncated). */
export const MAX_SCRATCHPAD_NOTE_LEN = 8_000;

export interface AppendNoteInput {
  readonly taskId: string;
  readonly author: string;
  readonly note: string;
  /** Relative TTL in ms; converted to an absolute `expiresAt`. */
  readonly ttlMs?: number;
  /** Absolute expiry (ISO); takes precedence over `ttlMs` when both set. */
  readonly expiresAt?: string;
}

export interface ScratchpadService {
  /** Append a note (server assigns the next `seq`); returns the stored entry. */
  append(input: AppendNoteInput): Promise<ScratchpadEntry>;
  /** Read the non-expired notes for a task, oldest-first. */
  read(taskId: string, now?: Date): Promise<readonly ScratchpadEntry[]>;
}

/** Build the scratchpad service over the frozen task-store repo. */
export function createScratchpadService(repo: TaskStoreRepo, clock: () => number = Date.now): ScratchpadService {
  return {
    async append(input: AppendNoteInput): Promise<ScratchpadEntry> {
      const expiresAt =
        input.expiresAt ??
        (typeof input.ttlMs === 'number' && input.ttlMs > 0
          ? new Date(clock() + input.ttlMs).toISOString()
          : undefined);
      const note = input.note.length > MAX_SCRATCHPAD_NOTE_LEN ? input.note.slice(0, MAX_SCRATCHPAD_NOTE_LEN) : input.note;
      return repo.appendScratchpad({ taskId: input.taskId, author: input.author, note, expiresAt });
    },

    async read(taskId: string, now?: Date): Promise<readonly ScratchpadEntry[]> {
      return repo.readScratchpad(taskId, now ?? new Date(clock()));
    },
  };
}
