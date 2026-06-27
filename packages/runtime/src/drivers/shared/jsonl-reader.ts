import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

/**
 * MERGE of `packages/pi-coding-agent/src/modes/rpc/jsonl.ts` (reader half).
 *
 * Attach an LF-only JSONL reader to a stream. Intentionally does not use Node readline,
 * which splits on additional Unicode separators (U+2028/U+2029) valid inside JSON strings
 * and therefore does not implement strict JSONL framing. Clients must split on `\n` only.
 *
 * Returns a detach function.
 */
export function attachJsonlLineReader(stream: Readable, onLine: (line: string) => void): () => void {
  const decoder = new StringDecoder('utf8');
  let buffer = '';

  const emitLine = (line: string) => {
    onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
  };

  const onData = (chunk: string | Buffer) => {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);

    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }
      emitLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }
  };

  const onEnd = () => {
    buffer += decoder.end();
    if (buffer.length > 0) {
      emitLine(buffer);
      buffer = '';
    }
  };

  stream.on('data', onData);
  stream.on('end', onEnd);

  return () => {
    stream.off('data', onData);
    stream.off('end', onEnd);
  };
}

/**
 * Read JSONL objects from a stream, parsing each line. Malformed lines are passed to
 * `onError` (never silently swallowed) rather than throwing mid-stream.
 */
export function attachJsonlObjectReader<T = unknown>(
  stream: Readable,
  onObject: (value: T) => void,
  onError?: (error: Error, line: string) => void,
): () => void {
  return attachJsonlLineReader(stream, (line) => {
    if (line.trim() === '') return;
    try {
      onObject(JSON.parse(line) as T);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)), line);
    }
  });
}
