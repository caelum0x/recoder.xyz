/**
 * Database Schema Generator - Main Entry Point
 * Orchestrates entity parsing, schema generation, and seed data creation
 */

import { parseEntities, type ParsedSchema, type Entity } from './entity-parser';
import { generateSchema, type GeneratedSchema, type DatabaseType } from './schema-generator';
import { generateSeedData, generateSeedScript, type SeedData } from './seed-generator';

export interface DatabaseSchemaConfig {
  description: string;
  dbType?: DatabaseType;
  includeSeedData?: boolean;
  seedRecordsPerEntity?: number;
  includeTypes?: boolean;
  includePrisma?: boolean;
  includeDrizzle?: boolean;
}

export interface CompleteSchema {
  entities: Entity[];
  schema: GeneratedSchema;
  seedData?: SeedData;
  seedScript?: string;
  summary: SchemaSummary;
}

export interface SchemaSummary {
  entityCount: number;
  tableCount: number;
  totalFields: number;
  relationshipCount: number;
  indexCount: number;
  estimatedSize: string;
}

/**
 * Generate complete database schema from natural language description
 */
export function generateDatabaseSchema(config: DatabaseSchemaConfig): CompleteSchema {
  const {
    description,
    dbType = 'sqlite',
    includeSeedData = true,
    seedRecordsPerEntity = 5,
    includeTypes = true,
    includePrisma = true,
    includeDrizzle = true,
  } = config;

  // Step 1: Parse entities from description
  const parsedSchema: ParsedSchema = parseEntities(description);

  // Step 2: Generate SQL schema
  const schema: GeneratedSchema = generateSchema(parsedSchema, dbType);

  // Step 3: Generate seed data (optional)
  let seedData: SeedData | undefined;
  let seedScript: string | undefined;
  if (includeSeedData) {
    seedData = generateSeedData(parsedSchema.entities, seedRecordsPerEntity);
    seedScript = generateSeedScript(parsedSchema.entities);
  }

  // Step 4: Generate summary
  const summary = generateSummary(parsedSchema.entities);

  return {
    entities: parsedSchema.entities,
    schema,
    seedData,
    seedScript,
    summary,
  };
}

/**
 * Generate schema summary statistics
 */
function generateSummary(entities: Entity[]): SchemaSummary {
  const entityCount = entities.length;
  const tableCount = entityCount;

  let totalFields = 0;
  let relationshipCount = 0;
  let indexCount = 0;

  for (const entity of entities) {
    totalFields += entity.fields.length;
    relationshipCount += entity.relationships.length;
    indexCount += entity.indexes?.length || 0;
  }

  // Estimate database size (very rough)
  const avgFieldSize = 50; // bytes
  const recordsPerTable = 1000; // assumed
  const estimatedBytes = entityCount * recordsPerTable * totalFields * avgFieldSize;
  const estimatedSize = formatBytes(estimatedBytes);

  return {
    entityCount,
    tableCount,
    totalFields,
    relationshipCount,
    indexCount,
    estimatedSize,
  };
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Generate migration file
 */
export function generateMigration(
  entities: Entity[],
  dbType: DatabaseType = 'sqlite',
  migrationName: string = 'initial_schema'
): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
  const fileName = `${timestamp}_${migrationName}`;

  let migration = `-- Migration: ${migrationName}\n`;
  migration += `-- Generated: ${new Date().toISOString()}\n`;
  migration += `-- Database: ${dbType}\n\n`;

  migration += `-- Up Migration\n`;
  const schema = generateSchema({ entities, relationships: new Map() }, dbType);
  migration += schema.sql;

  migration += `\n-- Down Migration (Rollback)\n`;
  for (const entity of entities.reverse()) {
    migration += `DROP TABLE IF EXISTS ${entity.tableName};\n`;
  }

  return migration;
}

/**
 * Generate complete project files
 */
export interface ProjectFiles {
  'schema.sql': string;
  'types.ts': string;
  'seed.sql': string;
  'seed.ts': string;
  'prisma/schema.prisma'?: string;
  'drizzle/schema.ts'?: string;
  'README.md': string;
}

