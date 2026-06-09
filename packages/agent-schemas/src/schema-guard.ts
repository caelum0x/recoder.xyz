export type SchemaIssue = {
  path: string;
  message: string;
};

export type SchemaResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: SchemaIssue[] };

export type SchemaGuard<T> = {
  readonly name: string;
  parse(value: unknown): SchemaResult<T>;
};

export function ok<T>(value: T): SchemaResult<T> {
  return { ok: true, value };
}

export function fail(path: string, message: string): SchemaResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireString(value: Record<string, unknown>, key: string): SchemaIssue | null {
  return typeof value[key] === 'string' && value[key].length > 0
    ? null
    : { path: key, message: 'Expected a non-empty string.' };
}

export function requireArray(value: Record<string, unknown>, key: string): SchemaIssue | null {
  return Array.isArray(value[key])
    ? null
    : { path: key, message: 'Expected an array.' };
}

export function collectIssues<T>(
  value: unknown,
  name: string,
  checks: Array<(record: Record<string, unknown>) => SchemaIssue | null>,
): SchemaResult<T> {
  if (!isRecord(value)) {
    return fail(name, 'Expected an object.');
  }

  const issues = checks
    .map((check) => check(value))
    .filter((issue): issue is SchemaIssue => issue !== null);

  return issues.length > 0 ? { ok: false, issues } : ok(value as T);
}
