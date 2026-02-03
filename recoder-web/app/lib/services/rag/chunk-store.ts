import type { z } from "zod";
import {
  createChunkStoreColumnMapping,
  CHUNK_STORE_REQUIRED_COLUMNS,
  type ChunkStoreRequiredColumns,
  type ColumnMapping,
} from "./column-mapping";
import {
  PoolManager,
  ensurePgVectorTypes,
  EMBEDDING_COLUMNS,
  escapeIdentifier,
  vectorToSql,
  type NeonClient,
} from "./database";
import {
  ConfigurationError,
  DatabaseError,
  ValidationError,
} from "./errors";
import type {
  ChunkStore,
  ChunkWithEmbedding,
  DatabaseConfig,
  EmbeddingProfileId,
} from "./types";
import { EMBEDDING_PROFILES } from "./types";
import { replaceNullCharacters } from "./utils";

/**
 * Map metadata to column names
 */
export function mapMetadataToColumns<TMetadata extends Record<string, unknown>>(
  metadata: TMetadata,
  columnMapping: ColumnMapping<TMetadata>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      key in columnMapping &&
      !CHUNK_STORE_REQUIRED_COLUMNS.includes(
        key as (typeof CHUNK_STORE_REQUIRED_COLUMNS)[number]
      )
    ) {
      const columnName = columnMapping[key as keyof typeof columnMapping];
      result[columnName] = value;
    }
  }

  return result;
}

/**
 * Build a parameterized query with numbered placeholders
 */
function buildParameterizedQuery(
  sql: string,
  values: unknown[]
): { query: string; params: unknown[] } {
  let paramIndex = 1;
  const params: unknown[] = [];

  const query = sql.replace(/\?/g, () => {
    params.push(values[paramIndex - 1]);
    return `$${paramIndex++}`;
  });

  return { query, params };
}

/**
 * Delete chunks by document key
 */
async function deleteChunksByDocumentKey(
  client: NeonClient,
  tableName: string,
  documentKey: string,
  documentKeyColumn: string,
  scope: Record<string, unknown>,
  embeddingProfileId: number,
  embeddingDimensions: number
): Promise<void> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  conditions.push(`${escapeIdentifier(documentKeyColumn)} = $${paramIndex++}`);
  values.push(documentKey);

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.PROFILE_ID)} = $${paramIndex++}`);
  values.push(embeddingProfileId);

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.DIMENSIONS)} = $${paramIndex++}`);
  values.push(embeddingDimensions);

  const scopeKeys = Object.keys(scope).sort();
  for (const key of scopeKeys) {
    conditions.push(`${escapeIdentifier(key)} = $${paramIndex++}`);
    values.push(scope[key]);
  }

  const query = `
    DELETE FROM ${escapeIdentifier(tableName)}
    WHERE ${conditions.join(" AND ")}
  `;

  await client.query(query, values);
}

/**
 * Insert chunks with embeddings
 */
async function insertChunks<TMetadata extends Record<string, unknown>>(
  client: NeonClient,
  tableName: string,
  documentKey: string,
  chunks: ChunkWithEmbedding[],
  metadata: TMetadata,
  columnMapping: ColumnMapping<TMetadata>,
  scope: Record<string, unknown>,
  embeddingProfileId: number,
  embeddingDimensions: number
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  const metadataColumns = mapMetadataToColumns(metadata, columnMapping);

  // Build column list
  const baseColumns = [
    columnMapping.documentKey,
    columnMapping.chunkContent,
    columnMapping.chunkIndex,
    ...Object.keys(metadataColumns),
    ...Object.keys(scope),
    EMBEDDING_COLUMNS.VECTOR,
    EMBEDDING_COLUMNS.PROFILE_ID,
    EMBEDDING_COLUMNS.DIMENSIONS,
  ];

  // Insert chunks in batches
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const valuePlaceholders: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const chunk of batch) {
      const placeholders: string[] = [];

      // Document key
      placeholders.push(`$${paramIndex++}`);
      values.push(documentKey);

      // Chunk content
      placeholders.push(`$${paramIndex++}`);
      values.push(replaceNullCharacters(chunk.content));

      // Chunk index
      placeholders.push(`$${paramIndex++}`);
      values.push(chunk.index);

      // Metadata columns
      for (const value of Object.values(metadataColumns)) {
        placeholders.push(`$${paramIndex++}`);
        values.push(value);
      }

      // Scope columns
      for (const value of Object.values(scope)) {
        placeholders.push(`$${paramIndex++}`);
        values.push(value);
      }

      // Embedding vector (as text, PostgreSQL will cast to vector)
      placeholders.push(`$${paramIndex++}`);
      values.push(vectorToSql(chunk.embedding));

      // Embedding profile ID
      placeholders.push(`$${paramIndex++}`);
      values.push(embeddingProfileId);

      // Embedding dimensions
      placeholders.push(`$${paramIndex++}`);
      values.push(embeddingDimensions);

      valuePlaceholders.push(`(${placeholders.join(", ")})`);
    }

    const query = `
      INSERT INTO ${escapeIdentifier(tableName)}
      (${baseColumns.map(escapeIdentifier).join(", ")})
      VALUES ${valuePlaceholders.join(", ")}
    `;

    await client.query(query, values);
  }
}

