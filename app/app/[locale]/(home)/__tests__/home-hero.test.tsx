import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// C7 contract: the home hero (page.tsx H1/¶1) and the layout metadata must both
// describe the REAL product — a terminal for running coding agents (Claude Code,
// Codex, and more) in parallel isolated git worktrees, BYOK, review + merge —
// aligned to the bid keywords without keyword-stuffing or false claims.
//
// NOTE ON RENDER: a full @testing-library / react-dom render is intentionally
// NOT used here. The repo is mid-migration to react@19 while
// @testing-library/react@14 still pins react-dom@18 (element-symbol mismatch),
// and Next's `jsx: preserve` tsconfig makes vitest/esbuild emit the CLASSIC JSX
// runtime, which throws for client pages that don't import React. Both are
// pre-existing, repo-wide conditions (the existing dashboard render test fails
// the same way) and out of scope for this copy change. So we (1) assert the
// module loads (compiles) and exports a component, and (2) lock the on-page
// hero copy from source — a deterministic, environment-independent contract.

const here = path.dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(path.join(here, '..', 'page.tsx'), 'utf8');

// Isolate the hero <h1>…</h1> and the first hero paragraph from source so the
// assertions target the real on-page elements, not incidental prose elsewhere.
const heroH1 = pageSource.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? '';
const heroLead =
  pageSource.match(/Recoder is a terminal for AI coding agents[\s\S]*?<\/p>/)?.[0] ?? '';

describe('HomePage hero copy (source lock)', () => {
  it('module loads and exports a default component', async () => {
    const mod = await import('../page');
    expect(typeof mod.default).toBe('function');
  });

  it('H1 leads with the real product + bid terms (Claude Code / Codex / parallel)', () => {
    expect(heroH1).not.toBe('');
    expect(heroH1).toContain('Claude Code');
    expect(heroH1).toContain('Codex');
    expect(heroH1.toLowerCase()).toContain('in parallel');
    // Stale, misaligned copy must be gone.
    expect(pageSource).not.toContain('Ship with AI agents');
  });

  it('first paragraph honestly describes terminal / worktree / BYOK / review + merge', () => {
    expect(heroLead).not.toBe('');
    expect(heroLead).toMatch(/isolated git worktree/i);
    expect(heroLead).toContain('BYOK');
    expect(heroLead).toMatch(/review\s+the diff and merge/i);
    expect(heroLead).toMatch(/free to start/i);
  });
});

describe('HomeLayout metadata (agrees with the hero + bid keywords)', () => {
  it('carries the keyword-aligned title/description/keywords', async () => {
    const { metadata } = await import('../layout');
    const title = String(metadata.title);
    const description = String(metadata.description);

    expect(title).toContain('Claude Code');
    expect(title).toContain('Codex');
    expect(title).toContain('Parallel');

    expect(description).toContain('terminal for AI coding agents');
    expect(description).toContain('BYOK');
    expect(description.toLowerCase()).toContain('git worktree');
    // No fabricated / stale claim the page no longer makes.
    expect(description.toLowerCase()).not.toContain('voice');

    const keywords = metadata.keywords as string[] | undefined;
    expect(keywords).toBeDefined();
    expect(keywords).toContain('Claude Code');
    expect(keywords).toContain('bring your own API key');
  });
});