export function generateProjectFiles(config: DatabaseSchemaConfig): ProjectFiles {
  const completeSchema = generateDatabaseSchema(config);

  const files: ProjectFiles = {
    'schema.sql': completeSchema.schema.sql,
    'types.ts': completeSchema.schema.typescript,
    'seed.sql': completeSchema.seedData?.sql || '',
    'seed.ts': completeSchema.seedScript || '',
    'README.md': generateReadme(completeSchema, config),
  };

  if (config.includePrisma && completeSchema.schema.prisma) {
    files['prisma/schema.prisma'] = completeSchema.schema.prisma;
  }

  if (config.includeDrizzle && completeSchema.schema.drizzle) {
    files['drizzle/schema.ts'] = completeSchema.schema.drizzle;
  }

  return files;
}

/**
 * Generate README documentation
 */
function generateReadme(schema: CompleteSchema, config: DatabaseSchemaConfig): string {
  let readme = `# Database Schema\n\n`;
  readme += `Generated from: "${config.description}"\n\n`;

  readme += `## Summary\n\n`;
  readme += `- **Entities:** ${schema.summary.entityCount}\n`;
  readme += `- **Total Fields:** ${schema.summary.totalFields}\n`;
  readme += `- **Relationships:** ${schema.summary.relationshipCount}\n`;
  readme += `- **Indexes:** ${schema.summary.indexCount}\n`;
  readme += `- **Estimated Size:** ${schema.summary.estimatedSize} (with 1K records per table)\n\n`;

  readme += `## Entities\n\n`;
  for (const entity of schema.entities) {
    readme += `### ${entity.name}\n\n`;
    readme += `**Table:** \`${entity.tableName}\`\n\n`;

    if (entity.fields.length > 0) {
      readme += `**Fields:**\n`;
      for (const field of entity.fields) {
        const required = field.required ? '✓' : '○';
        const unique = field.unique ? '(unique)' : '';
        const pk = field.primaryKey ? '(PK)' : '';
        readme += `- ${required} \`${field.name}\`: ${field.type} ${pk} ${unique}\n`;
      }
      readme += '\n';
    }

    if (entity.relationships.length > 0) {
      readme += `**Relationships:**\n`;
      for (const rel of entity.relationships) {
        readme += `- ${rel.type}: ${rel.targetEntity}\n`;
      }
      readme += '\n';
    }
  }

  readme += `## Setup Instructions\n\n`;
  readme += `### 1. Create Database\n\n`;
  readme += `\`\`\`bash\n`;
  readme += `# Run the schema SQL file\n`;
  if (config.dbType === 'postgresql') {
    readme += `psql -U your_user -d your_database < schema.sql\n`;
  } else if (config.dbType === 'mysql') {
    readme += `mysql -u your_user -p your_database < schema.sql\n`;
  } else {
    readme += `sqlite3 database.db < schema.sql\n`;
  }
  readme += `\`\`\`\n\n`;

  readme += `### 2. Seed Data (Optional)\n\n`;
  readme += `\`\`\`bash\n`;
  readme += `# Run the seed SQL file\n`;
  if (config.dbType === 'postgresql') {
    readme += `psql -U your_user -d your_database < seed.sql\n`;
  } else if (config.dbType === 'mysql') {
    readme += `mysql -u your_user -p your_database < seed.sql\n`;
  } else {
    readme += `sqlite3 database.db < seed.sql\n`;
  }
  readme += `\`\`\`\n\n`;

  if (config.includePrisma) {
    readme += `### 3. Using Prisma\n\n`;
    readme += `\`\`\`bash\n`;
    readme += `npm install prisma @prisma/client\n`;
    readme += `npx prisma generate\n`;
    readme += `npx prisma db push\n`;
    readme += `\`\`\`\n\n`;
  }

  readme += `## TypeScript Types\n\n`;
  readme += `Import the generated types:\n\n`;
  readme += `\`\`\`typescript\n`;
  readme += `import { ${schema.entities.map(e => e.name).join(', ')} } from './types';\n`;
  readme += `\`\`\`\n\n`;

  return readme;
}

// Export all types and functions
export * from './entity-parser';
export * from './schema-generator';
export * from './seed-generator';