/**
 * Delete chunks by multiple document keys
 */
async function deleteChunksByDocumentKeys(
  client: NeonClient,
  tableName: string,
  documentKeys: string[],
  documentKeyColumn: string,
  scope: Record<string, unknown>,
  embeddingProfileId: number,
  embeddingDimensions: number
): Promise<void> {
  if (documentKeys.length === 0) {
    return;
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.PROFILE_ID)} = $${paramIndex++}`);
  values.push(embeddingProfileId);

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.DIMENSIONS)} = $${paramIndex++}`);
  values.push(embeddingDimensions);

  const scopeKeys = Object.keys(scope).sort();
  for (const key of scopeKeys) {
    conditions.push(`${escapeIdentifier(key)} = $${paramIndex++}`);
    values.push(scope[key]);
  }

  // Build IN clause
  const inPlaceholders = documentKeys.map(() => `$${paramIndex++}`).join(", ");
  conditions.push(`${escapeIdentifier(documentKeyColumn)} IN (${inPlaceholders})`);
  values.push(...documentKeys);

  const query = `
    DELETE FROM ${escapeIdentifier(tableName)}
    WHERE ${conditions.join(" AND ")}
  `;

  await client.query(query, values);
}

/**
 * Get document versions for differential ingestion
 */
async function queryDocumentVersions(
  client: NeonClient,
  tableName: string,
  documentKeyColumn: string,
  versionColumn: string,
  metadataVersionColumn: string | undefined,
  scope: Record<string, unknown>,
  embeddingProfileId: number,
  embeddingDimensions: number
): Promise<
  Array<{
    documentKey: string;
    version: string;
    metadataVersion?: string;
  }>
> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.PROFILE_ID)} = $${paramIndex++}`);
  values.push(embeddingProfileId);

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.DIMENSIONS)} = $${paramIndex++}`);
  values.push(embeddingDimensions);

  const scopeKeys = Object.keys(scope).sort();
  for (const key of scopeKeys) {
    conditions.push(`${escapeIdentifier(key)} = $${paramIndex++}`);
    values.push(scope[key]);
  }

  conditions.push(`${escapeIdentifier(versionColumn)} IS NOT NULL`);

  const selectColumns = [
    `${escapeIdentifier(documentKeyColumn)} as document_key`,
    `${escapeIdentifier(versionColumn)} as version`,
  ];

  if (metadataVersionColumn) {
    selectColumns.push(
      `${escapeIdentifier(metadataVersionColumn)} as metadata_version`
    );
  }

  const query = `
    SELECT DISTINCT
      ${selectColumns.join(",\n      ")}
    FROM ${escapeIdentifier(tableName)}
    WHERE ${conditions.join(" AND ")}
  `;

  const result = await client.query<{
    document_key: unknown;
    version: unknown;
    metadata_version?: unknown;
  }>(query, values);

  return result.map((row) => ({
    documentKey: toColumnString(row.document_key, "documentKey"),
    version: toColumnString(row.version, "version"),
    metadataVersion: row.metadata_version
      ? toColumnString(row.metadata_version, "metadataVersion")
      : undefined,
  }));
}

/**
 * Update metadata fields without re-embedding
 */
