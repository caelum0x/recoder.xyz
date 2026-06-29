/**
 * Cockpit ↔ @recoder/design-tokens bridge.
 *
 * The cockpit ships its own dark, dense theme (`styles.css`) whose surface colors
 * (`--bg`, `--border`, `--text`) are cockpit-specific and have no shared equivalent.
 * Its *semantic* colors (success / error / warning / info / brand) DO overlap the
 * canonical Recoder token set, and were previously hard-coded as ad-hoc hex.
 *
 * This module imports the shared token package in-process and rebinds the cockpit's
 * semantic CSS custom properties to the canonical values at startup, so the cockpit
 * consumes one source of truth instead of drifting hex literals.
 *
 * Degrade-safe: if the token package is unavailable or anything throws, the cockpit
 * keeps the fallback values already declared in `styles.css`.
 */
import { colorHSL, colors, gradients } from '@recoder/design-tokens';

/** A cockpit semantic CSS var name mapped to a canonical token value. */
type TokenBinding = readonly [cssVar: string, value: string];

/** `hsl(...)` wrapper for the space-separated HSL channel tokens. */
function hsl(channels: string): string {
  return `hsl(${channels})`;
}

/**
 * Build the cockpit semantic-color bindings from the canonical token set.
 *
 * Only colors with a genuine canonical equivalent are mapped. Cockpit surface
 * tokens (`--bg*`, `--border*`, `--text*`, `--mono`) are intentionally left to
 * `styles.css` — there is no shared token for the cockpit's dark chrome.
 */
export function buildTokenBindings(): TokenBinding[] {
  return [
    ['--good', colors.success], // canonical success green
    ['--bad', colors.error], // canonical error red
    ['--warn', colors.warning], // canonical warning amber
    ['--accent', colors.info], // canonical info blue
    ['--active', colors.info],
    ['--progress', hsl(colorHSL.purple[400])], // canonical brand purple
  ];
}

/**
 * Apply the canonical design tokens onto the cockpit root element.
 *
 * Runs at startup on the cockpit's own call stack. Never throws: on any failure
 * it logs and returns, leaving the `styles.css` defaults in place.
 *
 * @returns the number of CSS custom properties actually rebound (0 on fallback).
 */
export function applyDesignTokens(root: HTMLElement | null | undefined): number {
  if (!root) return 0;
  try {
    const bindings = buildTokenBindings();
    let applied = 0;
    for (const [cssVar, value] of bindings) {
      if (typeof value === 'string' && value.length > 0) {
        root.style.setProperty(cssVar, value);
        applied += 1;
      }
    }
    // Brand mark gradient — keep the cockpit's accent→progress feel but source
    // the canonical brand gradient when available.
    if (gradients.primary) {
      root.style.setProperty('--brand-gradient', gradients.primary);
    }
    return applied;
  } catch (err) {
    // Degrade-safe: cockpit keeps styles.css fallback values.
    // eslint-disable-next-line no-console
    console.warn('[cockpit] design-tokens unavailable, using styles.css fallback:', err);
    return 0;
  }
}
