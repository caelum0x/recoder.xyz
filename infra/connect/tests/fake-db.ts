/**
 * A minimal fake matching the EXACT drizzle call shapes this package's
 * billing code uses (`select().from().where().limit()`,
 * `insert().values()`, `update().set().where()`). Not a real query engine —
 * it does not evaluate `where` predicates, so each test seeds `rows` with
 * exactly the data relevant to the account/id under test. This keeps the
 * billing/entitlement logic itself under real unit test without requiring a
 * live Postgres in CI.
 */
import type { ConnectDb } from '../src/db/client.js';

export interface FakeDb {
  readonly db: ConnectDb;
  readonly inserted: unknown[];
  readonly updated: unknown[];
  rows: Record<string, unknown>[];
  forceUniqueViolationOnNextInsert: boolean;
}

export function createFakeDb(initialRows: Record<string, unknown>[] = []): FakeDb {
  const state: FakeDb = {
    db: undefined as unknown as ConnectDb,
    inserted: [],
    updated: [],
    rows: [...initialRows],
    forceUniqueViolationOnNextInsert: false,
  };

  const fake = {
    select: (_columns?: unknown) => ({
      from: (_table?: unknown) => ({
        where: (_cond?: unknown) => ({
          limit: async (n: number) => state.rows.slice(0, n),
        }),
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
      },
    }),
    update: (_table?: unknown) => ({
      set: (obj: unknown) => ({
        where: async (_cond?: unknown) => {
          state.updated.push(obj);
        },
      }),
    }),
  };

  (state as { db: ConnectDb }).db = fake as unknown as ConnectDb;
  return state;
}
