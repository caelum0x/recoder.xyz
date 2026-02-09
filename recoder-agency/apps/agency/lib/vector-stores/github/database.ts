import type { DatabaseConfig } from "@giselles-ai/rag";

/**
 * Create database configuration for PostgreSQL connection
 */
export function createDatabaseConfig(): DatabaseConfig {
	const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
	if (!postgresUrl) {
		throw new Error(
			"DATABASE_URL (or POSTGRES_URL) environment variable is required",
		);
	}
	return { connectionString: postgresUrl };
}
