"use strict";
/**
 * SQLite Driver Wrapper
 * Provides a secure interface for SQLite database operations
 *
 * SECURITY: Uses parameterized queries ONLY via better-sqlite3
 * better-sqlite3 is synchronous and uses prepared statements with bound parameters
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteDriver = void 0;
exports.validateIdentifier = validateIdentifier;
exports.validateQuery = validateQuery;
exports.validateDatabasePath = validateDatabasePath;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let Database = null;
try {
    // Dynamic import for better-sqlite3 (native module)
    Database = require('better-sqlite3');
}
catch (e) {
    console.warn('[SQLite] better-sqlite3 not available - SQLite support disabled');
}
// ============================================
// Input Validation
// ============================================
const MAX_QUERY_LENGTH = 100000; // 100KB max query
const MAX_IDENTIFIER_LENGTH = 128;
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
const MAX_PATH_LENGTH = 4096;
/**
 * Validate and sanitize a database identifier
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
    if (!IDENTIFIER_REGEX.test(trimmed)) {
        return { valid: false, error: 'Invalid identifier format. Use only letters, numbers, and underscores.' };
    }
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
/**
 * Validate file path for SQLite database
 * SECURITY: Prevents path traversal attacks
 */
function validateDatabasePath(filePath, basePath) {
    if (!filePath || typeof filePath !== 'string') {
        return { valid: false, error: 'File path is required' };
    }
    if (filePath.length > MAX_PATH_LENGTH) {
        return { valid: false, error: 'Path too long' };
    }
    // Resolve the full path
    const resolvedPath = path.resolve(basePath, filePath);
    // SECURITY: Ensure the resolved path is within the base path (prevent path traversal)
    const normalizedBase = path.normalize(basePath);
    const normalizedResolved = path.normalize(resolvedPath);
    if (!normalizedResolved.startsWith(normalizedBase)) {
        return { valid: false, error: 'Path traversal detected - access denied' };
    }
    // Check file extension
    const ext = path.extname(normalizedResolved).toLowerCase();
    if (ext !== '.db' && ext !== '.sqlite' && ext !== '.sqlite3' && ext !== '') {
        return { valid: false, error: 'Invalid database file extension. Use .db, .sqlite, or .sqlite3' };
    }
    return { valid: true, sanitized: normalizedResolved };
}
// ============================================
// SQLite Driver Class
// ============================================
class SqliteDriver {
    db = null;
    config;
    isConnected = false;
    constructor(config) {
        if (!Database) {
            throw new Error('SQLite support not available - better-sqlite3 module not installed');
        }
        if (!config.filename || typeof config.filename !== 'string') {
            throw new Error('Invalid filename configuration');
        }
        this.config = {
            ...config,
            timeout: Math.min(config.timeout || 5000, 30000), // Max 30 second timeout
        };
    }
    /**
     * Connect to the database
     */
    async connect() {
        if (this.isConnected && this.db) {
            return;
        }
        if (!Database) {
            throw new Error('SQLite support not available');
        }
        const options = {
            readonly: this.config.readonly ?? false,
            fileMustExist: this.config.fileMustExist ?? false,
            timeout: this.config.timeout,
        };
        // Create database connection
        this.db = new Database(this.config.filename, options);
        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');
        // Set busy timeout
        this.db.pragma(`busy_timeout = ${this.config.timeout}`);
        this.isConnected = true;
    }
    /**
     * Disconnect from the database
     */
    async disconnect() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isConnected = false;
        }
    }
    /**
     * Check if connected
     */
    isActive() {
        return this.isConnected && this.db !== null;
    }
    /**
     * Execute a parameterized query (SELECT)
     * SECURITY: Uses prepared statements with bound parameters
     */
    async query(text, values = []) {
        if (!this.db) {
            throw new Error('Not connected to database');
        }
        // Validate query
        const queryValidation = validateQuery(text);
        if (!queryValidation.valid) {
            throw new Error(queryValidation.error);
        }
        // SECURITY: Use prepared statement with bound parameters
        const stmt = this.db.prepare(text);
        const rows = stmt.all(...values);
        // Get column names from the statement
        const columns = stmt.columns();
        const fields = columns.map((col) => ({ name: col.name }));
        return {
            rows,
            rowCount: rows.length,
            fields,
        };
    }
    /**
     * Execute a parameterized statement (INSERT, UPDATE, DELETE)
     * SECURITY: Uses prepared statements with bound parameters
     */
    async execute(text, values = []) {
        if (!this.db) {
            throw new Error('Not connected to database');
        }
        // Validate query
        const queryValidation = validateQuery(text);
        if (!queryValidation.valid) {
            throw new Error(queryValidation.error);
        }
        // SECURITY: Use prepared statement with bound parameters
        const stmt = this.db.prepare(text);
        const result = stmt.run(...values);
        return {
            changes: result.changes,
            lastInsertRowid: result.lastInsertRowid,
        };
    }
    /**
     * Get list of tables in the database
     * SECURITY: Uses sqlite_master with parameterized type filter
     */
    async getTables() {
        const result = await this.query(`SELECT name, type FROM sqlite_master
       WHERE type IN (?, ?)
       AND name NOT LIKE 'sqlite_%'
       ORDER BY name`, ['table', 'view']);
        return result.rows.map((row) => ({
            name: row.name,
            type: row.type,
        }));
    }
    /**
     * Get table schema (columns) information
     * SECURITY: Uses pragma_table_info with validated table name
     */
    async getTableSchema(tableName) {
        // Validate table name
        const tableValidation = validateIdentifier(tableName);
        if (!tableValidation.valid) {
            throw new Error(`Invalid table name: ${tableValidation.error}`);
        }
        if (!this.db) {
            throw new Error('Not connected to database');
        }
        // SECURITY: Use pragma_table_info function which safely handles the table name
        // We need to use a slightly different approach here since PRAGMA doesn't support parameters
        // First verify the table exists in sqlite_master
        const tableExists = await this.query(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`, [tableValidation.sanitized]);
        if (tableExists.rows.length === 0) {
            throw new Error(`Table '${tableValidation.sanitized}' not found`);
        }
        // Now safely get table info using the validated table name
        // Using table_info pragma with a function call syntax that's safe
        const stmt = this.db.prepare(`SELECT * FROM pragma_table_info(?)`);
        const columns = stmt.all(tableValidation.sanitized);
        // Get foreign key information
        const fkStmt = this.db.prepare(`SELECT * FROM pragma_foreign_key_list(?)`);
        const foreignKeys = fkStmt.all(tableValidation.sanitized);
        const fkMap = new Map();
        for (const fk of foreignKeys) {
            fkMap.set(fk.from, { table: fk.table, column: fk.to });
        }
        return columns.map((col) => ({
            name: col.name,
            type: col.type || 'TEXT',
            nullable: col.notnull === 0,
            defaultValue: col.dflt_value,
            isPrimaryKey: col.pk > 0,
            isForeignKey: fkMap.has(col.name),
            references: fkMap.get(col.name),
        }));
    }
    /**
     * Get indexes for a table
     * SECURITY: Uses pragma with validated table name
     */
    async getIndexes(tableName) {
        const tableValidation = validateIdentifier(tableName);
        if (!tableValidation.valid) {
            throw new Error(`Invalid table name: ${tableValidation.error}`);
        }
        if (!this.db) {
            throw new Error('Not connected to database');
        }
        // Get list of indexes
        const indexStmt = this.db.prepare(`SELECT * FROM pragma_index_list(?)`);
        const indexes = indexStmt.all(tableValidation.sanitized);
        const result = [];
        for (const idx of indexes) {
            // Get columns for each index
            const colStmt = this.db.prepare(`SELECT * FROM pragma_index_info(?)`);
            const cols = colStmt.all(idx.name);
            result.push({
                name: idx.name,
                columns: cols.map((c) => c.name),
                isUnique: idx.unique === 1,
                isPrimary: idx.origin === 'pk',
            });
        }
        return result;
    }
    /**
     * Get row count for a table
     * SECURITY: Only queries validated table names
     */
    async getRowCount(tableName) {
        const tableValidation = validateIdentifier(tableName);
        if (!tableValidation.valid) {
            return 0;
        }
        // Verify table exists first
        const tableExists = await this.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [tableValidation.sanitized]);
        if (tableExists.rows.length === 0) {
            return 0;
        }
        if (!this.db) {
            return 0;
        }
        // SECURITY: We can't parameterize table names in SQL, but we've validated it strictly
        // The identifier regex ensures it only contains safe characters
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM "${tableValidation.sanitized}"`);
        const result = stmt.get();
        return result?.count || 0;
    }
    /**
     * Get SQLite version
     */
    async getVersion() {
        const result = await this.query('SELECT sqlite_version() as version');
        return result.rows[0]?.version || 'Unknown';
    }
    /**
     * Check if database file exists
     */
    static fileExists(filePath) {
        try {
            fs.accessSync(filePath, fs.constants.R_OK);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.SqliteDriver = SqliteDriver;
exports.default = SqliteDriver;
