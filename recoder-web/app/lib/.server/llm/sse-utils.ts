/**
 * Shared SSE (Server-Sent Events) Utilities
 *
 * Consolidates duplicated SSE frame parsing, serialization, and
 * ReadableStream construction patterns used across:
 *  - anthropic-stream.ts
 *  - openai-stream.ts
 *  - openrouter-stream.ts
 *  - stream-text-native.ts
 *  - task-execution/stream-task.ts
 *
 * Usage:
 *   import { SSEParser, createSSEStream, serializeSSE } from './sse-utils';
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---- Serialization ----

/**
 * Serialize a JSON-safe value into an SSE frame string.
 * Output: "data: {json}\n\n"
 */
export function serializeSSE(
  data: unknown,
  options?: { id?: string; event?: string; retry?: number },
): string {
  const lines: string[] = [];
  if (options?.id) lines.push(`id: ${options.id}`);
  if (options?.event) lines.push(`event: ${options.event}`);
  if (options?.retry != null) lines.push(`retry: ${options.retry}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join('\n')}\n\n`;
}

/**
 * Serialize for AI SDK text stream format: "0:{json}\n"
 */
export function serializeAISDKText(text: string): string {
  return `0:${JSON.stringify(text)}\n`;
}

/**
 * Serialize AI SDK finish event: "e:{json}\n"
 */
export function serializeAISDKFinish(payload: {
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number };
}): string {
  return `e:${JSON.stringify(payload)}\n`;
}

// ---- Encoding helpers ----

export function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decode(bytes: Uint8Array, streaming = true): string {
  return decoder.decode(bytes, { stream: streaming });
}

// ---- SSE Frame Parser ----

export interface SSEFrame {
  id?: string;
  event?: string;
  retry?: number;
  data: string;
}

/**
 * Incremental SSE parser that handles buffering across chunk boundaries.
 *
 * Feed raw text via `push(chunk)`, receive complete frames via the callback.
 *
 * Example:
 *   const parser = new SSEParser((frame) => { console.log(frame.data); });
 *   for await (const chunk of reader) {
 *     parser.push(decoder.decode(chunk, { stream: true }));
 *   }
 *   parser.flush();
 */
export class SSEParser {
  private buffer = '';
  private onFrame: (frame: SSEFrame) => void;

  constructor(onFrame: (frame: SSEFrame) => void) {
    this.onFrame = onFrame;
  }

  push(text: string): void {
    this.buffer += text;
    const frames = this.buffer.split('\n\n');
    // Last element is incomplete — keep it in the buffer
    this.buffer = frames.pop() || '';

    for (const raw of frames) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      this.onFrame(parseRawFrame(trimmed));
    }
  }

  flush(): void {
    const trimmed = this.buffer.trim();
    if (trimmed) {
      this.onFrame(parseRawFrame(trimmed));
    }
    this.buffer = '';
  }
}

function parseRawFrame(raw: string): SSEFrame {
  const frame: SSEFrame = { data: '' };
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5));
    } else if (line.startsWith('id: ')) {
      frame.id = line.slice(4);
    } else if (line.startsWith('event: ')) {
      frame.event = line.slice(7);
    } else if (line.startsWith('retry: ')) {
      frame.retry = Number(line.slice(7));
    }
  }

  frame.data = dataLines.join('\n');
  return frame;
}

// ---- OpenAI / OpenRouter SSE delta extraction ----

/**
 * Extract the text delta from an OpenAI-compatible SSE data payload.
 * Returns null for [DONE] or non-text events.
 */
export function extractChatCompletionDelta(data: string): string | null {
  if (data === '[DONE]') return null;
  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

// ---- Stream Builders ----

/**
 * Create a ReadableStream from an async iterable of SSE-formatted strings.
 */
export function createSSEStream(
  source: AsyncIterable<string> | (() => AsyncIterable<string>),
): ReadableStream<Uint8Array> {
  const iterable = typeof source === 'function' ? source() : source;

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iterable) {
          controller.enqueue(encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Create a ReadableStream that polls a fetcher function at an interval.
 * Emits SSE frames only when `hasChanged` returns true.
 */
export function createPollingSSEStream<T>(options: {
  fetcher: () => Promise<T>;
  hasChanged: (prev: T | null, curr: T) => boolean;
  serialize: (value: T) => string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const {
    fetcher,
    hasChanged,
    serialize,
    intervalMs = 500,
    timeoutMs = 20 * 60_000,
    signal,
  } = options;

  return new ReadableStream({
    async start(controller) {
      let prev: T | null = null;
      let done = false;

      const cleanup = () => { done = true; };

      const timeout = setTimeout(() => {
        cleanup();
        controller.close();
      }, timeoutMs);

      signal?.addEventListener('abort', () => {
        cleanup();
        clearTimeout(timeout);
        controller.close();
      });

      while (!done) {
        try {
          const value = await fetcher();
          if (hasChanged(prev, value)) {
            controller.enqueue(encode(serialize(value)));
            prev = value;
          }
        } catch {
          // Silently continue on transient errors
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      clearTimeout(timeout);
    },
  });
}
