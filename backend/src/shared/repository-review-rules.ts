/** Canonical parser for repository-owned `.recoder/review-rules.json`. */
export interface RepositoryReviewRule {
  readonly id: string;
  readonly level: 'required' | 'advisory';
  readonly text: string;
  readonly source: string;
  /** Exact name from `.recoder/checks.json`, when this rule is executable. */
  readonly check?: string;
}

const MAX_RULES = 30;

/**
 * Parse the versioned JSON contract once for every product consumer. Invalid rows
 * are omitted and duplicate ids are first-wins, matching the review surface.
 */
export function parseRepositoryReviewRulesJson(
  content: string,
  source = '.recoder/review-rules.json',
): readonly RepositoryReviewRule[] {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return [];
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.rules)) return [];
  const seen = new Set<string>();
  return row.rules.flatMap((item): RepositoryReviewRule[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const rule = item as Record<string, unknown>;
    const id = typeof rule.id === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(rule.id.trim())
      ? rule.id.trim()
      : '';
    const level = rule.level === 'required' || rule.level === 'advisory' ? rule.level : null;
    const text = typeof rule.text === 'string' ? rule.text.trim().slice(0, 1_000) : '';
    const check = typeof rule.check === 'string' ? rule.check.trim().slice(0, 200) : '';
    if (!id || !level || !text || seen.has(id)) return [];
    seen.add(id);
    return [{ id, level, text, source, ...(check ? { check } : {}) }];
  }).slice(0, MAX_RULES);
}
