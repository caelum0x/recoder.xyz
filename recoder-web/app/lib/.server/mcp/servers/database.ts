/**
 * Database MCP Server
 * Provides database operations through MCP protocol
 */

import type { MCPServer, MCPTool, QueryResult } from '../types';
import { neon } from '@neondatabase/serverless';

export class DatabaseMCPServer {
  private readonly serverId = 'database';
  private readonly serverName = 'Database';
  private readonly version = '1.0.0';
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString || process.env.DATABASE_URL || '';
  }

  /**
   * Get server configuration
   */
  getServer(): MCPServer {
    return {
      id: this.serverId,
      name: this.serverName,
      description: 'Database operations: query, schema inspection, migrations',
      version: this.version,
      enabled: !!this.connectionString,
      status: this.connectionString ? 'active' : 'inactive',
      config: {
        permissions: {
          database: {
            allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
            maxQuerySize: 10000,
            readOnly: false,
          },
        },
        rateLimit: {
          maxRequests: 100,
          windowMs: 60000,
        },
      },
      tools: this.getTools(),
      metadata: {
        category: 'database',
        priority: 3,
        requiresConnection: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Define available tools
   */
  private getTools(): MCPTool[] {
    return [
      {
        name: 'db_query',
        description: 'Execute a SQL query',
        category: 'database',
        inputSchema: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'SQL query to execute',
            },
            params: {
              type: 'array',
              description: 'Query parameters',
              items: { type: 'any' },
            },
          },
          required: ['sql'],
        },
        requiresAuth: true,
        requiresApproval: true, // Dangerous operation
        estimatedDuration: 1000,
        examples: [
          {
            description: 'Select all users',
            input: {
              sql: 'SELECT * FROM users LIMIT 10',
            },
          },
        ],
      },
      {
        name: 'db_list_tables',
        description: 'List all tables in the database',
        category: 'database',
        inputSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              description: 'Schema name',
              default: 'public',
            },
          },
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 500,
      },
      {
        name: 'db_describe_table',
        description: 'Get table schema and column information',
        category: 'database',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name',
            },
            schema: {
              type: 'string',
              description: 'Schema name',
              default: 'public',
            },
          },
          required: ['table'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 500,
      },
      {
        name: 'db_table_stats',
        description: 'Get table statistics (row count, size, etc.)',
        category: 'database',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name',
            },
            schema: {
              type: 'string',
              description: 'Schema name',
              default: 'public',
            },
          },
          required: ['table'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1000,
      },
      {
        name: 'db_search',
        description: 'Search for data across tables',
        category: 'database',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table to search in',
            },
            column: {
              type: 'string',
              description: 'Column to search',
            },
            value: {
              type: 'string',
              description: 'Value to search for',
            },
            limit: {
              type: 'number',
              default: 50,
              maximum: 1000,
            },
          },
          required: ['table', 'column', 'value'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1500,
      },
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    if (!this.connectionString) {
      throw new Error('Database connection not configured. Set DATABASE_URL environment variable.');
    }

    switch (toolName) {
      case 'db_query':
        return await this.executeQuery(parameters.sql, parameters.params);

      case 'db_list_tables':
        return await this.listTables(parameters.schema);

      case 'db_describe_table':
        return await this.describeTable(parameters.table, parameters.schema);

      case 'db_table_stats':
        return await this.getTableStats(parameters.table, parameters.schema);

      case 'db_search':
        return await this.searchTable(parameters);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Execute a SQL query
   */
  private async executeQuery(sql: string, params?: any[]): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const db = neon(this.connectionString);
      
      // Execute query
      const result = await db(sql, params || []);
      
      const executionTime = Date.now() - startTime;

      return {
        rows: result as any[],
        rowCount: result.length,
        fields: result.length > 0 ? Object.keys(result[0]) : [],
        executionTime,
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * List all tables
   */
  private async listTables(schema: string = 'public'): Promise<any[]> {
    const sql = `
      SELECT 
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `;

    const result = await this.executeQuery(sql, [schema]);
    
    return result.rows.map((row: any) => ({
      name: row.table_name,
      type: row.table_type,
      schema,
    }));
  }

  /**
   * Describe table structure
   */
  private async describeTable(table: string, schema: string = 'public'): Promise<any> {
    const sql = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;

    const result = await this.executeQuery(sql, [schema, table]);
    
    return {
      table,
      schema,
      columns: result.rows.map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default,
        maxLength: row.character_maximum_length,
      })),
    };
  }

  /**
   * Get table statistics
   */
  private async getTableStats(table: string, schema: string = 'public'): Promise<any> {
    // Get row count
    const countSql = `SELECT COUNT(*) as count FROM "${schema}"."${table}"`;
    const countResult = await this.executeQuery(countSql);
    
    // Get table size
    const sizeSql = `
      SELECT 
        pg_size_pretty(pg_total_relation_size($1)) as total_size,
        pg_size_pretty(pg_relation_size($1)) as table_size,
        pg_size_pretty(pg_total_relation_size($1) - pg_relation_size($1)) as index_size
      FROM pg_class
      WHERE relname = $2
    `;
    
    const sizeResult = await this.executeQuery(sizeSql, [`${schema}.${table}`, table]);
    
    return {
      table,
      schema,
      rowCount: countResult.rows[0]?.count || 0,
      totalSize: sizeResult.rows[0]?.total_size || 'N/A',
      tableSize: sizeResult.rows[0]?.table_size || 'N/A',
      indexSize: sizeResult.rows[0]?.index_size || 'N/A',
    };
  }

  /**
   * Search table for specific value
   */
  private async searchTable(params: any): Promise<QueryResult> {
    const { table, column, value, limit } = params;
    
    const sql = `
      SELECT * FROM "${params.schema || 'public'}"."${table}"
      WHERE "${column}"::text ILIKE $1
      LIMIT $2
    `;
    
    return await this.executeQuery(sql, [`%${value}%`, limit || 50]);
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.executeQuery('SELECT 1 as test');
      return result.rowCount > 0;
    } catch {
      return false;
    }
  }
}

// Export factory function
export function createDatabaseMCPServer(connectionString?: string): DatabaseMCPServer {
  return new DatabaseMCPServer(connectionString);
}
