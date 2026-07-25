import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// C7 contract: the home hero (page.tsx H1/¶1) and the layout metadata must both
// describe the REAL product per the locked thesis (docs/PRODUCT-THESIS.md
// §0/§12) — the self-hosted convergence workspace for coding agents: run
// Claude Code, Codex, and any agent in parallel isolated git worktrees (BYOK),
// compare divergent diffs, and land ONE trusted, evidence-backed merge.
// Parallel fan-out is the setup; the trusted merge is the payoff.
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
  pageSource.match(/Recoder is the self-hosted convergence workspace[\s\S]*?<\/p>/)?.[0] ?? '';

describe('HomePage hero copy (source lock)', () => {
  it('module loads and exports a default component', async () => {
    const mod = await import('../page');
    expect(typeof mod.default).toBe('function');
  });

  it('H1 leads with the convergence payoff (parallel setup → one trusted merge)', () => {
    expect(heroH1).not.toBe('');
    expect(heroH1.toLowerCase()).toContain('in parallel');
    expect(heroH1).toContain('One trusted merge.');
    // Stale, misaligned copy must be gone.
    expect(pageSource).not.toContain('Ship with AI agents');
    expect(pageSource).not.toContain('Five products, one control plane');
  });

  it('first paragraph honestly describes agents / worktrees / BYOK / compare / evidence-backed merge', () => {
    expect(heroLead).not.toBe('');
    expect(heroLead).toContain('Claude Code');
    expect(heroLead).toContain('Codex');
    expect(heroLead).toMatch(/isolated git worktree/i);
    expect(heroLead).toContain('BYOK');
    expect(heroLead).toMatch(/divergent diffs/i);
    expect(heroLead).toMatch(/evidence record/i);
  });

  it('page carries the 3-step convergence loop (launch → compare → merge)', () => {
    expect(pageSource).toContain('CONVERGENCE_STEPS');
    expect(pageSource).toContain('Launch. Compare. Merge.');
  });
});

describe('HomeLayout metadata (agrees with the hero + bid keywords)', () => {
  it('carries the convergence-aligned title/description/keywords', async () => {
    const { metadata } = await import('../layout');
    const title = String(metadata.title);
    const description = String(metadata.description);

    expect(title).toContain('Claude Code');
    expect(title).toContain('Codex');
    expect(title).toContain('Parallel');
    expect(title).toContain('One Trusted Merge');

    expect(description).toContain('convergence workspace for AI coding agents');
    expect(description).toContain('BYOK');
    expect(description.toLowerCase()).toContain('git worktree');
    expect(description.toLowerCase()).toContain('evidence-backed');
    // No fabricated / stale claim the page no longer makes.
    expect(description.toLowerCase()).not.toContain('voice');

    const keywords = metadata.keywords as string[] | undefined;
    expect(keywords).toBeDefined();
    expect(keywords).toContain('Claude Code');
    expect(keywords).toContain('bring your own API key');
    expect(keywords).toContain('merge parallel agent diffs');
  });
});
