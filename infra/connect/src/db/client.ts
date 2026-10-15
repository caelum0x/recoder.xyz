/**
 * Postgres access through Hyperdrive — same shape as
 * bidstage-tenders/lib/db.ts (box Postgres via Workers VPC + tunnel). Workers
 * must go through the Hyperdrive binding; a bare Node process (migrations,
 * the Dodo product-sync script) connects with `RECODER_CONNECT_DATABASE_URL`
 * instead. Both paths funnel through drizzle so query code never cares which
 * one it's on.
 */
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import type { ConnectEnv } from '../env.js';

export type ConnectDb = NodePgDatabase<typeof schema>;

const pools = new WeakMap<ConnectEnv, Pool>();

/** One pooled connection per Worker isolate, keyed by the env object identity
 * (Cloudflare reuses the isolate across requests; a fresh `env` per request
 * would otherwise leak a new Pool per request). */
function poolFor(env: ConnectEnv): Pool {
  const existing = pools.get(env);
  if (existing) return existing;
  const pool = new Pool({
    connectionString: env.HYPERDRIVE.connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pools.set(env, pool);
  return pool;
}

export function connectDb(env: ConnectEnv): ConnectDb {
  return drizzle(poolFor(env), { schema });
}

/** Node-only pool for migrations/scripts — never used from the Worker. */
export function nodeMigrationDb(databaseUrl: string): ConnectDb {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: true } : undefined,
  });
  return drizzle(pool, { schema });
}
