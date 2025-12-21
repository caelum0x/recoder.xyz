/**
 * Entity Parser
 * Extracts database entities and relationships from natural language descriptions
 */

export interface Entity {
  name: string;
  tableName: string;
  fields: Field[];
  relationships: Relationship[];
  indexes?: string[];
  description?: string;
}

export interface Field {
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  description?: string;
  validation?: FieldValidation;
}

export type FieldType =
  | 'string'
  | 'text'
  | 'integer'
  | 'bigint'
  | 'decimal'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'json'
  | 'uuid'
  | 'email'
  | 'url'
  | 'enum';

export interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enumValues?: string[];
}

export interface Relationship {
  type: 'oneToOne' | 'oneToMany' | 'manyToMany';
  targetEntity: string;
  foreignKey?: string;
  inverseSide?: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface ParsedSchema {
  entities: Entity[];
  relationships: Map<string, Relationship[]>;
}

/**
 * Parse natural language description to extract entities
 */
export function parseEntities(description: string): ParsedSchema {
  const entities: Entity[] = [];
  const relationshipMap = new Map<string, Relationship[]>();

  // Normalize input
  const normalizedInput = description.toLowerCase();

  // Detect common entity patterns
  const entityPatterns = detectEntityPatterns(normalizedInput);

  // Parse each detected entity
  for (const pattern of entityPatterns) {
    const entity = parseEntity(pattern, description);
    if (entity) {
      entities.push(entity);
      if (entity.relationships.length > 0) {
        relationshipMap.set(entity.name, entity.relationships);
      }
    }
  }

  // Auto-detect relationships from context
  detectImplicitRelationships(entities, description);

  return { entities, relationships: relationshipMap };
}

/**
 * Detect entity patterns in description
 */
function detectEntityPatterns(input: string): Array<{
  name: string;
  context: string;
}> {
  const patterns: Array<{ name: string; context: string }> = [];

  // Words to ignore (stop words)
  const stopWords = new Set([
    'and', 'or', 'with', 'the', 'a', 'an', 'that', 'this', 'can', 'has', 'have',
    'each', 'many', 'multiple', 'several', 'some', 'all', 'any', 'every',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
  ]);

  // Common patterns for entity detection
  const entityIndicators = [
    // "Create a blog with users, posts, and comments"
    /(?:with|including|contains?|have|need)\s+([a-z]+(?:,\s*[a-z]+)*(?:,?\s*(?:and|&)\s*[a-z]+)?)/gi,
    
    // "Build a task manager with projects and tasks"
    /(?:build|create|make)\s+(?:a|an)\s+([a-z\s]+?)\s+(?:with|that has)/gi,
    
    // "User has many posts"
    /([a-z]+)\s+(?:has|have|contains?)\s+(?:many|multiple|several)\s+([a-z]+)/gi,
    
    // "Post belongs to user"
    /([a-z]+)\s+belongs\s+to\s+([a-z]+)/gi,
    
    // Direct entity mentions
    /(?:^|\s)([a-z]+)\s+(?:table|model|entity|collection)/gi,
  ];

  for (const regex of entityIndicators) {
    let match;
    while ((match = regex.exec(input)) !== null) {
      const captured = match[1];
      if (captured) {
        // Split on commas, "and", "&"
        const entities = captured.split(/[,&]|\s+and\s+/).map(e => e.trim());
        for (const entity of entities) {
          // Filter out stop words and short words
          if (entity && entity.length > 2 && !stopWords.has(entity.toLowerCase())) {
            patterns.push({
              name: entity,
              context: match[0],
            });
          }
        }
      }

      // Handle second capture group (for "has many" pattern)
      if (match[2]) {
        const entity = match[2].trim();
        if (entity && entity.length > 2 && !stopWords.has(entity.toLowerCase())) {
          patterns.push({
            name: entity,
            context: match[0],
          });
        }
      }
    }
  }

  // Deduplicate
  const uniquePatterns = new Map<string, { name: string; context: string }>();
  for (const pattern of patterns) {
    const normalized = pluralize(pattern.name.toLowerCase());
    if (!uniquePatterns.has(normalized)) {
      uniquePatterns.set(normalized, {
        name: normalized,
        context: pattern.context,
      });
    }
  }

  return Array.from(uniquePatterns.values());
}

/**
 * Parse a single entity from pattern and description
 */
function parseEntity(
  pattern: { name: string; context: string },
  fullDescription: string
): Entity | null {
  const entityName = pattern.name;
  const tableName = toSnakeCase(pluralize(entityName));

  // Common fields for all entities
  const commonFields: Field[] = [
    {
      name: 'id',
      type: 'uuid',
      required: true,
      unique: true,
      primaryKey: true,
    },
    {
      name: 'created_at',
      type: 'timestamp',
      required: true,
      unique: false,
      primaryKey: false,
      defaultValue: 'CURRENT_TIMESTAMP',
    },
    {
      name: 'updated_at',
      type: 'timestamp',
      required: true,
      unique: false,
      primaryKey: false,
      defaultValue: 'CURRENT_TIMESTAMP',
    },
  ];

  // Entity-specific fields based on common patterns
  const specificFields = inferFieldsForEntity(entityName, fullDescription);

  // Detect relationships
  const relationships = detectRelationships(entityName, fullDescription);

  return {
    name: capitalize(singularize(entityName)),
    tableName,
    fields: [...commonFields, ...specificFields],
    relationships,
    indexes: generateIndexes(specificFields),
  };
}

/**
 * Infer fields for an entity based on its name and context
 */
function inferFieldsForEntity(entityName: string, description: string): Field[] {
  const fields: Field[] = [];
  const lowerName = entityName.toLowerCase();

  // Common entity field patterns
  const fieldPatterns: Record<string, () => Field[]> = {
    user: () => [
      { name: 'email', type: 'email', required: true, unique: true, primaryKey: false },
      { name: 'username', type: 'string', required: false, unique: true, primaryKey: false },
      { name: 'password', type: 'string', required: true, unique: false, primaryKey: false },
      { name: 'name', type: 'string', required: false, unique: false, primaryKey: false },
      { name: 'avatar', type: 'url', required: false, unique: false, primaryKey: false },
    ],
    post: () => [
      { name: 'title', type: 'string', required: true, unique: false, primaryKey: false },
      { name: 'content', type: 'text', required: true, unique: false, primaryKey: false },
      { name: 'slug', type: 'string', required: false, unique: true, primaryKey: false },
      { name: 'published', type: 'boolean', required: true, unique: false, primaryKey: false, defaultValue: 'false' },
      { name: 'published_at', type: 'timestamp', required: false, unique: false, primaryKey: false },
    ],
    comment: () => [
      { name: 'content', type: 'text', required: true, unique: false, primaryKey: false },
      { name: 'author_name', type: 'string', required: false, unique: false, primaryKey: false },
      { name: 'author_email', type: 'email', required: false, unique: false, primaryKey: false },
    ],
    product: () => [
      { name: 'name', type: 'string', required: true, unique: false, primaryKey: false },
      { name: 'description', type: 'text', required: false, unique: false, primaryKey: false },
      { name: 'price', type: 'decimal', required: true, unique: false, primaryKey: false },
      { name: 'sku', type: 'string', required: false, unique: true, primaryKey: false },
      { name: 'stock', type: 'integer', required: true, unique: false, primaryKey: false, defaultValue: '0' },
      { name: 'image_url', type: 'url', required: false, unique: false, primaryKey: false },
    ],
    order: () => [
      { name: 'order_number', type: 'string', required: true, unique: true, primaryKey: false },
      { name: 'total_amount', type: 'decimal', required: true, unique: false, primaryKey: false },
      { name: 'status', type: 'enum', required: true, unique: false, primaryKey: false, 
        validation: { enumValues: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] }
      },
    ],
    category: () => [
      { name: 'name', type: 'string', required: true, unique: true, primaryKey: false },
      { name: 'description', type: 'text', required: false, unique: false, primaryKey: false },
      { name: 'slug', type: 'string', required: false, unique: true, primaryKey: false },
    ],
    tag: () => [
      { name: 'name', type: 'string', required: true, unique: true, primaryKey: false },
      { name: 'slug', type: 'string', required: false, unique: true, primaryKey: false },
    ],
    task: () => [
      { name: 'title', type: 'string', required: true, unique: false, primaryKey: false },
      { name: 'description', type: 'text', required: false, unique: false, primaryKey: false },
      { name: 'status', type: 'enum', required: true, unique: false, primaryKey: false,
        validation: { enumValues: ['todo', 'in_progress', 'done', 'cancelled'] }
      },
      { name: 'priority', type: 'enum', required: false, unique: false, primaryKey: false,
        validation: { enumValues: ['low', 'medium', 'high', 'urgent'] }
      },
      { name: 'due_date', type: 'date', required: false, unique: false, primaryKey: false },
    ],
    project: () => [
      { name: 'name', type: 'string', required: true, unique: false, primaryKey: false },
      { name: 'description', type: 'text', required: false, unique: false, primaryKey: false },
      { name: 'status', type: 'enum', required: true, unique: false, primaryKey: false,
        validation: { enumValues: ['planning', 'active', 'on_hold', 'completed', 'archived'] }
      },
      { name: 'start_date', type: 'date', required: false, unique: false, primaryKey: false },
      { name: 'end_date', type: 'date', required: false, unique: false, primaryKey: false },
    ],
  };

