"use strict";
/**
 * Schema Inspector
 * Safely inspects database schemas without executing arbitrary queries
 *
 * SECURITY FEATURES:
 * - Only reads schema metadata from system catalogs
 * - All table/column names are validated
 * - No user-provided SQL is executed
 * - Uses parameterized queries internally
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaInspector = exports.schemaInspector = void 0;
const connection_manager_js_1 = require("./connection-manager.js");
const postgresql_js_1 = require("./drivers/postgresql.js");
const sqlite_js_1 = require("./drivers/sqlite.js");
// ============================================
// Schema Inspector Class
// ============================================
class SchemaInspector {
    /**
     * Get schema overview for a connection
     * SECURITY: Only reads metadata, no user queries executed
     */
    async getSchemaOverview(connectionId, projectId, schema) {
        const connection = connection_manager_js_1.connectionManager.getConnection(connectionId, projectId);
        if (!connection) {
            return { success: false, error: 'Connection not found or access denied' };
        }
        try {
            if (connection.driver instanceof postgresql_js_1.PostgresDriver) {
                return await this.getPostgresOverview(connection.driver, schema);
            }
            else if (connection.driver instanceof sqlite_js_1.SqliteDriver) {
                return await this.getSqliteOverview(connection.driver);
            }
            return { success: false, error: 'Unknown database type' };
        }
        catch (error) {
            console.error('[SchemaInspector] Error getting overview:', error);
            return { success: false, error: `Failed to get schema: ${error.message}` };
        }
    }
    /**
     * Get detailed information about a table
     * SECURITY: Table name is validated before use
     */
    async getTableDetails(connectionId, projectId, tableName, schema) {
        const connection = connection_manager_js_1.connectionManager.getConnection(connectionId, projectId);
        if (!connection) {
            return { success: false, error: 'Connection not found or access denied' };
        }
        try {
            if (connection.driver instanceof postgresql_js_1.PostgresDriver) {
                return await this.getPostgresTableDetails(connection.driver, tableName, schema);
            }
            else if (connection.driver instanceof sqlite_js_1.SqliteDriver) {
                return await this.getSqliteTableDetails(connection.driver, tableName);
            }
            return { success: false, error: 'Unknown database type' };
        }
        catch (error) {
            console.error('[SchemaInspector] Error getting table details:', error);
            return { success: false, error: `Failed to get table details: ${error.message}` };
        }
    }
    /**
     * List available schemas (PostgreSQL only)
     */
    async listSchemas(connectionId, projectId) {
        const connection = connection_manager_js_1.connectionManager.getConnection(connectionId, projectId);
        if (!connection) {
            return { success: false, error: 'Connection not found or access denied' };
        }
        try {
            if (connection.driver instanceof postgresql_js_1.PostgresDriver) {
                const schemas = await connection.driver.getSchemas();
                return { success: true, schemas };
            }
            else if (connection.driver instanceof sqlite_js_1.SqliteDriver) {
                // SQLite doesn't have schemas, return default
                return { success: true, schemas: ['main'] };
            }
            return { success: false, error: 'Unknown database type' };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    /**
     * Preview table data (limited rows)
     * SECURITY: Uses parameterized query with validated table name and hard limits
     */
    async previewTable(connectionId, projectId, tableName, schema, limit = 100) {
        const connection = connection_manager_js_1.connectionManager.getConnection(connectionId, projectId);
        if (!connection) {
            return { success: false, error: 'Connection not found or access denied' };
        }
        // SECURITY: Hard limit on preview rows
        const safeLimit = Math.min(Math.max(1, limit), 1000);
        try {
            if (connection.driver instanceof postgresql_js_1.PostgresDriver) {
                // Validate identifiers
                const tableValidation = (0, postgresql_js_1.validateIdentifier)(tableName);
                const schemaValidation = schema ? (0, postgresql_js_1.validateIdentifier)(schema) : { valid: true, sanitized: 'public' };
                if (!tableValidation.valid || !schemaValidation.valid) {
                    return { success: false, error: 'Invalid table or schema name' };
                }
                // SECURITY: Use parameterized limit, but table name must be quoted
                // Since we've validated the identifier strictly, this is safe
                const result = await connection.driver.query(`SELECT * FROM "${schemaValidation.sanitized}"."${tableValidation.sanitized}" LIMIT $1`, [safeLimit]);
                return {
                    success: true,
                    rows: result.rows,
                    columns: result.fields.map((f) => f.name),
                };
            }
            else if (connection.driver instanceof sqlite_js_1.SqliteDriver) {
                // Validate table name
                const tableValidation = (0, sqlite_js_1.validateIdentifier)(tableName);
                if (!tableValidation.valid) {
                    return { success: false, error: 'Invalid table name' };
                }
                // SECURITY: Table name is validated, use parameterized limit
                const result = await connection.driver.query(`SELECT * FROM "${tableValidation.sanitized}" LIMIT ?`, [safeLimit]);
                return {
                    success: true,
                    rows: result.rows,
                    columns: result.fields.map((f) => f.name),
                };
            }
            return { success: false, error: 'Unknown database type' };
        }
        catch (error) {
            return { success: false, error: `Preview failed: ${error.message}` };
        }
    }
    // ============================================
    // PostgreSQL Specific Methods
    // ============================================
    async getPostgresOverview(driver, schema = 'public') {
        // Validate schema name
        const schemaValidation = (0, postgresql_js_1.validateIdentifier)(schema);
        if (!schemaValidation.valid) {
            return { success: false, error: `Invalid schema name: ${schemaValidation.error}` };
        }
        const tables = await driver.getTables(schemaValidation.sanitized);
        const version = await driver.getVersion();
        // Get row counts for tables
        for (const table of tables) {
            if (table.type === 'table') {
                table.rowCount = await driver.getEstimatedRowCount(table.name, table.schema);
            }
        }
        return {
            success: true,
            data: {
                database: 'PostgreSQL',
                type: 'postgresql',
                version,
                tables,
                totalTables: tables.filter((t) => t.type === 'table').length,
                totalViews: tables.filter((t) => t.type === 'view').length,
            },
        };
    }
    async getPostgresTableDetails(driver, tableName, schema = 'public') {
        // Validate identifiers
        const tableValidation = (0, postgresql_js_1.validateIdentifier)(tableName);
        const schemaValidation = (0, postgresql_js_1.validateIdentifier)(schema);
        if (!tableValidation.valid) {
            return { success: false, error: `Invalid table name: ${tableValidation.error}` };
        }
        if (!schemaValidation.valid) {
            return { success: false, error: `Invalid schema name: ${schemaValidation.error}` };
        }
        const safeTable = tableValidation.sanitized;
        const safeSchema = schemaValidation.sanitized;
        // Get all details
        const columns = await driver.getTableSchema(safeTable, safeSchema);
        const indexes = await driver.getIndexes(safeTable, safeSchema);
        const rowCount = await driver.getEstimatedRowCount(safeTable, safeSchema);
        // Extract foreign keys from columns
        const foreignKeys = columns
            .filter((c) => c.isForeignKey && c.references)
            .map((c) => ({
            column: c.name,
            referencedTable: c.references.table,
            referencedColumn: c.references.column,
        }));
        // Extract primary key columns
        const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        return {
            success: true,
            data: {
                name: safeTable,
                schema: safeSchema,
                type: 'table',
                columns,
                indexes,
                foreignKeys,
                rowCount,
                primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
            },
        };
    }
    // ============================================
    // SQLite Specific Methods
    // ============================================
    async getSqliteOverview(driver) {
        const tables = await driver.getTables();
        const version = await driver.getVersion();
        // Get row counts for tables
        for (const table of tables) {
            if (table.type === 'table') {
                table.rowCount = await driver.getRowCount(table.name);
            }
        }
        return {
            success: true,
            data: {
                database: 'SQLite',
                type: 'sqlite',
                version,
                tables: tables.map((t) => ({ ...t, schema: 'main' })),
                totalTables: tables.filter((t) => t.type === 'table').length,
                totalViews: tables.filter((t) => t.type === 'view').length,
            },
        };
    }
    async getSqliteTableDetails(driver, tableName) {
        // Validate table name
        const tableValidation = (0, sqlite_js_1.validateIdentifier)(tableName);
        if (!tableValidation.valid) {
            return { success: false, error: `Invalid table name: ${tableValidation.error}` };
        }
        const safeTable = tableValidation.sanitized;
        // Get all details
        const columns = await driver.getTableSchema(safeTable);
        const indexes = await driver.getIndexes(safeTable);
        const rowCount = await driver.getRowCount(safeTable);
        // Extract foreign keys from columns
        const foreignKeys = columns
            .filter((c) => c.isForeignKey && c.references)
            .map((c) => ({
            column: c.name,
            referencedTable: c.references.table,
            referencedColumn: c.references.column,
        }));
        // Extract primary key columns
        const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        return {
            success: true,
            data: {
                name: safeTable,
                type: 'table',
                columns,
                indexes,
                foreignKeys,
                rowCount,
                primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
            },
        };
    }
}
exports.SchemaInspector = SchemaInspector;
// Export singleton instance
exports.schemaInspector = new SchemaInspector();
