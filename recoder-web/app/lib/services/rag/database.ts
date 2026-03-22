import { createSql } from "~/lib/.server/db/pg-pool";
import type { DatabaseConfig } from "./types";

/**
 * Database client type that supports raw SQL with parameters
 */
export interface NeonClient {
  /**
   * Execute a SQL query with parameters
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Pool manager for Neon database connections (singleton per connection string)
 */
const connections = new Map<string, NeonClient>();

function getConnection(config: DatabaseConfig): NeonClient {
  const key = config.connectionString;

  let connection = connections.get(key);
  if (!connection) {
    const sql = createSql(config.connectionString);

    // Wrap the Neon function to support raw SQL with parameters
    connection = {
      async query<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]> {
        // Use the tagged template literal API with a workaround for raw SQL
        // Neon serverless expects template literals, so we construct one dynamically
        if (!params || params.length === 0) {
          return sql.call(null, [query] as unknown as TemplateStringsArray) as Promise<T[]>;
        }

        // For parameterized queries, we need to use sql.query or reconstruct the template
        // The neon function supports a second form: sql(strings, ...values)
        // where strings is an array of string parts and values are the interpolated values
        const parts = query.split(/\$\d+/);
        const result = sql.call(null, parts as unknown as TemplateStringsArray, ...params);
        return result as Promise<T[]>;
      },
    };

    connections.set(key, connection);
  }

  return connection;
}

function closeAllConnections(): void {
  // Neon serverless doesn't require explicit connection closing
  connections.clear();
}

function closeConnection(connectionString: string): void {
  connections.delete(connectionString);
}

export const PoolManager = {
  getPool: getConnection,
  getConnection,
  closeAll: closeAllConnections,
  close: closeConnection,
};

/**
 * Registry for pgvector type registration (not needed for Neon serverless,
 * but kept for API compatibility)
 */
const registeredPools = new Set<string>();

function createPoolIdentifier(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || 5432}/${url.pathname.slice(1)}`;
  } catch {
    return connectionString;
  }
}

/**
 * Ensure pgvector types are registered.
 * For Neon serverless, pgvector extension must be enabled in the database.
 */
export async function ensurePgVectorTypes(
  _client: NeonClient,
  connectionString: string
): Promise<void> {
  const poolIdentifier = createPoolIdentifier(connectionString);

  if (!registeredPools.has(poolIdentifier)) {
    // For Neon serverless, we just mark as registered
    // The pgvector extension must be enabled in the Neon dashboard
    registeredPools.add(poolIdentifier);
  }
}

/**
 * Clear the pgvector registration cache (for testing)
 */
export function clearPgVectorCache(): void {
  registeredPools.clear();
}

/**
 * Fixed column names for embedding-related data
 */
export const EMBEDDING_COLUMNS = {
  VECTOR: "embedding",
  PROFILE_ID: "embedding_profile_id",
  DIMENSIONS: "embedding_dimensions",
} as const;

/**
 * Escape an identifier (table/column name) for safe SQL usage
 */
export function escapeIdentifier(identifier: string): string {
  // Double any double quotes and wrap in double quotes
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Convert a vector to SQL format for pgvector
 */
export function vectorToSql(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
