/**
 * Unit tests for the cockpit ↔ @recoder/design-tokens bridge.
 *
 * These exercise the REAL token package (resolved to source via the vitest alias)
 * and the REAL apply logic — no production code is stubbed. The "root" is a minimal
 * test double that captures setProperty calls, mirroring the DOM seam used at
 * startup in main.tsx.
 */
import { describe, expect, it } from 'vitest';
import { colors } from '@recoder/design-tokens';
import { applyDesignTokens, buildTokenBindings } from './design-tokens';

/** Minimal HTMLElement-shaped double that records CSS custom properties. */
function makeRoot(): { el: HTMLElement; props: Map<string, string> } {
  const props = new Map<string, string>();
  const el = {
    style: {
      setProperty: (k: string, v: string) => {
        props.set(k, v);
      },
    },
  } as unknown as HTMLElement;
  return { el, props };
}

describe('buildTokenBindings', () => {
  it('maps cockpit semantic vars to canonical token values', () => {
    const bindings = new Map(buildTokenBindings());
    expect(bindings.get('--good')).toBe(colors.success);
    expect(bindings.get('--bad')).toBe(colors.error);
    expect(bindings.get('--warn')).toBe(colors.warning);
    expect(bindings.get('--accent')).toBe(colors.info);
    expect(bindings.get('--active')).toBe(colors.info);
    expect(bindings.get('--progress')).toMatch(/^hsl\(/);
  });

  it('only binds vars with a genuine canonical equivalent (no surface vars)', () => {
    const keys = buildTokenBindings().map(([k]) => k);
    // Cockpit-specific dark-chrome surface tokens stay in styles.css.
    expect(keys).not.toContain('--bg');
    expect(keys).not.toContain('--border');
    expect(keys).not.toContain('--text');
  });
});

describe('applyDesignTokens', () => {
  it('rebinds semantic custom properties onto the root element', () => {
    const { el, props } = makeRoot();
    const applied = applyDesignTokens(el);
    expect(applied).toBeGreaterThan(0);
    expect(props.get('--good')).toBe(colors.success);
    expect(props.get('--bad')).toBe(colors.error);
    expect(props.get('--brand-gradient')).toContain('linear-gradient');
  });

  it('is degrade-safe: returns 0 for a missing root (no throw)', () => {
    expect(applyDesignTokens(null)).toBe(0);
    expect(applyDesignTokens(undefined)).toBe(0);
  });

  it('is degrade-safe: swallows setProperty failures and returns 0', () => {
    const el = {
      style: {
        setProperty: () => {
          throw new Error('boom');
        },
      },
    } as unknown as HTMLElement;
    expect(applyDesignTokens(el)).toBe(0);
  });
});
