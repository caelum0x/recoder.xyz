import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { RunEvent } from '@recoder/agent-os';
import type { RunStore } from './run-store';

/**
 * Append-only JSONL run store. ADAPTS pi-agent-core `jsonl-storage.ts`: each run's journal
 * is a newline-delimited JSON file (`<runId>.jsonl`) under a base directory. Appends are
 * order-preserving; reads parse line-by-line and skip malformed lines truthfully (logging
 * the parse position) rather than discarding the whole journal.
 */
export class JsonlRunStore implements RunStore {
  readonly #dir: string;

  constructor(input: { dir: string }) {
    this.#dir = input.dir;
  }

  async append(runId: string, event: RunEvent): Promise<void> {
    await this.#ensureDir();
    await fs.appendFile(this.#file(runId), `${JSON.stringify(event)}\n`, 'utf8');
  }

  async appendBatch(runId: string, events: readonly RunEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.#ensureDir();
    const body = events.map((event) => JSON.stringify(event)).join('\n');
    await fs.appendFile(this.#file(runId), `${body}\n`, 'utf8');
  }

  async read(runId: string): Promise<RunEvent[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.#file(runId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const events: RunEvent[] = [];
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]?.trim();
      if (!line) continue;
      try {
        events.push(JSON.parse(line) as RunEvent);
      } catch {
        // Skip a corrupt line but keep the rest of the journal recoverable.
        continue;
      }
    }
    return events;
  }

  async list(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.#dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.slice(0, -'.jsonl'.length));
  }

  #file(runId: string): string {
    // Guard against path traversal from a hostile run id.
    const safe = runId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.#dir, `${safe}.jsonl`);
  }

  async #ensureDir(): Promise<void> {
    await fs.mkdir(this.#dir, { recursive: true });
  }
}

export function createJsonlRunStore(input: { dir: string }): RunStore {
  return new JsonlRunStore(input);
}
