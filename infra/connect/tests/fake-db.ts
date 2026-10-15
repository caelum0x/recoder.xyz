/**
 * A minimal fake matching the EXACT drizzle call shapes this package's
 * billing + device-link code uses (`select().from().where().limit()` or
 * `.where()` awaited directly, `insert().values()`, `update().set().where()`,
 * `delete().where()`). Not a real query engine — it does not evaluate
 * `where` predicates, so each test seeds `rows` with exactly the data
 * relevant to the account/id under test. This keeps the billing/entitlement/
 * device-link logic itself under real unit test without requiring a live
 * Postgres in CI.
 */
import type { ConnectDb } from '../src/db/client.js';

export interface FakeDb {
  readonly db: ConnectDb;
  readonly inserted: unknown[];
  readonly updated: unknown[];
  rows: Record<string, unknown>[];
  forceUniqueViolationOnNextInsert: boolean;
  /** `rowCount` reported by the NEXT `update()...where()` call (then reset). */
  nextUpdateRowCount: number;
  /** `rowCount` reported by the NEXT `delete()...where()` call (then reset). */
  nextDeleteRowCount: number;
}

/** A Promise that also exposes `.limit()` (itself awaitable), so both
 * `await db.select()...where(cond)` and `...where(cond).limit(n)` resolve —
 * `listDevices` uses the former, everything else here uses the latter. */
function awaitableRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> & { limit: (n: number) => Promise<Record<string, unknown>[]> } {
  const promise = Promise.resolve(rows) as Promise<Record<string, unknown>[]> & { limit: (n: number) => Promise<Record<string, unknown>[]> };
  promise.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return promise;
}

export function createFakeDb(initialRows: Record<string, unknown>[] = []): FakeDb {
  const state: FakeDb = {
    db: undefined as unknown as ConnectDb,
    inserted: [],
    updated: [],
    rows: [...initialRows],
    forceUniqueViolationOnNextInsert: false,
    nextUpdateRowCount: 1,
    nextDeleteRowCount: 0,
  };

  const fake = {
    select: (_columns?: unknown) => ({
      from: (_table?: unknown) => ({
        where: (_cond?: unknown) => awaitableRows(state.rows),
      }),
    }),
    insert: (_table?: unknown) => ({
      values: async (obj: unknown) => {
        if (state.forceUniqueViolationOnNextInsert) {
          state.forceUniqueViolationOnNextInsert = false;
          const error = new Error('duplicate key value violates unique constraint') as Error & { code: string };
          error.code = '23505';
          throw error;
        }
        state.inserted.push(obj);
        state.rows.push(obj as Record<string, unknown>);
        return { rowCount: 1 };
      },
    }),
    update: (_table?: unknown) => ({
      set: (obj: unknown) => ({
        where: async (_cond?: unknown) => {
          state.updated.push(obj);
          const rowCount = state.nextUpdateRowCount;
          state.nextUpdateRowCount = 1;
          return { rowCount };
        },
      }),
    }),
    delete: (_table?: unknown) => ({
      where: async (_cond?: unknown) => {
        const rowCount = state.nextDeleteRowCount;
        state.nextDeleteRowCount = 0;
        return { rowCount };
      },
    }),
  };

  (state as { db: ConnectDb }).db = fake as unknown as ConnectDb;
  return state;
}
