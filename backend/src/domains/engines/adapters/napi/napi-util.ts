/**
 * Tiny shared helpers for the napi engine adapters (openfang / tensorzero /
 * governance). Deliberately dependency-free: argument coercion off an untrusted
 * `Record<string, unknown>` (the MCP `args` / `EngineCall.input`), JSON parsing
 * that never throws, and a uniform error-message extractor.
 *
 * The napi engines speak JSON strings across the FFI boundary; these keep every
 * adapter's `invoke` degrade-safe (a malformed reply becomes a truthful error
 * object, never a thrown exception across the seam).
 */

/** The loose, untrusted shape an adapter receives as an operation's input. */
export type NapiArgs = Record<string, unknown>;

/** Read a required string arg (empty string when absent/wrong-typed). */
export function str(args: NapiArgs, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

/** Read an optional string arg (`null` when absent — matches the napi `?: string | null` params). */
export function optStr(args: NapiArgs, key: string): string | null {
  const value = args[key];
  return typeof value === 'string' ? value : null;
}

/** Read a string-array arg (filters non-strings; `[]` when absent). */
export function strArr(args: NapiArgs, key: string): string[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Read a boolean arg (`true` only when strictly `true`). */
export function bool(args: NapiArgs, key: string): boolean {
  return args[key] === true;
}

/** Read a finite number arg (`0` when absent/NaN). */
export function num(args: NapiArgs, key: string): number {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Read a JSON-string arg. The napi surface takes pre-serialized JSON strings
 * (manifests, workflows, events); callers may pass either a ready string or a
 * structured object we serialize here. Absent → `"{}"`. Never throws.
 */
export function jsonArg(args: NapiArgs, key: string): string {
  const value = args[key];
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '{}';
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

/** Parse a JSON string an engine returned; a non-object/parse failure is surfaced truthfully. */
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, error: `engine returned invalid JSON: ${raw.slice(0, 200)}` };
  }
}

/** Uniform error-message extraction for `catch (err: unknown)`. */
export function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
