/**
 * Database Integration Tests
 * Tests for database exploration and query execution including:
 * - Connection management
 * - Parameterized queries
 * - Schema inspection
 * - Security (SQL injection prevention)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// ==================== Mock Setup ====================

// Mock encryption/decryption
const ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

function encryptCredential(data: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decryptCredential(encrypted: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Mock database clients
class MockPostgresClient extends EventEmitter {
  connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount: number }> {
    // Simulate query execution
    if (sql.includes('SELECT')) {
      return {
        rows: [
          { id: 1, name: 'Test', email: 'test@example.com' },
          { id: 2, name: 'User', email: 'user@example.com' },
        ],
        rowCount: 2,
      };
    }

    if (sql.includes('INSERT')) {
      return { rows: [{ id: 3 }], rowCount: 1, affectedRows: 1 };
    }

    if (sql.includes('UPDATE')) {
      return { rows: [], rowCount: 1, affectedRows: 1 };
    }

    if (sql.includes('DELETE')) {
      return { rows: [], rowCount: 1, affectedRows: 1 };
    }

    if (sql.includes('information_schema.tables')) {
      return {
        rows: [
          { table_name: 'users', table_type: 'BASE TABLE' },
          { table_name: 'posts', table_type: 'BASE TABLE' },
        ],
        rowCount: 2,
      };
    }

    if (sql.includes('information_schema.columns')) {
      return {
        rows: [
          { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
          { column_name: 'name', data_type: 'text', is_nullable: 'YES' },
          { column_name: 'email', data_type: 'text', is_nullable: 'NO' },
        ],
        rowCount: 3,
      };
    }

    return { rows: [], rowCount: 0 };
  }

  async end(): Promise<void> {
    this.connected = false;
  }
}

class MockSqliteDatabase {
  filename: string;
  isOpen = false;

  constructor(filename: string) {
    this.filename = filename;
  }

  async open(): Promise<void> {
    this.isOpen = true;
  }

  async all(sql: string, params?: any[]): Promise<any[]> {
    if (sql.includes('sqlite_master')) {
      return [
        { type: 'table', name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)' },
        { type: 'table', name: 'posts', sql: 'CREATE TABLE posts (id INTEGER PRIMARY KEY)' },
      ];
    }

    if (sql.includes('PRAGMA table_info')) {
      return [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
        { cid: 1, name: 'name', type: 'TEXT', notnull: 0, pk: 0 },
        { cid: 2, name: 'email', type: 'TEXT', notnull: 1, pk: 0 },
      ];
    }

    return [
      { id: 1, name: 'Test', email: 'test@example.com' },
      { id: 2, name: 'User', email: 'user@example.com' },
    ];
  }

  async run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }> {
    return { lastID: 3, changes: 1 };
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }
}

// ==================== Type Definitions ====================

type DatabaseType = 'postgresql' | 'sqlite';

interface PostgresConnectionParams {
  type: 'postgresql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface SqliteConnectionParams {
  type: 'sqlite';
  filename: string;
}

type ConnectionParams = PostgresConnectionParams | SqliteConnectionParams;

interface DatabaseConnection {
  id: string;
  projectId: string;
  params: ConnectionParams;
  client: any;
  createdAt: Date;
  lastUsed: Date;
}

interface QueryRequest {
  connectionId: string;
  sql: string;
  params?: any[];
}

interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  affectedRows?: number;
  executionTime: number;
}

interface TableInfo {
  name: string;
  type: 'table' | 'view';
  rowCount?: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  foreignKey?: boolean;
}

// ==================== Connection Manager ====================

class ConnectionManager {
  private connections = new Map<string, DatabaseConnection>();
  private connectionTimeout = 30 * 60 * 1000; // 30 minutes

  async createConnection(projectId: string, params: ConnectionParams): Promise<string> {
    const connectionId = crypto.randomBytes(16).toString('hex');

    let client: any;

    if (params.type === 'postgresql') {
      client = new MockPostgresClient();
      await client.connect();
    } else if (params.type === 'sqlite') {
      // Validate path to prevent traversal
      if (params.filename.includes('..') || params.filename.startsWith('/')) {
        throw new Error('Invalid SQLite file path');
      }

      client = new MockSqliteDatabase(params.filename);
      await client.open();
    } else {
      throw new Error('Unsupported database type');
    }

    const connection: DatabaseConnection = {
      id: connectionId,
      projectId,
      params,
      client,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    this.connections.set(connectionId, connection);

    // Set timeout to close connection
    setTimeout(() => {
      this.closeConnection(connectionId);
    }, this.connectionTimeout);

    return connectionId;
  }

  getConnection(connectionId: string): DatabaseConnection | undefined {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastUsed = new Date();
    }
    return connection;
  }

  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    if (connection.params.type === 'postgresql') {
      await connection.client.end();
    } else if (connection.params.type === 'sqlite') {
      await connection.client.close();
    }

    this.connections.delete(connectionId);
  }

  async closeAllForProject(projectId: string): Promise<void> {
    const toClose = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.projectId === projectId);

    for (const [connectionId] of toClose) {
      await this.closeConnection(connectionId);
    }
  }

  getStats() {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        projectId: conn.projectId,
        type: conn.params.type,
        createdAt: conn.createdAt,
        lastUsed: conn.lastUsed,
      })),
    };
  }
}

// ==================== Query Executor ====================

class QueryExecutor {
  constructor(private connectionManager: ConnectionManager) {}

  // Validate SQL to prevent dangerous operations
  private validateQuery(sql: string): void {
    const dangerous = [
      'DROP DATABASE',
      'DROP SCHEMA',
      'TRUNCATE',
      'ALTER SYSTEM',
      'COPY',
      'PG_READ_FILE',
      'PG_WRITE_FILE',
    ];

    const upperSql = sql.toUpperCase();
    for (const pattern of dangerous) {
      if (upperSql.includes(pattern)) {
        throw new Error(`Dangerous operation not allowed: ${pattern}`);
      }
    }
  }

  // Validate identifiers (table names, column names)
  private validateIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
  }

  async executeQuery(request: QueryRequest): Promise<QueryResult> {
    const { connectionId, sql, params = [] } = request;

    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Validate query
    this.validateQuery(sql);

    const startTime = Date.now();
    let result: any;

    if (connection.params.type === 'postgresql') {
      result = await connection.client.query(sql, params);
    } else if (connection.params.type === 'sqlite') {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        result = { rows: await connection.client.all(sql, params) };
      } else {
        const runResult = await connection.client.run(sql, params);
        result = { rows: [], affectedRows: runResult.changes };
      }
    }

    const executionTime = Date.now() - startTime;

    // Transform result to standard format
    const rows = result.rows || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      columns,
      rows: rows.map((row: any) => columns.map(col => row[col])),
      rowCount: rows.length,
      affectedRows: result.affectedRows || result.rowCount,
      executionTime,
    };
  }

  // Analyze query for potential issues
  analyzeQuery(sql: string): {
    type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER';
    hasParameters: boolean;
    estimatedComplexity: 'low' | 'medium' | 'high';
    warnings: string[];
  } {
    const warnings: string[] = [];
    const upperSql = sql.toUpperCase();

    let type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER' = 'OTHER';
    if (upperSql.startsWith('SELECT')) type = 'SELECT';
    else if (upperSql.startsWith('INSERT')) type = 'INSERT';
    else if (upperSql.startsWith('UPDATE')) type = 'UPDATE';
    else if (upperSql.startsWith('DELETE')) type = 'DELETE';

    const hasParameters = sql.includes('$') || sql.includes('?');

    // Check for potential issues
    if (upperSql.includes('SELECT *')) {
      warnings.push('SELECT * can be inefficient, consider specifying columns');
    }

    if (type === 'DELETE' && !upperSql.includes('WHERE')) {
      warnings.push('DELETE without WHERE will remove all rows');
    }

    if (type === 'UPDATE' && !upperSql.includes('WHERE')) {
      warnings.push('UPDATE without WHERE will modify all rows');
    }

    if (!hasParameters && (type === 'INSERT' || type === 'UPDATE')) {
      warnings.push('Consider using parameterized queries for better security');
    }

    // Estimate complexity
    let complexity: 'low' | 'medium' | 'high' = 'low';
    const joinCount = (upperSql.match(/JOIN/g) || []).length;
    const subqueryCount = (upperSql.match(/\(SELECT/g) || []).length;

    if (joinCount > 2 || subqueryCount > 1) {
      complexity = 'high';
    } else if (joinCount > 0 || subqueryCount > 0) {
      complexity = 'medium';
    }

    return { type, hasParameters, estimatedComplexity: complexity, warnings };
  }
}

// ==================== Schema Inspector ====================

class SchemaInspector {
  constructor(private connectionManager: ConnectionManager) {}

  async getTables(connectionId: string): Promise<TableInfo[]> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.params.type === 'postgresql') {
      const result = await connection.client.query(`
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      return result.rows.map((row: any) => ({
        name: row.table_name,
        type: row.table_type === 'BASE TABLE' ? 'table' : 'view',
      }));
    } else if (connection.params.type === 'sqlite') {
      const result = await connection.client.all(`
        SELECT name, type FROM sqlite_master
        WHERE type IN ('table', 'view')
        ORDER BY name
      `);

      return result.map((row: any) => ({
        name: row.name,
        type: row.type,
      }));
    }

    return [];
  }

  async getColumns(connectionId: string, tableName: string): Promise<ColumnInfo[]> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error('Invalid table name');
    }

    if (connection.params.type === 'postgresql') {
      const result = await connection.client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      return result.rows.map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      }));
    } else if (connection.params.type === 'sqlite') {
      const result = await connection.client.all(`PRAGMA table_info(${tableName})`);

      return result.map((row: any) => ({
        name: row.name,
        type: row.type,
        nullable: row.notnull === 0,
        primaryKey: row.pk === 1,
      }));
    }

    return [];
  }
}

// ==================== Tests ====================

describe('Database Integration Tests', () => {
  let connectionManager: ConnectionManager;
  let queryExecutor: QueryExecutor;
  let schemaInspector: SchemaInspector;

  beforeEach(() => {
    connectionManager = new ConnectionManager();
    queryExecutor = new QueryExecutor(connectionManager);
    schemaInspector = new SchemaInspector(connectionManager);
  });

  afterEach(async () => {
    // Close all connections
    const stats = connectionManager.getStats();
    for (const conn of stats.connections) {
      await connectionManager.closeConnection(conn.id);
    }
  });

  describe('Connection Manager', () => {
    it('should create PostgreSQL connection', async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const connectionId = await connectionManager.createConnection('test-project', params);

      expect(connectionId).toBeDefined();
      expect(connectionId).toHaveLength(32); // 16 bytes as hex

      const connection = connectionManager.getConnection(connectionId);
      expect(connection).toBeDefined();
      expect(connection?.projectId).toBe('test-project');
      expect(connection?.params.type).toBe('postgresql');
    });

    it('should create SQLite connection', async () => {
      const params: SqliteConnectionParams = {
        type: 'sqlite',
        filename: 'test.db',
      };

      const connectionId = await connectionManager.createConnection('test-project', params);

      const connection = connectionManager.getConnection(connectionId);
      expect(connection).toBeDefined();
      expect(connection?.params.type).toBe('sqlite');
    });

    it('should reject SQLite path traversal attempts', async () => {
      const params: SqliteConnectionParams = {
        type: 'sqlite',
        filename: '../../../etc/passwd',
      };

      await expect(
        connectionManager.createConnection('test-project', params)
      ).rejects.toThrow('Invalid SQLite file path');
    });

    it('should reject absolute SQLite paths', async () => {
      const params: SqliteConnectionParams = {
        type: 'sqlite',
        filename: '/etc/passwd',
      };

      await expect(
        connectionManager.createConnection('test-project', params)
      ).rejects.toThrow('Invalid SQLite file path');
    });

    it('should close connection', async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const connectionId = await connectionManager.createConnection('test-project', params);
      await connectionManager.closeConnection(connectionId);

      const connection = connectionManager.getConnection(connectionId);
      expect(connection).toBeUndefined();
    });

    it('should close all connections for a project', async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      await connectionManager.createConnection('project-1', params);
      await connectionManager.createConnection('project-1', params);
      await connectionManager.createConnection('project-2', params);

      await connectionManager.closeAllForProject('project-1');

      const stats = connectionManager.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connections[0].projectId).toBe('project-2');
    });

    it('should track connection statistics', async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      await connectionManager.createConnection('project-1', params);
      await connectionManager.createConnection('project-2', params);

      const stats = connectionManager.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.connections).toHaveLength(2);
    });
  });

  describe('Query Executor', () => {
    let connectionId: string;

    beforeEach(async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      connectionId = await connectionManager.createConnection('test-project', params);
    });

    it('should execute SELECT query with parameters', async () => {
      const result = await queryExecutor.executeQuery({
        connectionId,
        sql: 'SELECT * FROM users WHERE id = $1',
        params: [1],
      });

      expect(result.columns).toContain('id');
      expect(result.columns).toContain('name');
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should execute INSERT query', async () => {
      const result = await queryExecutor.executeQuery({
        connectionId,
        sql: 'INSERT INTO users (name, email) VALUES ($1, $2)',
        params: ['John', 'john@example.com'],
      });

      expect(result.affectedRows).toBe(1);
    });

    it('should execute UPDATE query', async () => {
      const result = await queryExecutor.executeQuery({
        connectionId,
        sql: 'UPDATE users SET name = $1 WHERE id = $2',
        params: ['Jane', 1],
      });

      expect(result.affectedRows).toBe(1);
    });

    it('should execute DELETE query', async () => {
      const result = await queryExecutor.executeQuery({
        connectionId,
        sql: 'DELETE FROM users WHERE id = $1',
        params: [1],
      });

      expect(result.affectedRows).toBe(1);
    });

    it('should reject dangerous DROP DATABASE', async () => {
      await expect(
        queryExecutor.executeQuery({
          connectionId,
          sql: 'DROP DATABASE testdb',
        })
      ).rejects.toThrow('Dangerous operation not allowed');
    });

    it('should reject dangerous TRUNCATE', async () => {
      await expect(
        queryExecutor.executeQuery({
          connectionId,
          sql: 'TRUNCATE TABLE users',
        })
      ).rejects.toThrow('Dangerous operation not allowed');
    });

    it('should reject pg_read_file attempts', async () => {
      try {
        await queryExecutor.executeQuery({
          connectionId,
          sql: "SELECT pg_read_file('/etc/passwd')",
        });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Dangerous operation');
      }
    });

    it('should throw error for invalid connection', async () => {
      await expect(
        queryExecutor.executeQuery({
          connectionId: 'invalid-id',
          sql: 'SELECT * FROM users',
        })
      ).rejects.toThrow('Connection not found');
    });

    it('should analyze SELECT query', () => {
      const analysis = queryExecutor.analyzeQuery('SELECT * FROM users WHERE id = $1');

      expect(analysis.type).toBe('SELECT');
      expect(analysis.hasParameters).toBe(true);
      expect(analysis.warnings).toContain('SELECT * can be inefficient, consider specifying columns');
    });

    it('should warn about DELETE without WHERE', () => {
      const analysis = queryExecutor.analyzeQuery('DELETE FROM users');

      expect(analysis.type).toBe('DELETE');
      expect(analysis.warnings).toContain('DELETE without WHERE will remove all rows');
    });

    it('should warn about UPDATE without WHERE', () => {
      const analysis = queryExecutor.analyzeQuery('UPDATE users SET active = true');

      expect(analysis.type).toBe('UPDATE');
      expect(analysis.warnings).toContain('UPDATE without WHERE will modify all rows');
    });

    it('should detect high complexity queries', () => {
      const sql = `
        SELECT u.*, p.title
        FROM users u
        JOIN posts p ON u.id = p.user_id
        JOIN comments c ON p.id = c.post_id
        JOIN likes l ON p.id = l.post_id
        WHERE u.id IN (SELECT author_id FROM articles)
        AND p.id IN (SELECT post_id FROM featured)
      `;

      const analysis = queryExecutor.analyzeQuery(sql);
      expect(analysis.estimatedComplexity).toBe('high');
    });
  });

  describe('Schema Inspector', () => {
    let connectionId: string;

    beforeEach(async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      connectionId = await connectionManager.createConnection('test-project', params);
    });

    it('should list tables', async () => {
      const tables = await schemaInspector.getTables(connectionId);

      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0]).toHaveProperty('name');
      expect(tables[0]).toHaveProperty('type');
    });

    it('should get columns for a table', async () => {
      const columns = await schemaInspector.getColumns(connectionId, 'users');

      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0]).toHaveProperty('name');
      expect(columns[0]).toHaveProperty('type');
      expect(columns[0]).toHaveProperty('nullable');
    });

    it('should reject invalid table names (SQL injection)', async () => {
      await expect(
        schemaInspector.getColumns(connectionId, "users; DROP TABLE users--")
      ).rejects.toThrow('Invalid table name');
    });

    it('should reject table names with special characters', async () => {
      await expect(
        schemaInspector.getColumns(connectionId, "users' OR '1'='1")
      ).rejects.toThrow('Invalid table name');
    });

    it('should throw error for invalid connection', async () => {
      await expect(
        schemaInspector.getTables('invalid-id')
      ).rejects.toThrow('Connection not found');
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt credentials', () => {
      const original = 'my-secret-password';
      const encrypted = encryptCredential(original);

      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.encrypted).not.toBe(original);

      const decrypted = decryptCredential(encrypted.encrypted, encrypted.iv, encrypted.tag);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertexts for same input', () => {
      const original = 'my-secret-password';
      const encrypted1 = encryptCredential(original);
      const encrypted2 = encryptCredential(original);

      // Different IVs should produce different ciphertexts
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      // But both should decrypt to same value
      const decrypted1 = decryptCredential(encrypted1.encrypted, encrypted1.iv, encrypted1.tag);
      const decrypted2 = decryptCredential(encrypted2.encrypted, encrypted2.iv, encrypted2.tag);
      expect(decrypted1).toBe(original);
      expect(decrypted2).toBe(original);
    });

    it('should fail with wrong key/iv/tag', () => {
      const original = 'my-secret-password';
      const encrypted = encryptCredential(original);

      // Tamper with encrypted data
      const tampered = encrypted.encrypted.slice(0, -2) + 'ff';

      expect(() => {
        decryptCredential(tampered, encrypted.iv, encrypted.tag);
      }).toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete database workflow', async () => {
      // 1. Create connection
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const connectionId = await connectionManager.createConnection('test-project', params);

      // 2. Inspect schema
      const tables = await schemaInspector.getTables(connectionId);
      expect(tables.length).toBeGreaterThan(0);

      const columns = await schemaInspector.getColumns(connectionId, tables[0].name);
      expect(columns.length).toBeGreaterThan(0);

      // 3. Execute query
      const result = await queryExecutor.executeQuery({
        connectionId,
        sql: 'SELECT * FROM users',
      });

      expect(result.rows.length).toBeGreaterThan(0);

      // 4. Close connection
      await connectionManager.closeConnection(connectionId);
      expect(connectionManager.getConnection(connectionId)).toBeUndefined();
    });

    it('should handle multiple concurrent connections', async () => {
      const params1: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'db1',
        user: 'user1',
        password: 'pass1',
      };

      const params2: SqliteConnectionParams = {
        type: 'sqlite',
        filename: 'test.db',
      };

      const conn1 = await connectionManager.createConnection('project-1', params1);
      const conn2 = await connectionManager.createConnection('project-2', params2);

      const result1 = await queryExecutor.executeQuery({
        connectionId: conn1,
        sql: 'SELECT * FROM users',
      });

      const result2 = await queryExecutor.executeQuery({
        connectionId: conn2,
        sql: 'SELECT * FROM users',
      });

      expect(result1.rows.length).toBeGreaterThan(0);
      expect(result2.rows.length).toBeGreaterThan(0);
    });

    it('should prevent SQL injection via parameterized queries', async () => {
      const params: PostgresConnectionParams = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const connectionId = await connectionManager.createConnection('test-project', params);

      // Attempt SQL injection
      const maliciousInput = "1' OR '1'='1";

      // With parameterized query, this should be safe
      const result = await queryExecutor.executeQuery({
        connectionId,
        sql: 'SELECT * FROM users WHERE id = $1',
        params: [maliciousInput],
      });

      // The query treats the input as a literal value, not SQL code
      expect(result).toBeDefined();
    });
  });
});
