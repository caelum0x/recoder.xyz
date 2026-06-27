import type { Writable } from 'node:stream';

/**
 * MERGE of `packages/pi-coding-agent/src/modes/rpc/jsonl.ts` (writer half).
 *
 * Serialize a single strict JSONL record. Framing is LF-only; payload strings may contain
 * other Unicode separators (U+2028/U+2029), so readers must split on `\n` only.
 */
export function serializeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/** Write a JSONL command to a child's stdin (rpc steering). Resolves on flush. */
export function writeJsonLine(stream: Writable, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(serializeJsonLine(value), (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
