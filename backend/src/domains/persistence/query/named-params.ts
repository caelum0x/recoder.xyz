/**
 * `:param` → `$n` compiler. Translates a named-parameter SQL string plus a
 * params object into positional Postgres SQL + an ordered values array. This is
 * the ONLY place named binding happens; every executor path goes through it so
 * raw string interpolation never reaches the driver.
 *
 * Rules:
 *  - `:name` (word chars) is replaced by `$n` in first-seen order; a repeated
 *    `:name` reuses the same positional index (bind once, reference many).
 *  - An array value expands to a parenthesised list for `IN (:ids)` →
 *    `IN ($1, $2, ...)`; an empty array expands to `(null)` (matches nothing).
 *  - `::type` casts and `:name` inside a string/dollar-quoted literal are left
 *    untouched.
 *  - A referenced `:name` with no matching param throws; an unused param throws
 *    (fail fast — a typo must not silently bind the wrong column).
 */

export interface CompiledQuery {
  /** Positional SQL ready for `pg`. */
  readonly text: string;
  /** Ordered bind values matching `$1..$n`. */
  readonly values: unknown[];
}

/** Matches a `:name` placeholder that is NOT part of a `::cast`. */
const PARAM_PATTERN = /::?[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * Compile a `:param` query. Throws on a missing or unused parameter so a typo
 * fails loudly at the call site instead of silently mis-binding.
 */
export function compileNamedQuery(sql: string, params: Readonly<Record<string, unknown>> = {}): CompiledQuery {
  const values: unknown[] = [];
  const indexByName = new Map<string, number>();
  const referenced = new Set<string>();

  const masked = maskLiterals(sql);

  const text = sql.replace(PARAM_PATTERN, (token, offset: number) => {
    // `::type` casts start with two colons — leave them intact.
    if (token.startsWith('::')) return token;
    // Inside a string / dollar-quoted literal → not a placeholder.
    if (masked[offset] !== sql[offset]) return token;

    const name = token.slice(1);
    referenced.add(name);

    if (!(name in params)) {
      throw new Error(`Missing bind parameter ":${name}"`);
    }
    const value = params[name];

    // Array → expand to a positional list for IN (...) style predicates.
    if (Array.isArray(value)) {
      if (value.length === 0) return '(null)';
      const placeholders = value.map((item) => {
        values.push(item);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    }

    // Scalar → reuse an existing index when the same name recurs.
    const existing = indexByName.get(name);
    if (existing !== undefined) return `$${existing}`;
    values.push(value);
    const index = values.length;
    indexByName.set(name, index);
    return `$${index}`;
  });

  // Fail fast on an unreferenced param (likely a typo in the SQL).
  for (const key of Object.keys(params)) {
    if (!referenced.has(key)) {
      throw new Error(`Unused bind parameter ":${key}" (not referenced in SQL)`);
    }
  }

  return { text, values };
}

/**
 * Produce a copy of `sql` where the contents of single-quoted strings and
 * dollar-quoted literals are replaced by spaces, so a `:name` that lives inside
 * a literal is not mistaken for a placeholder. Positions are preserved.
 */
function maskLiterals(sql: string): string {
  const out = sql.split('');
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    // Single-quoted string literal (handles '' escapes).
    if (ch === "'") {
      out[i] = ' ';
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          out[i] = ' ';
          i++;
          break;
        }
        out[i] = ' ';
        i++;
      }
      continue;
    }
    // Dollar-quoted literal: $tag$ ... $tag$.
    if (ch === '$') {
      const tagMatch = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        for (let j = i; j < stop; j++) out[j] = ' ';
        i = stop;
        continue;
      }
    }
    i++;
  }
  return out.join('');
}
