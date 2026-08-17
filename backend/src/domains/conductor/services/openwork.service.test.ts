/**
 * OpenWork probe tests — proves the three open-work sources fold truthfully:
 * unchecked task-spec criteria, added diff TODO/FIXME markers, and non-closed
 * linked issues. Degrade law: a `null` source is unavailable (contributes
 * nothing, never fabricated); no source probed ⇒ `available:false`.
 */
import { describe, it, expect } from 'vitest';
import {
  foldOpenWork,
  parseUncheckedCriteria,
  parseDiffTodos,
} from './openwork.service.js';

describe('parseUncheckedCriteria', () => {
  it('keeps unchecked `- [ ]` / `* [ ]` items and drops checked ones', () => {
    const body = [
      '# Task',
      '- [ ] handles null token',
      '- [x] validates input',
      '* [ ] writes the audit line',
      '- [X] returns 401 on bad creds',
      'not a checkbox line',
    ].join('\n');
    const items = parseUncheckedCriteria(body);
    expect(items.map((i) => i.label)).toEqual(['[ ] handles null token', '[ ] writes the audit line']);
    expect(items.every((i) => i.kind === 'criterion')).toBe(true);
  });

  it('returns [] when there are no unchecked criteria', () => {
    expect(parseUncheckedCriteria('- [x] done\nplain text')).toEqual([]);
  });
});

describe('parseDiffTodos', () => {
  it('flags TODO/FIXME/XXX/HACK on ADDED lines, attributed to their file', () => {
    const diff = [
      'diff --git a/src/auth.ts b/src/auth.ts',
      '--- a/src/auth.ts',
      '+++ b/src/auth.ts',
      '@@ -1,2 +1,4 @@',
      '+function login() {} // TODO: rate limit',
      ' const x = 1;',
      '-const old = removeMe; // FIXME old',
      '+// FIXME: handle refresh',
    ].join('\n');
    const items = parseDiffTodos(diff);
    expect(items.map((i) => i.label)).toEqual([
      'src/auth.ts: function login() {} // TODO: rate limit',
      'src/auth.ts: // FIXME: handle refresh',
    ]);
    expect(items.every((i) => i.kind === 'todo')).toBe(true);
  });

  it('ignores markers on removed/context lines and the +++ header itself', () => {
    const diff = [
      '+++ b/x.ts',
      '-// TODO removed (context/deletion, not new work)',
      ' // TODO unchanged context',
    ].join('\n');
    expect(parseDiffTodos(diff)).toEqual([]);
  });
});

describe('foldOpenWork', () => {
  it('unions all three sources when all are probed', () => {
    const view = foldOpenWork({
      taskBody: '- [ ] ship it',
      diffText: '+++ b/a.ts\n+x // TODO wire',
      openIssues: [{ id: 'recoder-abc', title: 'follow-up' }],
    });
    expect(view.available).toBe(true);
    expect(view.items.map((i) => `${i.kind}:${i.label}`)).toEqual([
      'criterion:[ ] ship it',
      'todo:a.ts: x // TODO wire',
      'issue:recoder-abc: follow-up',
    ]);
  });

  it('a null source is unavailable and contributes nothing (never fabricated)', () => {
    const view = foldOpenWork({ taskBody: null, diffText: '+++ b/a.ts\n+y // FIXME', openIssues: null });
    expect(view.available).toBe(true);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toEqual({ kind: 'todo', label: 'a.ts: y // FIXME' });
  });

  it('available:false with a truthful reason when NO source could be probed', () => {
    const view = foldOpenWork({ taskBody: null, diffText: null, openIssues: null });
    expect(view.available).toBe(false);
    expect(view.items).toEqual([]);
    expect(view.reason).toMatch(/unavailable/i);
  });

  it('a probed source with no findings is available with zero items (a real pass)', () => {
    const view = foldOpenWork({ taskBody: '- [x] done', diffText: null, openIssues: [] });
    expect(view.available).toBe(true);
    expect(view.items).toEqual([]);
  });

  it('caps the surfaced items so a pathological diff cannot flood the surface', () => {
    const many = Array.from({ length: 80 }, (_, i) => `+// TODO ${i}`).join('\n');
    const view = foldOpenWork({ taskBody: null, diffText: `+++ b/a.ts\n${many}`, openIssues: null });
    expect(view.items).toHaveLength(50);
  });
});
