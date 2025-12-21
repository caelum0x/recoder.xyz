/**
 * Schema Generator
 * Generates SQL schemas and TypeScript types from parsed entities
 */

import type { Entity, Field, FieldType, Relationship, ParsedSchema } from './entity-parser';

export interface GeneratedSchema {
  sql: string;
  typescript: string;
  prisma?: string;
  drizzle?: string;
}

export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite';

/**
 * Generate complete database schema
 */
export function generateSchema(
  parsedSchema: ParsedSchema,
  dbType: DatabaseType = 'sqlite'
): GeneratedSchema {
  const { entities } = parsedSchema;

  const sql = generateSQL(entities, dbType);
  const typescript = generateTypeScript(entities);
  const prisma = generatePrismaSchema(entities);
  const drizzle = generateDrizzleSchema(entities);

  return { sql, typescript, prisma, drizzle };
}

/**
 * Generate SQL CREATE TABLE statements
 */
function generateSQL(entities: Entity[], dbType: DatabaseType): string {
  let sql = `-- Generated Database Schema\n`;
  sql += `-- Database: ${dbType}\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n\n`;

  // Create tables
  for (const entity of entities) {
    sql += generateTableSQL(entity, dbType);
    sql += '\n';
  }

  // Create indexes
  for (const entity of entities) {
    if (entity.indexes && entity.indexes.length > 0) {
      sql += generateIndexesSQL(entity, dbType);
      sql += '\n';
    }
  }

  // Add foreign key constraints (for databases that support them)
  if (dbType !== 'sqlite') {
    for (const entity of entities) {
      if (entity.relationships.length > 0) {
        sql += generateForeignKeysSQL(entity, dbType);
        sql += '\n';
      }
    }
  }

  return sql;
}

/**
 * Generate CREATE TABLE for a single entity
 */
function generateTableSQL(entity: Entity, dbType: DatabaseType): string {
  let sql = `-- ${entity.name} table\n`;
  sql += `CREATE TABLE ${entity.tableName} (\n`;

  const columns: string[] = [];

  // Generate column definitions
  for (const field of entity.fields) {
    columns.push(`  ${generateColumnSQL(field, dbType)}`);
  }

  sql += columns.join(',\n');
  sql += '\n);\n';

  return sql;
}

/**
 * Generate SQL column definition
 */
function generateColumnSQL(field: Field, dbType: DatabaseType): string {
  let sql = `${field.name} ${getSQLType(field.type, dbType)}`;

  if (field.primaryKey) {
    sql += ' PRIMARY KEY';
    if (field.type === 'uuid' && dbType === 'postgresql') {
      sql += ' DEFAULT gen_random_uuid()';
    } else if (field.type === 'integer' && dbType !== 'sqlite') {
      sql += ' AUTO_INCREMENT';
    }
  }

  if (field.required && !field.primaryKey) {
    sql += ' NOT NULL';
  }

  if (field.unique && !field.primaryKey) {
    sql += ' UNIQUE';
  }

  if (field.defaultValue && !field.primaryKey) {
    if (field.defaultValue === 'CURRENT_TIMESTAMP') {
      sql += ` DEFAULT ${field.defaultValue}`;
    } else if (field.type === 'boolean') {
      sql += ` DEFAULT ${field.defaultValue.toUpperCase()}`;
    } else if (field.type === 'string' || field.type === 'text') {
      sql += ` DEFAULT '${field.defaultValue}'`;
    } else {
      sql += ` DEFAULT ${field.defaultValue}`;
    }
  }

  if (field.validation?.enumValues) {
    if (dbType === 'postgresql') {
      // PostgreSQL supports CHECK constraints
      const values = field.validation.enumValues.map(v => `'${v}'`).join(', ');
      sql += ` CHECK (${field.name} IN (${values}))`;
    }
  }

  return sql;
}

/**
 * Map field type to SQL type
 */
