import type { Config } from 'drizzle-kit';

/**
 * `pnpm db:generate` diffs src/db/schema.ts against drizzle/ and writes a new
 * migration. The actual connection string is only needed for `db:push`
 * (direct dev sync) — CI/build never needs a live DB.
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.RECODER_CONNECT_DATABASE_URL ?? 'postgresql://localhost:5432/recoder_connect',
  },
} satisfies Config;
