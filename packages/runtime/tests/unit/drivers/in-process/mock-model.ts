import type { LanguageModel } from 'ai';

/**
 * A hand-rolled `LanguageModelV2` for fully offline tests — no network, no model spend.
 *
 * It implements the minimal v2 provider surface `streamText` consumes (`doStream` returning
 * a `ReadableStream` of v2 stream parts). Each call returns the next scripted "turn" so a
 * tool-call turn can be followed by a text turn (the tool loop). This mirrors the
 * `packages/pi-ai` faux provider intent the runtime spec calls for.
 */

export type MockV2Part =
  | { type: 'stream-start'; warnings: unknown[] }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }
  | {
      type: 'finish';
      finishReason: string;
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    };

export type MockTurn = MockV2Part[];

/** Build a mock model whose `doStream` replays `turns[callIndex]` on each invocation. */
export function makeMockModel(turns: MockTurn[]): LanguageModel {
  let call = 0;
  const model = {
    specificationVersion: 'v2' as const,
    provider: 'mock',
    modelId: 'mock/test',
    supportedUrls: {},
    async doStream() {
      const turn = turns[Math.min(call, turns.length - 1)] ?? [];
      call += 1;
      return {
        stream: new ReadableStream({
          start(controller): void {
            for (const part of turn) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
  // The structural mock is a faithful subset of LanguageModelV2; cast through unknown.
  return model as unknown as LanguageModel;
}

/** A single text-only turn that finishes with `stop`. */
export function textTurn(text: string): MockTurn {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } },
  ];
}