  // Check if we have predefined fields for this entity type
  for (const [key, generator] of Object.entries(fieldPatterns)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      fields.push(...generator());
      break;
    }
  }

  // If no predefined fields, create generic ones
  if (fields.length === 0) {
    fields.push(
      { name: 'name', type: 'string', required: true, unique: false, primaryKey: false },
      { name: 'description', type: 'text', required: false, unique: false, primaryKey: false }
    );
  }

  return fields;
}

/**
 * Detect relationships between entities
 */
function detectRelationships(entityName: string, description: string): Relationship[] {
  const relationships: Relationship[] = [];
  const lowerDesc = description.toLowerCase();
  const lowerEntity = entityName.toLowerCase();

  // Pattern: "user has many posts"
  const hasManyRegex = new RegExp(
    `${lowerEntity}\\s+(?:has|have)\\s+(?:many|multiple|several)\\s+([a-z]+)`,
    'gi'
  );
  let match = hasManyRegex.exec(lowerDesc);
  if (match) {
    relationships.push({
      type: 'oneToMany',
      targetEntity: capitalize(singularize(match[1])),
      foreignKey: `${toSnakeCase(singularize(entityName))}_id`,
    });
  }

  // Pattern: "post belongs to user"
  const belongsToRegex = new RegExp(
    `${lowerEntity}\\s+belongs\\s+to\\s+([a-z]+)`,
    'gi'
  );
  match = belongsToRegex.exec(lowerDesc);
  if (match) {
    relationships.push({
      type: 'oneToOne',
      targetEntity: capitalize(singularize(match[1])),
      foreignKey: `${toSnakeCase(singularize(match[1]))}_id`,
      onDelete: 'CASCADE',
    });
  }

  // Common implicit relationships
  if (lowerEntity.includes('comment')) {
    // Comments usually belong to posts and users
    if (!relationships.find(r => r.targetEntity.toLowerCase().includes('user'))) {
      relationships.push({
        type: 'oneToOne',
        targetEntity: 'User',
        foreignKey: 'user_id',
        onDelete: 'CASCADE',
      });
    }
    if (!relationships.find(r => r.targetEntity.toLowerCase().includes('post'))) {
      relationships.push({
        type: 'oneToOne',
        targetEntity: 'Post',
        foreignKey: 'post_id',
        onDelete: 'CASCADE',
      });
    }
  }

  return relationships;
}

