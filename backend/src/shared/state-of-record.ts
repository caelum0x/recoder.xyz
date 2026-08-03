/**
 * The sqlite-driver activation seam SHARED by agent-os and the conductor so
 * both flip to the embedded state-of-record in lockstep (lives in shared/
 * to honor the domain-boundary invariant — no domain imports another
 * domain's internals).
 */
export function envSqlitePath(): string | null {
  return process.env['RECODER_SQLITE_PATH']?.trim() || null;
}

/**
 * Returns the sqlite file path exactly when the sqlite driver would be
 * selected (no database url, a path configured), else `null`. Defensive
 * against the partial `AppConfig` fixtures conductor tests compose with
 * (no `database` slice ⇒ null).
 */
export function resolveStateOfRecordSqlitePath(app: {
  readonly database?: { readonly url?: string | null };
}): string | null {
  const databaseUrl = app.database?.url ?? null;
  const sqlitePath = envSqlitePath();
  return !databaseUrl && sqlitePath ? sqlitePath : null;
}
