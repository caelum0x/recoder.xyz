/**
 * Database Schema Generator API
 * Generates complete database schemas from natural language descriptions
 */

import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateDatabaseSchema, generateProjectFiles, type DatabaseSchemaConfig } from '~/lib/.server/database';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as {
      description?: string;
      dbType?: string;
      format?: string;
    };
    const { description, dbType = 'sqlite', format = 'complete' } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return json(
        { error: 'Description is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate dbType
    const validDbTypes = ['postgresql', 'mysql', 'sqlite'] as const;
    if (!validDbTypes.includes(dbType as any)) {
      return json(
        { error: `Invalid dbType. Must be one of: ${validDbTypes.join(', ')}` },
        { status: 400 }
      );
    }

    type DatabaseType = typeof validDbTypes[number];
    const validatedDbType = dbType as DatabaseType;

    const config: DatabaseSchemaConfig = {
      description,
      dbType: validatedDbType,
      includeSeedData: true,
      seedRecordsPerEntity: 5,
      includeTypes: true,
      includePrisma: validatedDbType === 'postgresql',
      includeDrizzle: true,
    };

    // Generate based on format
    if (format === 'files') {
      // Generate complete project files
      const files = generateProjectFiles(config);
      return json({
        success: true,
        files,
      });
    } else {
      // Generate schema with metadata
      const result = generateDatabaseSchema(config);
      return json({
        success: true,
        data: {
          entities: result.entities.map(e => ({
            name: e.name,
            tableName: e.tableName,
            fields: e.fields.map(f => ({
              name: f.name,
              type: f.type,
              required: f.required,
              unique: f.unique,
              primaryKey: f.primaryKey,
              defaultValue: f.defaultValue,
            })),
            relationships: e.relationships,
          })),
          schema: result.schema,
          seedData: result.seedData,
          summary: result.summary,
        },
      });
    }
  } catch (error) {
    console.error('Schema generation error:', error);
    return json(
      {
        error: 'Failed to generate schema',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for schema examples
export async function loader() {
  return json({
    examples: [
      {
        name: 'Blog Platform',
        description: 'Create a blog with users, posts, and comments',
        category: 'Content Management',
      },
      {
        name: 'E-commerce',
        description: 'E-commerce platform with products, orders, customers, and categories',
        category: 'E-commerce',
      },
      {
        name: 'Task Manager',
        description: 'Task manager with projects, tasks, and team members',
        category: 'Productivity',
      },
      {
        name: 'Social Network',
        description: 'Social network with users, posts, likes, comments, and follows',
        category: 'Social',
      },
      {
        name: 'CRM System',
        description: 'CRM with customers, contacts, deals, and activities',
        category: 'Business',
      },
      {
        name: 'Learning Platform',
        description: 'Online learning platform with courses, lessons, students, and progress tracking',
        category: 'Education',
      },
    ],
    supportedDatabases: [
      { id: 'sqlite', name: 'SQLite', description: 'Lightweight, file-based database' },
      { id: 'postgresql', name: 'PostgreSQL', description: 'Advanced open-source database' },
      { id: 'mysql', name: 'MySQL', description: 'Popular open-source database' },
    ],
  });
}
