/**
 * SQLite Driver Wrapper
 * Provides a secure interface for SQLite database operations
 *
 * SECURITY: Uses parameterized queries ONLY via better-sqlite3
 * better-sqlite3 is synchronous and uses prepared statements with bound parameters
 */

import * as path from 'path';
import * as fs from 'fs';

// Type definitions for better-sqlite3
// Inline types to avoid import errors when module isn't installed
interface SqliteColumn {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
}

interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  columns(): SqliteColumn[];
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  close(): void;
}

interface SqliteConstructor {
  new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): SqliteDatabase;
}

let Database: SqliteConstructor | null = null;
try {
  // Dynamic import for better-sqlite3 (native module)
  Database = require('better-sqlite3');
} catch (e) {
  console.warn('[SQLite] better-sqlite3 not available - SQLite support disabled');
}

// ============================================
// Types
// ============================================

export interface SqliteConfig {
  filename: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
}

export interface TableInfo {
  name: string;
  type: 'table' | 'view';
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
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
export function validateIdentifier(identifier: string): { valid: boolean; error?: string; sanitized?: string } {
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
export function validateQuery(query: string): { valid: boolean; error?: string } {
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
export function validateDatabasePath(
  filePath: string,
  basePath: string
): { valid: boolean; error?: string; sanitized?: string } {
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

export class SqliteDriver {
  private db: SqliteDatabase | null = null;
  private config: SqliteConfig;
  private isConnected: boolean = false;

  constructor(config: SqliteConfig) {
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
  async connect(): Promise<void> {
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
  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.db !== null;
  }

  /**
   * Execute a parameterized query (SELECT)
   * SECURITY: Uses prepared statements with bound parameters
   */
  async query<T = Record<string, unknown>>(
    text: string,
    values: unknown[] = []
  ): Promise<{ rows: T[]; rowCount: number; fields: { name: string }[] }> {
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
    const rows = stmt.all(...values) as T[];

    // Get column names from the statement
    const columns = stmt.columns();
    const fields = columns.map((col: { name: string }) => ({ name: col.name }));

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
  async execute(
    text: string,
    values: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
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
  async getTables(): Promise<TableInfo[]> {
    const result = await this.query<{ name: string; type: string }>(
      `SELECT name, type FROM sqlite_master
       WHERE type IN (?, ?)
       AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
      ['table', 'view']
    );

    return result.rows.map((row) => ({
      name: row.name,
      type: row.type as 'table' | 'view',
    }));
  }

  /**
   * Get table schema (columns) information
   * SECURITY: Uses pragma_table_info with validated table name
   */
  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
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
    const tableExists = await this.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`,
      [tableValidation.sanitized]
    );

    if (tableExists.rows.length === 0) {
      throw new Error(`Table '${tableValidation.sanitized}' not found`);
    }

    // Now safely get table info using the validated table name
    // Using table_info pragma with a function call syntax that's safe
    const stmt = this.db.prepare(`SELECT * FROM pragma_table_info(?)`);
    const columns = stmt.all(tableValidation.sanitized) as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // Get foreign key information
    const fkStmt = this.db.prepare(`SELECT * FROM pragma_foreign_key_list(?)`);
    const foreignKeys = fkStmt.all(tableValidation.sanitized) as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
    }>;

    const fkMap = new Map<string, { table: string; column: string }>();
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
  async getIndexes(tableName: string): Promise<IndexInfo[]> {
    const tableValidation = validateIdentifier(tableName);
    if (!tableValidation.valid) {
      throw new Error(`Invalid table name: ${tableValidation.error}`);
    }

    if (!this.db) {
      throw new Error('Not connected to database');
    }

    // Get list of indexes
    const indexStmt = this.db.prepare(`SELECT * FROM pragma_index_list(?)`);
    const indexes = indexStmt.all(tableValidation.sanitized) as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>;

    const result: IndexInfo[] = [];

    for (const idx of indexes) {
      // Get columns for each index
      const colStmt = this.db.prepare(`SELECT * FROM pragma_index_info(?)`);
      const cols = colStmt.all(idx.name) as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;

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
  async getRowCount(tableName: string): Promise<number> {
    const tableValidation = validateIdentifier(tableName);
    if (!tableValidation.valid) {
      return 0;
    }

    // Verify table exists first
    const tableExists = await this.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableValidation.sanitized]
    );

    if (tableExists.rows.length === 0) {
      return 0;
    }

    if (!this.db) {
      return 0;
    }

    // SECURITY: We can't parameterize table names in SQL, but we've validated it strictly
    // The identifier regex ensures it only contains safe characters
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM "${tableValidation.sanitized}"`);
    const result = stmt.get() as { count: number };
    return result?.count || 0;
  }

  /**
   * Get SQLite version
   */
  async getVersion(): Promise<string> {
    const result = await this.query<{ version: string }>('SELECT sqlite_version() as version');
    return result.rows[0]?.version || 'Unknown';
  }

  /**
   * Check if database file exists
   */
  static fileExists(filePath: string): boolean {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export default SqliteDriver;
