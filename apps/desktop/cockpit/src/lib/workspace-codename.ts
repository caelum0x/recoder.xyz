/**
 * workspaceCodename — a friendly, STABLE codename for a workspace derived purely
 * from its id (e.g. `ws_ea6c7cc1-…` → "amber-otter"). Conductor-style: instead of
 * showing a raw UUID everywhere, every workspace gets a memorable two-word name.
 *
 * Pure + deterministic: the same id always yields the same codename, with zero
 * backend state or migration — it instantly labels every existing record. Derived
 * client-side; if we later want the codename inside the git branch name, the
 * backend can import the SAME algorithm so the two agree.
 */

// Curated, calm, unambiguous word lists. Sizes are coprime-ish and give
// 48 × 48 = 2304 combinations — plenty for a single user's workspaces.
const ADJECTIVES = [
  'amber', 'azure', 'brave', 'bright', 'calm', 'clever', 'coral', 'crimson',
  'crisp', 'dawn', 'deep', 'dusk', 'eager', 'early', 'emerald', 'fair',
  'gentle', 'golden', 'jade', 'keen', 'lively', 'lunar', 'mellow', 'merry',
  'nimble', 'noble', 'olive', 'plum', 'quiet', 'rapid', 'ruby', 'rustic',
  'sage', 'scarlet', 'silver', 'sleek', 'solar', 'spry', 'still', 'sunny',
  'swift', 'teal', 'tidy', 'vivid', 'warm', 'wise', 'witty', 'zesty',
];

const NOUNS = [
  'otter', 'falcon', 'maple', 'harbor', 'comet', 'willow', 'lynx', 'ember',
  'river', 'cedar', 'raven', 'meadow', 'quartz', 'heron', 'birch', 'summit',
  'canyon', 'delta', 'fern', 'grove', 'lark', 'marsh', 'orchid', 'pine',
  'reef', 'sparrow', 'thistle', 'vale', 'wren', 'aspen', 'badger', 'cove',
  'dune', 'finch', 'glade', 'hollow', 'ivy', 'juniper', 'kestrel', 'lotus',
  'moss', 'nettle', 'opal', 'petal', 'ridge', 'sage', 'tundra', 'vireo',
];

/** FNV-1a 32-bit hash — small, fast, stable across engines. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A stable two-word codename for a workspace id. Empty/missing ids degrade to a
 * generic "workspace" rather than throwing.
 */
export function workspaceCodename(workspaceId: string | null | undefined): string {
  const id = (workspaceId || '').trim();
  if (!id) return 'workspace';
  const hash = fnv1a(id);
  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adjective}-${noun}`;
}
