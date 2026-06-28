import { z } from 'zod';

/**
 * A parsed semantic version. Pre-release / build metadata are kept verbatim so
 * a render is loss-less. Comparison follows the SemVer 2.0.0 precedence rules
 * for the numeric core (we do not order pre-release identifiers beyond core).
 */
export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
  readonly build?: string;
  readonly raw: string;
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/;

/**
 * Parse a semantic version. Returns `null` on malformed input — callers decide
 * whether a missing version is fatal (release pipeline) or skippable.
 */
export function parseSemVer(input: string): SemVer | null {
  const trimmed = input.trim().replace(/^v/, '');
  const m = SEMVER_RE.exec(trimmed);
  if (!m) return null;
  const [, major, minor, patch, prerelease, build] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    ...(prerelease !== undefined ? { prerelease } : {}),
    ...(build !== undefined ? { build } : {}),
    raw: trimmed,
  };
}

/** Parse or throw — used in pipelines where a missing version is a hard defect. */
export function requireSemVer(input: string): SemVer {
  const v = parseSemVer(input);
  if (!v) throw new Error(`invalid semver: ${JSON.stringify(input)}`);
  return v;
}

/**
 * Compare numeric cores. Returns -1 / 0 / 1. A version WITH a prerelease is
 * lower-precedence than the same core without one (SemVer §11).
 */
export function compareSemVer(a: SemVer, b: SemVer): -1 | 0 | 1 {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] < b[k]) return -1;
    if (a[k] > b[k]) return 1;
  }
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (ap && !bp) return -1;
  if (!ap && bp) return 1;
  if (ap && bp) {
    if (ap < bp) return -1;
    if (ap > bp) return 1;
  }
  return 0;
}

export function formatSemVer(v: SemVer): string {
  let s = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) s += `-${v.prerelease}`;
  if (v.build) s += `+${v.build}`;
  return s;
}

export const SemVerSchema = z
  .string()
  .refine((s) => parseSemVer(s) !== null, { message: 'invalid semver' });
