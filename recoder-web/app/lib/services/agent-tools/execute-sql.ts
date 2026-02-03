/**
 * Agent Tool: Execute SQL
 *
 * Execute SQL queries on the project's database.
 * This tool requires proper database configuration and consent.
 */

import { z } from 'zod';
import {
  escapeXmlAttr,
  type ToolDefinition,
  type AgentContext,
} from './types';
import { dockerPost } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const executeSqlSchema = z.object({
  query: z.string().describe('The SQL query to execute'),
  description: z.string().optional().describe('Brief description of the query'),
});

export type ExecuteSqlArgs = z.infer<typeof executeSqlSchema>;

// ============================================================================
// Types
// ============================================================================

export interface SqlResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields?: Array<{ name: string; type: string }>;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const executeSqlTool: ToolDefinition<ExecuteSqlArgs> = {
  name: 'execute_sql',
  description: `Execute SQL on the project's database.

Use this tool to:
- Query data from the database
- Create, alter, or drop tables
- Insert, update, or delete records
- Run database migrations

**Warning:** This tool can modify database state. Use with caution.

Example:
\`\`\`
execute_sql(query="SELECT * FROM users LIMIT 10", description="Get first 10 users")
\`\`\``,
  inputSchema: executeSqlSchema,
  defaultConsent: 'ask', // Always ask for consent for SQL operations
  modifiesState: true,

  getConsentPreview: (args) =>
    args.query.slice(0, 100) + (args.query.length > 100 ? '...' : ''),

  buildXml: (args, isComplete) => {
    if (args.query === undefined) return undefined;

    let xml = `<recoder-execute-sql description="${escapeXmlAttr(args.description ?? '')}">\n${args.query}`;
    if (isComplete) {
      xml += '\n</recoder-execute-sql>';
    }
    return xml;
  },

  isEnabled: (ctx) => {
    // SQL execution is only available if the project supports it
    // This could be determined by checking project configuration
    return ctx.canModify;
  },

  execute: async (args, ctx: AgentContext) => {
    // Check modification permissions
    if (!ctx.canModify) {
      throw new Error('SQL execution not allowed in current context');
    }

    ctx.log?.(`Executing SQL: ${args.query.slice(0, 100)}...`, 'debug');

    // Request consent if the context supports it
    if (ctx.requireConsent) {
      const consented = await ctx.requireConsent({
        toolName: 'execute_sql',
        toolDescription: 'Execute SQL query on the database',
        inputPreview: args.query.slice(0, 200) + (args.query.length > 200 ? '...' : ''),
      });

      if (!consented) {
        throw new Error('User denied consent for SQL execution');
      }
    }

    try {
      // Execute SQL via docker backend
      const endpoint = `/api/sql/${ctx.projectId}`;
      const response = await dockerPost<SqlResult>(
        endpoint,
        {
          query: args.query,
          description: args.description,
        },
        { timeout: 60000 }, // Longer timeout for SQL operations
      );

      const result = response;

      if (!result || typeof result.rowCount !== 'number') {
        return 'SQL executed successfully (no result set)';
      }

      // Format the result
      if (result.rows && result.rows.length > 0) {
        const fields = result.fields?.map((f) => f.name) || Object.keys(result.rows[0]);
        const header = `| ${fields.join(' | ')} |`;
        const separator = `| ${fields.map(() => '---').join(' | ')} |`;

        const rows = result.rows.slice(0, 50).map((row) => {
          const values = fields.map((field) => {
            const value = row[field];
            if (value === null) return 'NULL';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
          });
          return `| ${values.join(' | ')} |`;
        });

        let output = `${header}\n${separator}\n${rows.join('\n')}`;

        if (result.rows.length > 50) {
          output += `\n\n... and ${result.rows.length - 50} more rows`;
        }

        output += `\n\n(${result.rowCount} rows affected)`;

        return output;
      }

      return `SQL executed successfully (${result.rowCount} rows affected)`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`SQL execution failed: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Execute SQL on the project database
 */
export async function executeSql(
  projectId: string,
  query: string,
  options?: { description?: string },
): Promise<SqlResult> {
  const ctx: AgentContext = {
    projectId,
    canModify: true,
  };

  const endpoint = `/api/sql/${projectId}`;
  const response = await dockerPost<SqlResult>(
    endpoint,
    {
      query,
      description: options?.description,
    },
    { timeout: 60000 },
  );

  return response;
}

/**
 * Execute a SELECT query and return results
 */
export async function selectQuery(
  projectId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const result = await executeSql(projectId, query);
  return result.rows || [];
}

/**
 * Execute a mutation query (INSERT, UPDATE, DELETE)
 * and return the number of affected rows
 */
export async function mutationQuery(
  projectId: string,
  query: string,
): Promise<number> {
  const result = await executeSql(projectId, query);
  return result.rowCount;
}
