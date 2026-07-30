/**
 * Claude Code session-file (JSONL) parser + transcript search.
 *
 * Proves: string and array `content` both flatten (text blocks joined, tool_use
 * → `[tool: name]`, tool_result inner text extracted); malformed/blank/meta lines
 * are skipped (never a throw, never a fabricated message); role comes from
 * message.role with a top-level `type` fallback; and search returns one bounded
 * snippet per matching message, case-insensitive, empty-query → nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  parseClaudeSessionJsonl,
  flattenContent,
  searchTranscript,
} from './claude-session-parser.js';

describe('flattenContent', () => {
  it('returns a string as-is', () => {
    expect(flattenContent('hello')).toBe('hello');
  });
  it('joins text blocks and renders tool_use / tool_result', () => {
    expect(
      flattenContent([
        { type: 'text', text: 'first' },
        { type: 'tool_use', name: 'bash', input: {} },
        { type: 'tool_result', content: 'output here' },
        { type: 'text', text: 'last' },
      ]),
    ).toBe('first\n[tool: bash]\noutput here\nlast');
  });
  it('extracts text from an array-shaped tool_result and ignores unknown blocks', () => {
    expect(flattenContent([{ type: 'tool_result', content: [{ type: 'text', text: 'ok' }] }, { type: 'weird' }])).toBe(
      'ok',
    );
  });
  it('returns "" for null/number/object', () => {
    expect(flattenContent(null)).toBe('');
    expect(flattenContent(42)).toBe('');
    expect(flattenContent({ type: 'text' })).toBe('');
  });
});

describe('parseClaudeSessionJsonl', () => {
  const jsonl = [
    '{"type":"summary","summary":"Session about auth"}',
    '{"type":"user","message":{"role":"user","content":"fix the login bug"},"timestamp":"2026-07-30T10:00:00Z"}',
    'not json at all',
    '',
    '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Looking at auth.ts"},{"type":"tool_use","name":"edit_file"}]},"timestamp":"2026-07-30T10:00:05Z"}',
    '{"type":"assistant","message":{"role":"assistant","content":[]}}',
  ].join('\n');

  it('reconstructs the user/agent message stream, skipping meta/blank/malformed/empty', () => {
    const msgs = parseClaudeSessionJsonl(jsonl);
    expect(msgs).toEqual([
      { role: 'user', text: 'fix the login bug', timestamp: '2026-07-30T10:00:00Z' },
      { role: 'assistant', text: 'Looking at auth.ts\n[tool: edit_file]', timestamp: '2026-07-30T10:00:05Z' },
    ]);
  });

  it('falls back to the top-level type when message.role is absent', () => {
    const msgs = parseClaudeSessionJsonl('{"type":"user","message":{"content":"hi there"}}');
    expect(msgs).toEqual([{ role: 'user', text: 'hi there', timestamp: '' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseClaudeSessionJsonl('')).toEqual([]);
    expect(parseClaudeSessionJsonl('\n\n')).toEqual([]);
  });
});

describe('searchTranscript', () => {
  const msgs = parseClaudeSessionJsonl(
    [
      '{"type":"user","message":{"role":"user","content":"please fix the AUTH flow"}}',
      '{"type":"assistant","message":{"role":"assistant","content":"working on billing instead"}}',
    ].join('\n'),
  );

  it('matches case-insensitively and returns one snippet per matching message', () => {
    const hits = searchTranscript(msgs, 'auth');
    expect(hits).toHaveLength(1);
    expect(hits[0].role).toBe('user');
    expect(hits[0].snippet).toContain('AUTH');
  });

  it('returns nothing for an empty query (search is opt-in)', () => {
    expect(searchTranscript(msgs, '')).toEqual([]);
    expect(searchTranscript(msgs, '   ')).toEqual([]);
  });

  it('bounds a long message into an ellipsised snippet', () => {
    const long = 'x'.repeat(500) + ' NEEDLE ' + 'y'.repeat(500);
    const hits = searchTranscript([{ role: 'user', text: long, timestamp: '' }], 'needle');
    expect(hits[0].snippet).toContain('NEEDLE');
    expect(hits[0].snippet.startsWith('…')).toBe(true);
    expect(hits[0].snippet.endsWith('…')).toBe(true);
    expect(hits[0].snippet.length).toBeLessThan(250);
  });
});
