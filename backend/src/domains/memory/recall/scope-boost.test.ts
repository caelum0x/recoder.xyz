/**
 * recall/scope-boost tests — the cross-RUN scoping stage (thesis §7).
 *
 * Contract under test:
 *  - a lesson harvested on the run's repo (its body cites it) ranks ABOVE a
 *    generic match, tagged `repo-match`;
 *  - a fresh lesson ranks above a stale one, tagged `recency`;
 *  - every surfaced memory is annotated with WHY it surfaced (repo-match /
 *    recency / lexical) — never a signal that did not fire;
 *  - with no repoRef and nothing fresh the order is UNCHANGED (the reranker's
 *    order stands — degrade-truthful);
 *  - pure + deterministic: identical inputs (same nowMs) → identical output, and
 *    the input array is never mutated.
 */
import { describe, it, expect } from 'vitest';
import { applyScopeBoost, DEFAULT_RECENCY_WINDOW_MS } from './scope-boost.js';
import type { RecalledMemory } from '../types.js';

const NOW = Date.parse('2026-08-04T00:00:00Z');
const fresh = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days old
const stale = new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days old

function mem(over: Partial<RecalledMemory> & { id: string; body: string }): RecalledMemory {
  return {
    title: undefined,
    provenance: { source: 'candidates', ref: over.id, score: 0.5 },
    ...over,
  };
}

describe('applyScopeBoost', () => {
  it('ranks a repo-matched lesson above a generic match and tags it repo-match', () => {
    const generic = mem({ id: 'g', body: 'always parameterize sql queries' });
    const repoLesson = mem({
      id: 'r',
      body: "On recoder.xyz, task 'fix auth': kept the delegated-verify approach.",
    });

    const out = applyScopeBoost([generic, repoLesson], {
      query: 'auth verify sql',
      repoRef: '/srv/recoder.xyz',
      nowMs: NOW,
    });

    expect(out.map((m) => m.id)).toEqual(['r', 'g']);
    expect(out[0]?.provenance.signals).toContain('repo-match');
    // The generic match carries NO repo-match (it does not pertain to the repo).
    expect(out[1]?.provenance.signals ?? []).not.toContain('repo-match');
  });

  it('boosts a fresh lesson above a stale one and tags recency', () => {
    const staleMem = mem({ id: 's', body: 'deploy uses pm2 restart', createdAt: stale });
    const freshMem = mem({ id: 'f', body: 'deploy now uses a swapfile cap', createdAt: fresh });

    const out = applyScopeBoost([staleMem, freshMem], { query: 'deploy', nowMs: NOW });

    expect(out.map((m) => m.id)).toEqual(['f', 's']);
    expect(out[0]?.provenance.signals).toContain('recency');
    expect(out[1]?.provenance.signals ?? []).not.toContain('recency');
  });

  it('ranks repo-match above recency-only (repo pertinence is the stronger signal)', () => {
    const freshGeneric = mem({ id: 'f', body: 'a fresh but generic note', createdAt: fresh });
    const repoStale = mem({
      id: 'r',
      body: 'On recoder.xyz, the nginx config lives in conf.d',
      createdAt: stale,
    });

    const out = applyScopeBoost([freshGeneric, repoStale], {
      query: 'nginx note',
      repoRef: 'recoder.xyz',
      nowMs: NOW,
    });

    expect(out[0]?.id).toBe('r');
    expect(out[0]?.provenance.signals).toContain('repo-match');
  });

  it('tags lexical when the body overlaps the query', () => {
    const m = mem({ id: 'm', body: 'postgres 17 is the database' });
    const out = applyScopeBoost([m], { query: 'database postgres', nowMs: NOW });
    expect(out[0]?.provenance.signals).toEqual(['lexical']);
  });

  it('leaves order UNCHANGED and adds no boost when nothing matches (degrade-truthful)', () => {
    const a = mem({ id: 'a', body: 'alpha unrelated fact', createdAt: stale });
    const b = mem({ id: 'b', body: 'zeta unrelated fact', createdAt: stale });

    const out = applyScopeBoost([a, b], { query: 'nomatchtoken', nowMs: NOW });

    // No repoRef, nothing fresh, no lexical overlap → identity order, no signals.
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out[0]?.provenance.signals).toBeUndefined();
    expect(out[1]?.provenance.signals).toBeUndefined();
  });

  it('is pure — never mutates the input array or its members', () => {
    const input: readonly RecalledMemory[] = [
      mem({ id: 'g', body: 'generic' }),
      mem({ id: 'r', body: 'On recoder.xyz, a lesson', createdAt: fresh }),
    ];
    const snapshotIds = input.map((m) => m.id);
    const snapshotSignals = input.map((m) => m.provenance.signals);

    applyScopeBoost(input, { query: 'lesson', repoRef: 'recoder.xyz', nowMs: NOW });

    expect(input.map((m) => m.id)).toEqual(snapshotIds);
    // Original members are untouched (a copy was annotated, not the input).
    expect(input.map((m) => m.provenance.signals)).toEqual(snapshotSignals);
  });

  it('is deterministic for identical inputs + nowMs', () => {
    const build = (): RecalledMemory[] => [
      mem({ id: 'a', body: 'On recoder.xyz, alpha', createdAt: fresh }),
      mem({ id: 'b', body: 'generic beta', createdAt: stale }),
      mem({ id: 'c', body: 'On recoder.xyz, gamma', createdAt: stale }),
    ];
    const ctx = { query: 'alpha gamma', repoRef: 'recoder.xyz', nowMs: NOW };

    const first = applyScopeBoost(build(), ctx);
    const second = applyScopeBoost(build(), ctx);

    expect(second.map((m) => m.id)).toEqual(first.map((m) => m.id));
    expect(second.map((m) => m.provenance.signals)).toEqual(first.map((m) => m.provenance.signals));
  });

  it('treats a lesson just inside the window as fresh and just outside as stale', () => {
    const insideWindow = new Date(NOW - (DEFAULT_RECENCY_WINDOW_MS - 1000)).toISOString();
    const outsideWindow = new Date(NOW - (DEFAULT_RECENCY_WINDOW_MS + 1000)).toISOString();
    const inMem = mem({ id: 'in', body: 'window edge in', createdAt: insideWindow });
    const outMem = mem({ id: 'out', body: 'window edge out', createdAt: outsideWindow });

    const out = applyScopeBoost([outMem, inMem], { query: 'window edge', nowMs: NOW });

    expect(out[0]?.id).toBe('in');
    expect(out[0]?.provenance.signals).toContain('recency');
    expect(out[1]?.provenance.signals ?? []).not.toContain('recency');
  });
});