async function updateMetadataFields(
  client: NeonClient,
  tableName: string,
  documentKey: string,
  documentKeyColumn: string,
  metadata: Record<string, unknown>,
  columnMapping: Record<string, string>,
  scope: Record<string, unknown>,
  embeddingProfileId: number,
  embeddingDimensions: number
): Promise<void> {
  const setExpressions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [metadataKey, value] of Object.entries(metadata)) {
    const columnName = columnMapping[metadataKey];
    if (!columnName) {
      continue;
    }
    setExpressions.push(`${escapeIdentifier(columnName)} = $${paramIndex++}`);
    values.push(value);
  }

  if (setExpressions.length === 0) {
    return;
  }

  const conditions: string[] = [];

  conditions.push(`${escapeIdentifier(documentKeyColumn)} = $${paramIndex++}`);
  values.push(documentKey);

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.PROFILE_ID)} = $${paramIndex++}`);
  values.push(embeddingProfileId);

  conditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.DIMENSIONS)} = $${paramIndex++}`);
  values.push(embeddingDimensions);

  const scopeKeys = Object.keys(scope).sort();
  for (const key of scopeKeys) {
    conditions.push(`${escapeIdentifier(key)} = $${paramIndex++}`);
    values.push(scope[key]);
  }

  const query = `
    UPDATE ${escapeIdentifier(tableName)}
    SET ${setExpressions.join(", ")}
    WHERE ${conditions.join(" AND ")}
  `;

  await client.query(query, values);
}

/**
 * Convert various types to string for database columns
 */