function getSQLType(fieldType: FieldType, dbType: DatabaseType): string {
  const typeMap: Record<DatabaseType, Record<FieldType, string>> = {
    postgresql: {
      string: 'VARCHAR(255)',
      text: 'TEXT',
      integer: 'INTEGER',
      bigint: 'BIGINT',
      decimal: 'DECIMAL(10, 2)',
      float: 'DOUBLE PRECISION',
      boolean: 'BOOLEAN',
      date: 'DATE',
      datetime: 'TIMESTAMP',
      timestamp: 'TIMESTAMP',
      json: 'JSONB',
      uuid: 'UUID',
      email: 'VARCHAR(255)',
      url: 'TEXT',
      enum: 'VARCHAR(50)',
    },
    mysql: {
      string: 'VARCHAR(255)',
      text: 'TEXT',
      integer: 'INT',
      bigint: 'BIGINT',
      decimal: 'DECIMAL(10, 2)',
      float: 'DOUBLE',
      boolean: 'TINYINT(1)',
      date: 'DATE',
      datetime: 'DATETIME',
      timestamp: 'TIMESTAMP',
      json: 'JSON',
      uuid: 'VARCHAR(36)',
      email: 'VARCHAR(255)',
      url: 'TEXT',
      enum: 'VARCHAR(50)',
    },
    sqlite: {
      string: 'TEXT',
      text: 'TEXT',
      integer: 'INTEGER',
      bigint: 'INTEGER',
      decimal: 'REAL',
      float: 'REAL',
      boolean: 'INTEGER',
      date: 'TEXT',
      datetime: 'TEXT',
      timestamp: 'TEXT',
      json: 'TEXT',
      uuid: 'TEXT',
      email: 'TEXT',
      url: 'TEXT',
      enum: 'TEXT',
    },
  };

  return typeMap[dbType][fieldType] || 'TEXT';
}

/**
 * Generate indexes for table
 */
function generateIndexesSQL(entity: Entity, dbType: DatabaseType): string {
  let sql = `-- Indexes for ${entity.tableName}\n`;

  for (const indexField of entity.indexes || []) {
    const indexName = `idx_${entity.tableName}_${indexField}`;
    sql += `CREATE INDEX ${indexName} ON ${entity.tableName}(${indexField});\n`;
  }

  return sql;
}

/**
 * Generate foreign key constraints
 */
function generateForeignKeysSQL(entity: Entity, dbType: DatabaseType): string {
  let sql = `-- Foreign keys for ${entity.tableName}\n`;

  for (const relationship of entity.relationships) {
    if (relationship.foreignKey) {
      const targetTable = toSnakeCase(pluralize(relationship.targetEntity));
      const constraintName = `fk_${entity.tableName}_${relationship.foreignKey}`;

      sql += `ALTER TABLE ${entity.tableName}\n`;
      sql += `  ADD CONSTRAINT ${constraintName}\n`;
      sql += `  FOREIGN KEY (${relationship.foreignKey})\n`;
      sql += `  REFERENCES ${targetTable}(id)`;

      if (relationship.onDelete) {
        sql += `\n  ON DELETE ${relationship.onDelete}`;
      }

      sql += ';\n';
    }
  }

  return sql;
}

/**
 * Generate TypeScript interfaces
 */
function generateTypeScript(entities: Entity[]): string {
  let ts = `// Generated TypeScript Types\n`;
  ts += `// Generated: ${new Date().toISOString()}\n\n`;

  for (const entity of entities) {
    ts += generateTypeScriptInterface(entity);
    ts += '\n';
  }

  return ts;
}

/**
 * Generate TypeScript interface for entity
 */
function generateTypeScriptInterface(entity: Entity): string {
  let ts = `export interface ${entity.name} {\n`;

  for (const field of entity.fields) {
    const optional = !field.required ? '?' : '';
    ts += `  ${field.name}${optional}: ${getTypeScriptType(field)};\n`;
  }

  ts += '}\n';

  // Generate create/update types
  ts += `\nexport type Create${entity.name} = Omit<${entity.name}, 'id' | 'created_at' | 'updated_at'>;\n`;
  ts += `export type Update${entity.name} = Partial<Create${entity.name}>;\n`;

  return ts;
}

/**
 * Map field to TypeScript type
 */
function getTypeScriptType(field: Field): string {
  if (field.validation?.enumValues) {
    return field.validation.enumValues.map(v => `'${v}'`).join(' | ');
  }

  const typeMap: Record<FieldType, string> = {
    string: 'string',
    text: 'string',
    integer: 'number',
    bigint: 'number',
    decimal: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'Date | string',
    datetime: 'Date | string',
    timestamp: 'Date | string',
    json: 'Record<string, any>',
    uuid: 'string',
    email: 'string',
    url: 'string',
    enum: 'string',
  };

  return typeMap[field.type] || 'string';
}

/**
 * Generate Prisma schema
 */
