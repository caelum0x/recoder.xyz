"use strict";
/**
 * PostgreSQL Driver Wrapper
 * Provides a secure interface for PostgreSQL database operations
 *
 * SECURITY: Uses parameterized queries ONLY - never concatenates user input
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDriver = void 0;
exports.validateIdentifier = validateIdentifier;
exports.validateQuery = validateQuery;
const pg_1 = require("pg");
// ============================================
// Input Validation
// ============================================
const MAX_QUERY_LENGTH = 100000; // 100KB max query
const MAX_IDENTIFIER_LENGTH = 128;
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
/**
 * Validate and sanitize a database identifier (table name, column name, etc.)
 * SECURITY: Prevents SQL injection through identifier names
 */
function validateIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
        return { valid: false, error: 'Identifier is required' };
    }
    const trimmed = identifier.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Identifier cannot be empty' };
    }
    if (trimmed.length > MAX_IDENTIFIER_LENGTH) {
        return { valid: false, error: `Identifier too long (max ${MAX_IDENTIFIER_LENGTH} chars)` };
    }
    // Check for valid SQL identifier format
    if (!IDENTIFIER_REGEX.test(trimmed)) {
        return { valid: false, error: 'Invalid identifier format. Use only letters, numbers, and underscores, starting with a letter or underscore.' };
    }
    // Lowercase for consistency
    return { valid: true, sanitized: trimmed.toLowerCase() };
}
/**
 * Validate query length
 */
