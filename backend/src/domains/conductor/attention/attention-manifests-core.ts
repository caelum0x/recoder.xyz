/**
 * Attention manifest engine PRIMITIVES — the region readers, matcher
 * combinators, and {@link RuleSpec} shape shared by the engine
 * ({@link ./attention-manifests.ts}) and the per-agent rule corpus
 * ({@link ./attention-manifests-agents.ts}).
 *
 * This module has NO sibling imports, so the engine and the agent rulesets can
 * both depend on it without a circular dependency (engine -> core, engine ->
 * agents -> core). The engine re-exports everything here to keep its public
 * surface unchanged.
 *
 * ATTRIBUTION (Apache-2.0): the region/matcher/priority model and the rules that
 * consume it are ported from herdr's terminal detection manifests
 * (github.com/herdrdev/herdr, licensed Apache-2.0), re-expressed in Recoder's
 * own {@link AttentionState} vocabulary. See {@link ./attention-manifests.ts}
 * for the full attribution and the truthfulness invariant.
 */
import type { AttentionState } from '../types.js';

// --- context ----------------------------------------------------------------

/** The captured surfaces a rule region can slice. */
export interface TailContext {
  /** The recent terminal tail (raw text, newest content at the bottom). */
  readonly tail: string;
  /** The OSC window title, when the substrate captured one (`''` if absent). */
  readonly oscTitle: string;
}

/** How many trailing tail lines the engine considers (bounds regex cost). */
export const MAX_RECENT_LINES = 120;

// --- regions ----------------------------------------------------------------

/** A region selects a slice of the captured context for a matcher to read. */
export type Region = (ctx: TailContext) => string;

function splitLines(text: string): readonly string[] {
  return text.split('\n').map(line => line.replace(/\r$/, ''));
}

function nonEmptyIndices(lines: readonly string[]): readonly number[] {
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.trim() !== '') indices.push(i);
  }
  return indices;
}

/** The whole recent tail window. */
export function wholeRecent(ctx: TailContext): string {
  return ctx.tail;
}

/** The OSC window title (empty string when the substrate captured none). */
export function oscTitle(ctx: TailContext): string {
  return ctx.oscTitle;
}

/** The last `n` NON-EMPTY lines through the end of the tail. */
export function bottomLines(n: number): Region {
  return ctx => {
    const lines = splitLines(ctx.tail);
    const indices = nonEmptyIndices(lines);
    if (indices.length === 0) return '';
    const start = indices[Math.max(0, indices.length - n)]!;
    return lines.slice(start).join('\n');
  };
}

/** The first `n` NON-EMPTY lines from the start of the tail. */
export function topLines(n: number): Region {
  return ctx => {
    const lines = splitLines(ctx.tail);
    const indices = nonEmptyIndices(lines);
    if (indices.length === 0) return '';
    const end = indices[Math.min(indices.length, n) - 1]!;
    return lines.slice(0, end + 1).join('\n');
  };
}

/** Everything AFTER the last horizontal-rule line (the whole tail if none). */
export function afterLastHorizontalRule(ctx: TailContext): string {
  const lines = splitLines(ctx.tail);
  let lastRule = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (isHorizontalRule(lines[i]!)) lastRule = i;
  }
  if (lastRule < 0) return ctx.tail;
  return lines.slice(lastRule + 1).join('\n');
}

/** The body of the bottom-most prompt box (between its two border rules). */
export function promptBoxBody(ctx: TailContext): string {
  const lines = splitLines(ctx.tail);
  const top = promptBoxTopBorderIndex(lines);
  if (top == null) return '';
  let end = lines.length;
  for (let i = top + 1; i < lines.length; i += 1) {
    if (isHorizontalRule(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(top + 1, end).join('\n');
}

function promptBoxTopBorderIndex(lines: readonly string[]): number | null {
  let count = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isHorizontalRule(lines[i]!)) {
      count += 1;
      if (count === 2) return i;
    }
  }
  return null;
}

function isHorizontalRule(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  const chars = [...trimmed];
  let ruleChars = 0;
  for (const ch of chars) {
    if (ch === '─') ruleChars += 1;
    else break;
  }
  if (ruleChars === 0) return false;
  const suffix = chars.slice(ruleChars).join('').replace(/^\s+/, '');
  return suffix === '' || ruleChars >= 3;
}

/** Slice the tail to the trailing {@link MAX_RECENT_LINES} lines. */
export function recentWindow(tail: string): string {
  const lines = splitLines(tail);
  return lines.slice(-MAX_RECENT_LINES).join('\n');
}

// --- matchers ---------------------------------------------------------------

/** A matcher is a pure predicate over a region's sliced text. */
export type Matcher = (text: string) => boolean;

/** True when the text contains ALL needles (case-insensitive). */
export function contains(...needles: readonly string[]): Matcher {
  const lowered = needles.map(needle => needle.toLowerCase());
  return text => {
    const haystack = text.toLowerCase();
    return lowered.every(needle => haystack.includes(needle));
  };
}

/** True when the pattern matches anywhere in the region text. */
export function regex(pattern: RegExp): Matcher {
  return text => pattern.test(text);
}

/** True when the pattern matches at least one line of the region text. */
export function lineRegex(pattern: RegExp): Matcher {
  return text => text.split('\n').some(line => pattern.test(line));
}

/** True when the pattern matches AT LEAST `count` distinct lines. */
export function lineRegexAtLeast(pattern: RegExp, count: number): Matcher {
  return text =>
    text.split('\n').filter(line => pattern.test(line)).length >= count;
}

/** True when EVERY nested matcher matches. */
export function all(...matchers: readonly Matcher[]): Matcher {
  return text => matchers.every(matcher => matcher(text));
}

/** True when AT LEAST ONE nested matcher matches. */
export function any(...matchers: readonly Matcher[]): Matcher {
  return text => matchers.some(matcher => matcher(text));
}

/** True when the nested matcher does NOT match. */
export function not(matcher: Matcher): Matcher {
  return text => !matcher(text);
}

// --- rule spec --------------------------------------------------------------

/** A single declarative detection rule. */
export interface RuleSpec {
  /** Stable identifier surfaced in the classifier reason for auditing. */
  readonly id: string;
  /** The attention this rule asserts when it matches. */
  readonly state: AttentionState;
  /** Higher wins; ties resolve to the first rule in evaluation order. */
  readonly priority: number;
  /** The tail slice this rule reads. */
  readonly region: Region;
  /** The predicate over the sliced text. */
  readonly matcher: Matcher;
  /**
   * When true, a match marks a transcript/menu screen that carries NO
   * attention signal — the engine returns `skip`, and the classifier stays
   * truthfully `'unknown'` instead of guessing.
   */
  readonly skipStateUpdate?: boolean;
}