function generatePrismaSchema(entities: Entity[]): string {
  let prisma = `// Generated Prisma Schema\n`;
  prisma += `// Generated: ${new Date().toISOString()}\n\n`;

  prisma += `generator client {\n`;
  prisma += `  provider = "prisma-client-js"\n`;
  prisma += `}\n\n`;

  prisma += `datasource db {\n`;
  prisma += `  provider = "postgresql"\n`;
  prisma += `  url      = env("DATABASE_URL")\n`;
  prisma += `}\n\n`;

  for (const entity of entities) {
    prisma += generatePrismaModel(entity, entities);
    prisma += '\n';
  }

  return prisma;
}

/**
 * Generate Prisma model for entity
 */
function generatePrismaModel(entity: Entity, allEntities: Entity[]): string {
  let prisma = `model ${entity.name} {\n`;

  // Fields
  for (const field of entity.fields) {
    prisma += `  ${field.name} ${getPrismaType(field)}`;

    if (field.primaryKey) {
      prisma += ' @id @default(';
      if (field.type === 'uuid') {
        prisma += 'uuid()';
      } else {
        prisma += 'autoincrement()';
      }
      prisma += ')';
    }

    if (field.unique && !field.primaryKey) {
      prisma += ' @unique';
    }

    if (field.defaultValue && !field.primaryKey) {
      if (field.defaultValue === 'CURRENT_TIMESTAMP') {
        prisma += ' @default(now())';
      } else if (field.type === 'boolean') {
        prisma += ` @default(${field.defaultValue})`;
      }
    }

    prisma += '\n';
  }

  // Relationships
  for (const rel of entity.relationships) {
    if (rel.type === 'oneToMany') {
      const targetPlural = pluralize(rel.targetEntity.toLowerCase());
      prisma += `  ${targetPlural} ${rel.targetEntity}[]\n`;
    } else if (rel.type === 'oneToOne') {
      prisma += `  ${rel.targetEntity.toLowerCase()} ${rel.targetEntity}? @relation(fields: [${rel.foreignKey}], references: [id]`;
      if (rel.onDelete) {
        prisma += `, onDelete: ${rel.onDelete.replace(' ', '')}`;
      }
      prisma += ')\n';
    }
  }

  prisma += '  @@map("' + entity.tableName + '")\n';
  prisma += '}\n';

  return prisma;
}

/**
 * Get Prisma field type
 */
function getPrismaType(field: Field): string {
  const typeMap: Record<FieldType, string> = {
    string: 'String',
    text: 'String',
    integer: 'Int',
    bigint: 'BigInt',
    decimal: 'Decimal',
    float: 'Float',
    boolean: 'Boolean',
    date: 'DateTime',
    datetime: 'DateTime',
    timestamp: 'DateTime',
    json: 'Json',
    uuid: 'String',
    email: 'String',
    url: 'String',
    enum: 'String',
  };

  let type = typeMap[field.type] || 'String';

  if (!field.required && !field.primaryKey) {
    type += '?';
  }

  return type;
}

/**
 * Generate Drizzle schema
 */
function generateDrizzleSchema(entities: Entity[]): string {
  let drizzle = `// Generated Drizzle Schema\n`;
  drizzle += `// Generated: ${new Date().toISOString()}\n\n`;
  drizzle += `import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';\n\n`;

  for (const entity of entities) {
    drizzle += generateDrizzleTable(entity);
    drizzle += '\n';
  }

  return drizzle;
}

/**
 * Generate Drizzle table definition
 */
function generateDrizzleTable(entity: Entity): string {
  let drizzle = `export const ${entity.tableName} = sqliteTable('${entity.tableName}', {\n`;

  for (const field of entity.fields) {
    drizzle += `  ${field.name}: ${getDrizzleType(field)}`;

    if (field.primaryKey) {
      drizzle += '.primaryKey()';
    }

    if (field.required && !field.primaryKey) {
      drizzle += '.notNull()';
    }

    if (field.unique && !field.primaryKey) {
      drizzle += '.unique()';
    }

    drizzle += ',\n';
  }

  drizzle += '});\n';

  return drizzle;
}

/**
 * Get Drizzle field type
 */
function getDrizzleType(field: Field): string {
  const typeMap: Record<FieldType, string> = {
    string: 'text',
    text: 'text',
    integer: 'integer',
    bigint: 'integer',
    decimal: 'real',
    float: 'real',
    boolean: 'integer',
    date: 'text',
    datetime: 'text',
    timestamp: 'text',
    json: 'text',
    uuid: 'text',
    email: 'text',
    url: 'text',
    enum: 'text',
  };

  const type = typeMap[field.type] || 'text';
  return `${type}('${field.name}')`;
}

// Utility functions
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

function pluralize(word: string): string {
  if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
  if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch')) return word + 'es';
  return word + 's';
}
