/**
 * `MigrationRunner` — applies the ordered `backend/migrations/*.sql` set against
 * the shared pool, recording each applied file in the `core._recoder_migrations`
 * ledger. Idempotent (already-applied files are skipped) and degrade-safe (a
 * failure is reported, never thrown into boot).
 */
import type { MigrationReport, MigrationStatus } from '../types.js';

export interface MigrationRunner {
  /** Apply every pending migration file in lexical order. Never throws. */
  apply(): Promise<MigrationReport>;
  /** Report which files are applied vs pending without applying anything. */
  status(): Promise<MigrationStatus>;
}
