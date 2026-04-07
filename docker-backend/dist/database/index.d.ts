/**
 * Database Module
 * Secure database exploration and query execution
 *
 * SECURITY OVERVIEW:
 * - All queries use parameterized statements (NEVER concatenates user input)
 * - Credentials are encrypted at rest using AES-256-GCM
 * - Input validation on all identifiers (table names, column names, etc.)
 * - Connection pooling with timeout cleanup
 * - Audit logging for all database operations
 * - Path traversal protection for SQLite files
 */
export { connectionManager, ConnectionManager, encryptCredential, decryptCredential, type DatabaseConnection, type DatabaseType, type ConnectionParams, type PostgresConnectionParams, type SqliteConnectionParams, type EncryptedCredentials, } from './connection-manager.js';
export { queryExecutor, QueryExecutor, analyzeQuery, type QueryRequest, type QueryResult, type QueryAnalysis, } from './query-executor.js';
export { schemaInspector, SchemaInspector, type TableInfo, type ColumnInfo, type IndexInfo, type ForeignKeyInfo, type SchemaOverview, type TableDetails, } from './schema-inspector.js';
export { PostgresDriver, type PostgresConfig } from './drivers/postgresql.js';
export { SqliteDriver, type SqliteConfig } from './drivers/sqlite.js';
