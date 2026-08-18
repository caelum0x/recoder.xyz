/**
 * LLM review generator (recoder-7z42) — proves the adapter's real logic via an INJECTED
 * model: it builds an evidence-demanding prompt, defensively parses the reply (tolerating
 * ``` fences / prose), and degrades to [] on empty diff / no model / bad reply. The live
 * inference call is injected, so this is fully deterministic.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createLlmReviewGenerator,
  buildReviewPrompt,
  parseReviewResponse,
} from './review-generator.adapter.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} } as never;

describe('buildReviewPrompt', () => {
  it('embeds the diff and demands evidence per finding', () => {
    const p = buildReviewPrompt('+ const x = 1;');
    expect(p).toMatch(/EVIDENCE/);
    expect(p).toMatch(/\+ const x = 1;/);
    expect(p).toMatch(/JSON array/i);
  });
});

describe('parseReviewResponse', () => {
  it('parses a fenced JSON array of findings, dropping malformed elements', () => {
    const raw = [
      'Here are the findings:',
      '```json',
      JSON.stringify([
        { file: 'a.ts', line: 10, severity: 'high', message: 'null deref', evidence: 'x.f() x nullable', confidence: 0.9 },
        { file: '', line: 3, message: 'no file' }, // dropped
        { file: 'b.ts', line: 0, message: 'bad line' }, // dropped
        'garbage', // dropped
      ]),
      '```',
    ].join('\n');
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ file: 'a.ts', line: 10, severity: 'high', evidence: 'x.f() x nullable', confidence: 0.9 });
  });

  it('coerces an unknown severity to info and never throws on junk', () => {
    expect(parseReviewResponse('not json at all')).toEqual([]);
    expect(parseReviewResponse('[{"file":"a.ts","line":2,"message":"m","severity":"weird"}]')[0].severity).toBe('info');
  });
});

describe('createLlmReviewGenerator', () => {
  it('calls the model with the diff prompt and returns parsed candidate findings', async () => {
    const complete = vi.fn(async () => JSON.stringify([{ file: 'a.ts', line: 4, severity: 'medium', message: 'm', evidence: 'e' }]));
    const gen = createLlmReviewGenerator({ complete, logger });
    const out = await gen.review({ diffText: '+++ b/a.ts\n+bug', workspaceId: 'ws1' });
    expect(out).toHaveLength(1);
    expect(complete).toHaveBeenCalledOnce();
    expect((complete.mock.calls[0][0] as string)).toMatch(/\+bug/);
  });

  it('degrades to [] on empty diff, a null model reply, or a thrown model', async () => {
    expect(await createLlmReviewGenerator({ complete: async () => '[]', logger }).review({ diffText: '   ', workspaceId: 'w' })).toEqual([]);
    expect(await createLlmReviewGenerator({ complete: async () => null, logger }).review({ diffText: '+x', workspaceId: 'w' })).toEqual([]);
    expect(await createLlmReviewGenerator({ complete: async () => { throw new Error('model down'); }, logger }).review({ diffText: '+x', workspaceId: 'w' })).toEqual([]);
  });
});