/**
 * Detect implicit relationships from entity list
 */
function detectImplicitRelationships(entities: Entity[], description: string): void {
  const entityNames = entities.map(e => e.name.toLowerCase());

  for (const entity of entities) {
    const lowerName = entity.name.toLowerCase();

    // If we have users and this entity is not user, add user_id
    if (entityNames.includes('user') && lowerName !== 'user') {
      if (!entity.fields.find(f => f.name === 'user_id')) {
        entity.fields.push({
          name: 'user_id',
          type: 'uuid',
          required: true,
          unique: false,
          primaryKey: false,
          description: `Foreign key to users table`,
        });
      }

      if (!entity.relationships.find(r => r.targetEntity === 'User')) {
        entity.relationships.push({
          type: 'oneToOne',
          targetEntity: 'User',
          foreignKey: 'user_id',
          onDelete: 'CASCADE',
        });
      }
    }
  }
}

/**
 * Generate appropriate indexes for fields
 */
function generateIndexes(fields: Field[]): string[] {
  const indexes: string[] = [];

  for (const field of fields) {
    // Create indexes for foreign keys and unique fields
    if (field.name.endsWith('_id') || field.unique) {
      indexes.push(field.name);
    }

    // Email and username fields should be indexed
    if (['email', 'username', 'slug'].includes(field.name)) {
      indexes.push(field.name);
    }
  }

  return indexes;
}

// Utility functions

function singularize(word: string): string {
  const lower = word.toLowerCase();
  
  // Handle special cases
  if (lower === 'users') return 'user';
  if (lower === 'posts') return 'post';
  if (lower === 'comments') return 'comment';
  if (lower === 'products') return 'product';
  if (lower === 'orders') return 'order';
  if (lower === 'categories') return 'category';
  if (lower === 'tags') return 'tag';
  if (lower === 'tasks') return 'task';
  if (lower === 'projects') return 'project';
  
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 2) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function pluralize(word: string): string {
  const lower = word.toLowerCase();
  
  // Handle special cases
  if (lower === 'user') return 'users';
  if (lower === 'post') return 'posts';
  if (lower === 'comment') return 'comments';
  if (lower === 'product') return 'products';
  if (lower === 'order') return 'orders';
  if (lower === 'category') return 'categories';
  if (lower === 'tag') return 'tags';
  if (lower === 'task') return 'tasks';
  if (lower === 'project') return 'projects';
  
  // Already plural
  if (word.endsWith('s') || word.endsWith('es')) {
    return word;
  }
  
  if (word.endsWith('y') && word.length > 1 && !'aeiou'.includes(word[word.length - 2])) {
    return word.slice(0, -1) + 'ies';
  }
  
  if (word.endsWith('sh') || word.endsWith('ch') || word.endsWith('x') || word.endsWith('z')) {
    return word + 'es';
  }
  
  return word + 's';
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
