/**
 * PostgreSQL connection pool using standard pg driver.
 * Drop-in replacement for @neondatabase/serverless neon() function.
 * Works with any PostgreSQL server (local, Neon, Supabase, etc).
 */

import pg from 'pg';

const { Pool } = pg;

const pools = new Map<string, pg.Pool>();

function getPool(connectionString: string): pg.Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pools.set(connectionString, pool);
  }
  return pool;
}

/**
 * Creates a tagged template literal function compatible with
 * the @neondatabase/serverless neon() API.
 *
 * Usage:
 *   const sql = createSql(databaseUrl);
 *   const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
 */
export function createSql(connectionString: string) {
  const pool = getPool(connectionString);

  return async function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]> {
    // Build parameterized query: replace template holes with $1, $2, etc.
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        query += `$${i + 1}`;
      }
    }

    const result = await pool.query(query, values);
    return result.rows;
  };
}
