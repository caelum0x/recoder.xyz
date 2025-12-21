/**
 * Seed Data Generator
 * Generates realistic seed data for database tables
 */

import type { Entity, Field, FieldType } from './entity-parser';

export interface SeedData {
  sql: string;
  json: Record<string, any[]>;
  typescript: string;
}

/**
 * Generate seed data for all entities
 */
export function generateSeedData(entities: Entity[], recordsPerEntity: number = 5): SeedData {
  const json: Record<string, any[]> = {};
  let sql = `-- Generated Seed Data\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n\n`;

  let typescript = `// Generated Seed Data\n`;
  typescript += `// Generated: ${new Date().toISOString()}\n\n`;

  for (const entity of entities) {
    const records = generateEntitySeedData(entity, recordsPerEntity);
    json[entity.tableName] = records;

    sql += generateSeedSQL(entity, records);
    sql += '\n';

    typescript += generateSeedTypeScript(entity, records);
    typescript += '\n';
  }

  return { sql, json, typescript };
}

/**
 * Generate seed records for a single entity
 */
function generateEntitySeedData(entity: Entity, count: number): any[] {
  const records: any[] = [];

  for (let i = 1; i <= count; i++) {
    const record: any = {};

    for (const field of entity.fields) {
      // Skip auto-generated fields
      if (field.primaryKey && field.type === 'uuid') {
        record[field.name] = generateUUID();
      } else if (field.primaryKey && field.type === 'integer') {
        record[field.name] = i;
      } else if (field.name === 'created_at' || field.name === 'updated_at') {
        record[field.name] = new Date().toISOString();
      } else {
        record[field.name] = generateFieldValue(field, i, entity.name);
      }
    }

    records.push(record);
  }

  return records;
}

/**
 * Generate realistic value for a field
 */
function generateFieldValue(field: Field, index: number, entityName: string): any {
  // Handle enum fields
  if (field.validation?.enumValues && field.validation.enumValues.length > 0) {
    const enumValues = field.validation.enumValues;
    return enumValues[index % enumValues.length];
  }

  // Handle default values
  if (field.defaultValue && field.defaultValue !== 'CURRENT_TIMESTAMP') {
    return field.defaultValue === 'false' ? false : field.defaultValue === 'true' ? true : field.defaultValue;
  }

  // Generate based on field name patterns
  const fieldName = field.name.toLowerCase();

  // Email fields
  if (field.type === 'email' || fieldName.includes('email')) {
    return `user${index}@example.com`;
  }

  // URL fields
  if (field.type === 'url' || fieldName.includes('url') || fieldName.includes('avatar') || fieldName.includes('image')) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${index}`;
  }

  // Name fields
  if (fieldName.includes('name') && !fieldName.includes('user')) {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
    return `${names[index % names.length]} ${entityName} ${index}`;
  }

  if (fieldName === 'username') {
    return `user${index}`;
  }

  // Title fields
  if (fieldName === 'title') {
    const titles = [
      'Introduction to',
      'Advanced Guide to',
      'Getting Started with',
      'Deep Dive into',
      'Best Practices for',
      'Complete Tutorial on',
      'Understanding',
      'Mastering',
    ];
    return `${titles[index % titles.length]} ${entityName}`;
  }

  // Content/description fields
  if (fieldName === 'content' || fieldName === 'description') {
    return `This is sample ${fieldName} for ${entityName} number ${index}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;
  }

  // Slug fields
  if (fieldName === 'slug') {
    return `${entityName.toLowerCase()}-${index}`;
  }

  // Password fields
  if (fieldName === 'password') {
    return '$2a$10$YourHashedPasswordHere'; // Bcrypt hash placeholder
  }

  // Status fields
  if (fieldName === 'status') {
    const statuses = ['active', 'inactive', 'pending'];
    return statuses[index % statuses.length];
  }

  // Priority fields
  if (fieldName === 'priority') {
    const priorities = ['low', 'medium', 'high'];
    return priorities[index % priorities.length];
  }

  // Price/amount fields
  if (fieldName.includes('price') || fieldName.includes('amount') || fieldName.includes('total')) {
    return (index * 9.99).toFixed(2);
  }

  // Stock/quantity fields
  if (fieldName.includes('stock') || fieldName.includes('quantity')) {
    return index * 10;
  }

  // SKU fields
  if (fieldName === 'sku') {
    return `SKU-${String(index).padStart(6, '0')}`;
  }

  // Order number fields
  if (fieldName.includes('order_number')) {
    return `ORD-${new Date().getFullYear()}-${String(index).padStart(5, '0')}`;
  }

  // Generate based on type
  switch (field.type) {
    case 'string':
      return `Sample ${field.name} ${index}`;

    case 'text':
      return `This is sample text for ${field.name}. It can be longer and contain more detailed information about ${entityName} number ${index}.`;

    case 'integer':
    case 'bigint':
      return index * 100;

    case 'decimal':
    case 'float':
      return (index * 99.99).toFixed(2);

    case 'boolean':
      return index % 2 === 0;

    case 'date':
      const date = new Date();
      date.setDate(date.getDate() + index);
      return date.toISOString().split('T')[0];

    case 'datetime':
    case 'timestamp':
      return new Date(Date.now() + index * 86400000).toISOString();

    case 'json':
      return { key: `value${index}`, index };

    case 'uuid':
      return generateUUID();

    default:
      return `value${index}`;
  }
}

/**
 * Generate INSERT statements
 */
function generateSeedSQL(entity: Entity, records: any[]): string {
  let sql = `-- Seed data for ${entity.tableName}\n`;

  for (const record of records) {
    const columns = Object.keys(record);
    const values = columns.map(col => formatSQLValue(record[col]));

    sql += `INSERT INTO ${entity.tableName} (${columns.join(', ')})\n`;
    sql += `VALUES (${values.join(', ')});\n`;
  }

  return sql;
}

/**
 * Format value for SQL
 */
function formatSQLValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  return String(value);
}

/**
 * Generate TypeScript seed data
 */
function generateSeedTypeScript(entity: Entity, records: any[]): string {
  let ts = `export const ${entity.tableName}SeedData = ${JSON.stringify(records, null, 2)};\n`;
  return ts;
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate seed data script for Node.js
 */
export function generateSeedScript(entities: Entity[]): string {
  let script = `// Database Seed Script\n`;
  script += `// Run with: node seed.js\n\n`;

  script += `import { db } from './db';\n\n`;

  for (const entity of entities) {
    const records = generateEntitySeedData(entity, 10);
    script += `const ${entity.tableName}Data = ${JSON.stringify(records, null, 2)};\n\n`;
  }

  script += `async function seed() {\n`;
  script += `  console.log('🌱 Seeding database...');\n\n`;

  for (const entity of entities) {
    script += `  // Seed ${entity.tableName}\n`;
    script += `  console.log('Seeding ${entity.tableName}...');\n`;
    script += `  for (const record of ${entity.tableName}Data) {\n`;
    script += `    await db.${entity.tableName}.create({ data: record });\n`;
    script += `  }\n`;
    script += `  console.log('✓ ${entity.tableName} seeded');\n\n`;
  }

  script += `  console.log('✅ Database seeded successfully!');\n`;
  script += `}\n\n`;

  script += `seed()\n`;
  script += `  .catch((error) => {\n`;
  script += `    console.error('❌ Seed failed:', error);\n`;
  script += `    process.exit(1);\n`;
  script += `  })\n`;
  script += `  .finally(() => {\n`;
  script += `    process.exit(0);\n`;
  script += `  });\n`;

  return script;
}