function validateQuery(query) {
    if (!query || typeof query !== 'string') {
        return { valid: false, error: 'Query is required' };
    }
    if (query.length > MAX_QUERY_LENGTH) {
        return { valid: false, error: `Query too long (max ${MAX_QUERY_LENGTH} chars)` };
    }
    return { valid: true };
}
// ============================================
// PostgreSQL Driver Class
// ============================================
class PostgresDriver {
    pool = null;
    config;
    isConnected = false;
    constructor(config) {
        // SECURITY: Validate config values
        if (!config.host || typeof config.host !== 'string') {
            throw new Error('Invalid host configuration');
        }
        if (!config.database || typeof config.database !== 'string') {
            throw new Error('Invalid database configuration');
        }
        if (!config.user || typeof config.user !== 'string') {
            throw new Error('Invalid user configuration');
        }
        this.config = {
            ...config,
            port: Math.min(Math.max(1, config.port || 5432), 65535),
            connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
            idleTimeoutMillis: config.idleTimeoutMillis || 30000,
            max: Math.min(config.max || 5, 20), // Limit pool size
        };
    }
    /**
     * Connect to the database
     */
    async connect() {
        if (this.isConnected && this.pool) {
            return;
        }
        const poolConfig = {
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
            ssl: this.config.ssl,
            connectionTimeoutMillis: this.config.connectionTimeoutMillis,
            idleTimeoutMillis: this.config.idleTimeoutMillis,
            max: this.config.max,
        };
        this.pool = new pg_1.Pool(poolConfig);
        // Test connection
        const client = await this.pool.connect();
        try {
            await client.query('SELECT 1');
            this.isConnected = true;
        }
        finally {
            client.release();
        }
    }
    /**
     * Disconnect from the database
     */
    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
        }
    }
    /**
     * Check if connected
     */
    isActive() {
        return this.isConnected && this.pool !== null;
    }
    /**
     * Execute a parameterized query
     * SECURITY: ONLY accepts parameterized queries - values are NEVER concatenated
     */
    async query(text, values = []) {
        if (!this.pool) {
            throw new Error('Not connected to database');
        }
        // Validate query
        const queryValidation = validateQuery(text);
        if (!queryValidation.valid) {
            throw new Error(queryValidation.error);
        }
        // Execute with parameterized values
        const result = await this.pool.query({
            text,
            values,
        });
        return {
            rows: result.rows,
            rowCount: result.rowCount || 0,
            fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        };
    }
    /**
     * Get list of tables in the database
     * SECURITY: Uses system catalog with parameterized queries
     */
    async getTables(schema = 'public') {
        // Validate schema name
        const schemaValidation = validateIdentifier(schema);
        if (!schemaValidation.valid) {
            throw new Error(schemaValidation.error);
        }
        const result = await this.query(`SELECT table_name, table_schema, table_type
       FROM information_schema.tables
       WHERE table_schema = $1
       AND table_type IN ('BASE TABLE', 'VIEW')
       ORDER BY table_name`, [schemaValidation.sanitized]);
        return result.rows.map((row) => ({
            name: row.table_name,
            schema: row.table_schema,
            type: row.table_type === 'BASE TABLE' ? 'table' : 'view',
        }));
    }
    /**
     * Get table schema (columns) information
     * SECURITY: Uses parameterized queries against system catalogs
     */
    async getTableSchema(tableName, schema = 'public') {
        // Validate identifiers
        const tableValidation = validateIdentifier(tableName);
        const schemaValidation = validateIdentifier(schema);
        if (!tableValidation.valid) {
            throw new Error(`Invalid table name: ${tableValidation.error}`);
        }
        if (!schemaValidation.valid) {
            throw new Error(`Invalid schema name: ${schemaValidation.error}`);
        }
        // Get column information from information_schema
        const columnsResult = await this.query(`SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`, [schemaValidation.sanitized, tableValidation.sanitized]);
        // Get primary key information
        const pkResult = await this.query(`SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = $1
         AND tc.table_name = $2`, [schemaValidation.sanitized, tableValidation.sanitized]);
        const primaryKeys = new Set(pkResult.rows.map((r) => r.column_name));
        // Get foreign key information
        const fkResult = await this.query(`SELECT
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1
         AND tc.table_name = $2`, [schemaValidation.sanitized, tableValidation.sanitized]);
        const foreignKeys = new Map();
        for (const fk of fkResult.rows) {
            foreignKeys.set(fk.column_name, {
                table: fk.foreign_table_name,
                column: fk.foreign_column_name,
            });
        }
        return columnsResult.rows.map((col) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === 'YES',
            defaultValue: col.column_default,
            isPrimaryKey: primaryKeys.has(col.column_name),
            isForeignKey: foreignKeys.has(col.column_name),
            references: foreignKeys.get(col.column_name),
        }));
    }
    /**
     * Get indexes for a table
     * SECURITY: Uses parameterized queries
     */
    async getIndexes(tableName, schema = 'public') {
        const tableValidation = validateIdentifier(tableName);
        const schemaValidation = validateIdentifier(schema);
        if (!tableValidation.valid) {
            throw new Error(`Invalid table name: ${tableValidation.error}`);
        }
        if (!schemaValidation.valid) {
            throw new Error(`Invalid schema name: ${schemaValidation.error}`);
        }
        const result = await this.query(`SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = $1 AND tablename = $2`, [schemaValidation.sanitized, tableValidation.sanitized]);
        return result.rows.map((row) => {
            const isUnique = row.indexdef.toUpperCase().includes('UNIQUE');
            const isPrimary = row.indexname.endsWith('_pkey');
            // Extract column names from index definition
            const columnsMatch = row.indexdef.match(/\(([^)]+)\)/);
            const columns = columnsMatch
                ? columnsMatch[1].split(',').map((c) => c.trim().replace(/"/g, ''))
                : [];
            return {
                name: row.indexname,
                columns,
                isUnique,
                isPrimary,
            };
        });
    }
    /**
     * Get estimated row count for a table
     * SECURITY: Uses parameterized query against system catalog
     */
    async getEstimatedRowCount(tableName, schema = 'public') {
        const tableValidation = validateIdentifier(tableName);
        const schemaValidation = validateIdentifier(schema);
        if (!tableValidation.valid || !schemaValidation.valid) {
            return 0;
        }
        const result = await this.query(`SELECT reltuples::bigint AS reltuples
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2`, [schemaValidation.sanitized, tableValidation.sanitized]);
        return result.rows[0]?.reltuples ? parseInt(result.rows[0].reltuples, 10) : 0;
    }
    /**
     * Get database version info
     */
    async getVersion() {
        const result = await this.query('SELECT version()');
        return result.rows[0]?.version || 'Unknown';
    }
    /**
     * Get list of schemas
     */
    async getSchemas() {
        const result = await this.query(`SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`);
        return result.rows.map((r) => r.schema_name);
    }
}
exports.PostgresDriver = PostgresDriver;
exports.default = PostgresDriver;