function toColumnString(v: unknown, columnName: string): string {
  if (v == null) {
    throw new ConfigurationError(
      `${columnName} column value is null`,
      columnName,
      { value: v }
    );
  }
  if (typeof v === "string") {
    return v;
  }
  if (
    typeof v === "number" ||
    typeof v === "bigint" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (Array.isArray(v)) {
    throw new ConfigurationError(
      `${columnName} column has unsupported type: array`,
      columnName,
      { value: v, type: "array" }
    );
  }
  if (typeof v === "object") {
    throw new ConfigurationError(
      `${columnName} column has unsupported type: object`,
      columnName,
      { value: v, type: "object" }
    );
  }

  throw new ConfigurationError(
    `${columnName} column has unsupported type: ${typeof v}`,
    columnName,
    { value: v, type: typeof v }
  );
}

/**
 * Create a PostgreSQL chunk store using Neon serverless
 */
export function createPostgresChunkStore<
  TSchema extends z.ZodType<Record<string, unknown>>
>(config: {
  database: DatabaseConfig;
  tableName: string;
  metadataSchema: TSchema;
  scope: Record<string, unknown>;
  embeddingProfileId: EmbeddingProfileId;
  requiredColumnOverrides?: Partial<ChunkStoreRequiredColumns>;
  metadataColumnOverrides?: Partial<Record<keyof z.infer<TSchema>, string>>;
}): ChunkStore<z.infer<TSchema>> {
  const {
    database,
    tableName,
    metadataSchema,
    scope,
    embeddingProfileId,
    requiredColumnOverrides,
    metadataColumnOverrides,
  } = config;

  const columnMapping = createChunkStoreColumnMapping({
    metadataSchema,
    requiredColumnOverrides,
    metadataColumnOverrides,
  });

  // Validate embedding profile
  const profile = EMBEDDING_PROFILES[embeddingProfileId];
  if (!profile) {
    throw new ConfigurationError(
      `Invalid embedding profile ID: ${embeddingProfileId}. Valid IDs are: ${Object.keys(EMBEDDING_PROFILES).join(", ")}`
    );
  }
  if (!profile.dimensions) {
    throw new ConfigurationError(
      `Embedding profile ${embeddingProfileId} is missing dimensions`
    );
  }

  // Use a numeric ID for the profile (index in the array)
  const profileNumericId = Object.keys(EMBEDDING_PROFILES).indexOf(embeddingProfileId);

  /**
   * Insert chunks with metadata
   */
  async function insert(
    documentKey: string,
    chunks: ChunkWithEmbedding[],
    metadata: z.infer<TSchema>
  ): Promise<void> {
    const result = metadataSchema.safeParse(metadata);
    if (!result.success) {
      throw ValidationError.fromZodError(result.error, {
        operation: "insert",
        documentKey,
        tableName,
      });
    }

    if (chunks.length === 0) {
      return;
    }

    const client = PoolManager.getConnection(database);

    try {
      await ensurePgVectorTypes(client, database.connectionString);

      // Delete existing chunks for this document
      await deleteChunksByDocumentKey(
        client,
        tableName,
        documentKey,
        columnMapping.documentKey,
        scope,
        profileNumericId,
        profile.dimensions
      );

      // Insert new chunks
      await insertChunks(
        client,
        tableName,
        documentKey,
        chunks,
        metadata,
        columnMapping,
        scope,
        profileNumericId,
        profile.dimensions
      );
    } catch (error) {
      throw DatabaseError.transactionFailed(
        "chunk insertion",
        error instanceof Error ? error : undefined,
        {
          operation: "insert",
          documentKey,
          tableName,
          chunkCount: chunks.length,
        }
      );
    }
  }

  /**
   * Delete chunks by document key
   */
  async function deleteDocument(documentKey: string): Promise<void> {
    const client = PoolManager.getConnection(database);

    try {
      await ensurePgVectorTypes(client, database.connectionString);
      await deleteChunksByDocumentKey(
        client,
        tableName,
        documentKey,
        columnMapping.documentKey,
        scope,
        profileNumericId,
        profile.dimensions
      );
    } catch (error) {
      throw DatabaseError.queryFailed(
        `DELETE FROM ${tableName}`,
        error instanceof Error ? error : undefined,
        {
          operation: "deleteDocument",
          documentKey,
          tableName,
        }
      );
    }
  }

  /**
   * Delete chunks associated with multiple document keys
   */
  async function deleteBatch(documentKeys: string[]): Promise<void> {
    if (documentKeys.length === 0) {
      return;
    }

    const client = PoolManager.getConnection(database);

    try {
      await ensurePgVectorTypes(client, database.connectionString);

      await deleteChunksByDocumentKeys(
        client,
        tableName,
        documentKeys,
        columnMapping.documentKey,
        scope,
        profileNumericId,
        profile.dimensions
      );
    } catch (error) {
      throw DatabaseError.queryFailed(
        `DELETE FROM ${tableName}`,
        error instanceof Error ? error : undefined,
        {
          operation: "deleteBatch",
          documentKeyCount: documentKeys.length,
          tableName,
        }
      );
    }
  }

  /**
   * Get document versions for differential ingestion
   */
  async function getDocumentVersions(): Promise<
    Array<{
      documentKey: string;
      version: string;
      metadataVersion?: string;
    }>
  > {
    if (!columnMapping.version) {
      throw ConfigurationError.missingField("columnMapping.version", {
        hint: "Please provide systemColumns.version when calling createColumnMapping",
      });
    }

    const client = PoolManager.getConnection(database);

    try {
      await ensurePgVectorTypes(client, database.connectionString);

      return await queryDocumentVersions(
        client,
        tableName,
        columnMapping.documentKey,
        columnMapping.version,
        (columnMapping as Record<string, string>).metadataVersion,
        scope,
        profileNumericId,
        profile.dimensions
      );
    } catch (error) {
      throw DatabaseError.queryFailed(
        `SELECT DISTINCT ${columnMapping.documentKey}, ${columnMapping.version} FROM ${tableName}`,
        error instanceof Error ? error : undefined,
        {
          operation: "getDocumentVersions",
          tableName,
        }
      );
    }
  }

  /**
   * Update metadata only without re-embedding
   */
  async function updateMetadata(
    documentKey: string,
    metadata: z.infer<TSchema>
  ): Promise<void> {
    const result = metadataSchema.safeParse(metadata);
    if (!result.success) {
      throw ValidationError.fromZodError(result.error, {
        operation: "updateMetadata",
        documentKey,
        tableName,
      });
    }

    const client = PoolManager.getConnection(database);

    try {
      await ensurePgVectorTypes(client, database.connectionString);
      await updateMetadataFields(
        client,
        tableName,
        documentKey,
        columnMapping.documentKey,
        metadata,
        columnMapping as Record<string, string>,
        scope,
        profileNumericId,
        profile.dimensions
      );
    } catch (error) {
      throw DatabaseError.queryFailed(
        `UPDATE ${tableName} metadata`,
        error instanceof Error ? error : undefined,
        {
          operation: "updateMetadata",
          documentKey,
          tableName,
        }
      );
    }
  }

  return {
    insert,
    delete: deleteDocument,
    deleteBatch,
    getDocumentVersions,
    updateMetadata,
  };
}
