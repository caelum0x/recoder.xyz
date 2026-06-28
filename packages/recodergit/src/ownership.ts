import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OwnershipEntry, OwnershipMap } from './ownership-map';

/**
 * Build a real {@link OwnershipMap} from a repository.
 *
 * Strategy:
 *  1. If a CODEOWNERS file exists (in the standard locations), parse it into
 *     glob -> owners entries.
 *  2. Otherwise, derive a coarse ownership map from the top-level directory
 *     layout, attributing each top-level package/app directory to a synthetic
 *     team owner derived from its path. This keeps the map non-empty and useful
 *     for blast-radius reasoning even without an explicit CODEOWNERS file.
 */

/** Standard CODEOWNERS locations, in GitHub's precedence order. */
const CODEOWNERS_LOCATIONS = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'] as const;

async function readFirstExisting(repoRoot: string, locations: readonly string[]): Promise<string | null> {
  for (const location of locations) {
    try {
      return await fs.readFile(path.join(repoRoot, location), 'utf8');
    } catch {
      // try next
    }
  }
  return null;
}

/** Parse the contents of a CODEOWNERS file into ownership entries. */
export function parseCodeowners(contents: string): OwnershipEntry[] {
  const entries: OwnershipEntry[] = [];
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const tokens = line.split(/\s+/);
    const pattern = tokens[0];
    const owners = tokens.slice(1).filter((token) => token.length > 0);
    if (!pattern || owners.length === 0) {
      continue;
    }
    // Normalize a leading slash so it reads as a repo-relative glob.
    const pathGlob = pattern.startsWith('/') ? pattern.slice(1) : pattern;
    entries.push({ pathGlob, owners, source: 'codeowners' });
  }
  return entries;
}

/**
 * Derive coarse per-directory ownership from the indexed files when no
 * CODEOWNERS file is present. Each top-level directory becomes one entry owned
 * by a synthetic `@team/<dir>` owner.
 */
export function deriveOwnershipFromPaths(relativeFiles: readonly string[]): OwnershipEntry[] {
  const topLevel = new Set<string>();
  for (const file of relativeFiles) {
    const head = file.split('/')[0];
    if (head && head !== file) {
      topLevel.add(head);
    }
  }
  return [...topLevel].sort().map((dir) => ({
    pathGlob: `${dir}/**`,
    owners: [`@team/${dir}`],
    source: 'package' as const,
  }));
}

/** Build the ownership map for a repo, preferring CODEOWNERS over path heuristics. */
export async function buildOwnershipMap(
  repoRoot: string,
  relativeFiles: readonly string[],
): Promise<OwnershipMap> {
  const codeowners = await readFirstExisting(repoRoot, CODEOWNERS_LOCATIONS);
  if (codeowners) {
    const entries = parseCodeowners(codeowners);
    if (entries.length > 0) {
      return { entries };
    }
  }
  return { entries: deriveOwnershipFromPaths(relativeFiles) };
}
