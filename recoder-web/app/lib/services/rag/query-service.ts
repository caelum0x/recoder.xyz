import type { z } from "zod";
import {
  createQueryServiceColumnMapping,
  QUERY_SERVICE_REQUIRED_COLUMNS,
  type QueryServiceRequiredColumns,
} from "./column-mapping";
import {
  PoolManager,
  ensurePgVectorTypes,
  EMBEDDING_COLUMNS,
  escapeIdentifier,
  vectorToSql,
} from "./database";
import { createEmbedderFromProfile } from "./embedder";
import {
  ConfigurationError,
  DatabaseError,
  ValidationError,
} from "./errors";
import type {
  DatabaseConfig,
  EmbeddingCompleteCallback,
  EmbeddingProfileId,
  QueryResult,
  QueryService,
} from "./types";
import { EMBEDDING_PROFILES } from "./types";

function parseMetadata<TMetadata extends Record<string, unknown>>(
  row: Record<string, unknown>,
  metadataColumns: Array<{ metadataKey: string; dbColumn: string }>,
  metadataSchema: z.ZodType<TMetadata>
): TMetadata {
  const rawMetadata = Object.fromEntries(
    metadataColumns.map(({ metadataKey }) => [metadataKey, row[metadataKey]])
  );

  const result = metadataSchema.safeParse(rawMetadata);
  if (!result.success) {
    throw ValidationError.fromZodError(result.error, {
      operation: "parseMetadata",
      source: "database",
      metadata: rawMetadata,
    });
  }

  return result.data;
}

function validatePoolConfig(poolConfig: {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}) {
  const { max, idleTimeoutMillis, connectionTimeoutMillis } = poolConfig;

  if (max !== undefined && (max < 0 || max > 100)) {
    throw new ValidationError(`Pool max must be between 0 and 100, got ${max}`);
  }

  if (idleTimeoutMillis !== undefined && idleTimeoutMillis < 0) {
    throw new ValidationError(
      `Pool idle timeout must be non-negative, got ${idleTimeoutMillis}`
    );
  }

  if (connectionTimeoutMillis !== undefined && connectionTimeoutMillis < 0) {
    throw new ValidationError(
      `Pool connection timeout must be non-negative, got ${connectionTimeoutMillis}`
    );
  }
}

function validateDatabase(database: DatabaseConfig) {
  if (!database.connectionString) {
    throw new ValidationError("Connection string is required");
  }

  if (database.poolConfig) {
    validatePoolConfig(database.poolConfig);
  }

  return database;
}

/**
 * Create a PostgreSQL query service for semantic search using Neon serverless
 */
export function createPostgresQueryService<
  TContext,
  TSchema extends z.ZodType<Record<string, unknown>>
>(config: {
  database: DatabaseConfig;
  tableName: string;
  contextToEmbeddingProfileId: (context: TContext) => EmbeddingProfileId;
  contextToApiKey?: (
    context: TContext
  ) => string | null | undefined | Promise<string | null | undefined>;
  requiredColumnOverrides?: Partial<QueryServiceRequiredColumns>;
  metadataColumnOverrides?: Partial<Record<keyof z.infer<TSchema>, string>>;
  contextToFilter: (
    context: TContext
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  metadataSchema: TSchema;
  additionalResolver?: (
    results: QueryResult<z.infer<TSchema>>[],
    context: TContext
  ) => Promise<QueryResult<z.infer<TSchema>>[]>;
}): QueryService<TContext, z.infer<TSchema>> {
  const database = validateDatabase(config.database);
  const columnMapping = createQueryServiceColumnMapping({
    metadataSchema: config.metadataSchema,
    requiredColumnOverrides: config.requiredColumnOverrides,
    metadataColumnOverrides: config.metadataColumnOverrides,
  });

  async function search(
    query: string,
    context: TContext,
    limit = 10,
    similarityThreshold?: number,
    embeddingComplete?: EmbeddingCompleteCallback,
    headers?: Record<string, string>
  ): Promise<QueryResult<z.infer<TSchema>>[]> {
    const client = PoolManager.getConnection(database);

    try {
      await ensurePgVectorTypes(client, database.connectionString);

      const profileId = config.contextToEmbeddingProfileId(context);
      const profile = EMBEDDING_PROFILES[profileId];
      if (!profile) {
        throw new ConfigurationError(
          `Invalid embedding profile ID: ${profileId}. Valid IDs are: ${Object.keys(EMBEDDING_PROFILES).join(", ")}`
        );
      }

      const apiKey = config.contextToApiKey
        ? await config.contextToApiKey(context)
        : undefined;
      if (!apiKey) {
        throw new ConfigurationError(
          `No BYOK API key provided for embedding profile ${profileId}`
        );
      }

      const embedder = createEmbedderFromProfile(profileId, apiKey, {
        embeddingComplete,
        transport: "provider",
        headers,
      });
      const queryEmbedding = await embedder.embed(query);

      const filters = await config.contextToFilter(context);

      // Use a numeric ID for the profile (index in the array)
      const profileNumericId = Object.keys(EMBEDDING_PROFILES).indexOf(profileId);

      const { sql, values } = buildSearchQuery({
        tableName: config.tableName,
        columnMapping,
        queryEmbedding,
        filters,
        embeddingProfileId: profileNumericId,
        embeddingDimensions: profile.dimensions,
        limit,
        similarityThreshold,
      });

      const result = await client.query<Record<string, unknown>>(sql, values);
      const mappedResults = result.map((row) =>
        mapRowToResult(row, columnMapping, config.metadataSchema)
      );

      // Apply additional resolver if provided
      if (config.additionalResolver) {
        return await config.additionalResolver(mappedResults, context);
      }

      return mappedResults;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw DatabaseError.queryFailed(
        "vector search query",
        error instanceof Error ? error : undefined
      );
    }
  }

  return { search };
}

function buildSearchQuery({
  tableName,
  columnMapping,
  queryEmbedding,
  filters,
  embeddingProfileId,
  embeddingDimensions,
  limit,
  similarityThreshold,
}: {
  tableName: string;
  columnMapping: ReturnType<typeof createQueryServiceColumnMapping>;
  queryEmbedding: number[];
  filters: Record<string, unknown>;
  embeddingProfileId: number;
  embeddingDimensions: number;
  limit: number;
  similarityThreshold?: number;
}) {
  const values: unknown[] = [vectorToSql(queryEmbedding)];
  const whereConditions: string[] = [];
  let paramIndex = 2;

  // Determine the appropriate cast based on embedding dimensions
  const embeddingCast =
    embeddingDimensions === 3072
      ? `${escapeIdentifier(EMBEDDING_COLUMNS.VECTOR)}::halfvec(3072)`
      : `${escapeIdentifier(EMBEDDING_COLUMNS.VECTOR)}::vector(${embeddingDimensions})`;

  // Add embedding profile conditions
  whereConditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.PROFILE_ID)} = $${paramIndex}`);
  values.push(embeddingProfileId);
  paramIndex++;

  whereConditions.push(`${escapeIdentifier(EMBEDDING_COLUMNS.DIMENSIONS)} = $${paramIndex}`);
  values.push(embeddingDimensions);
  paramIndex++;

  // Add user-provided filters
  for (const [column, value] of Object.entries(filters)) {
    whereConditions.push(`${escapeIdentifier(column)} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  if (similarityThreshold !== undefined && similarityThreshold > 0) {
    whereConditions.push(`1 - (${embeddingCast} <=> $1::vector) >= $${paramIndex}`);
    values.push(similarityThreshold);
    paramIndex++;
  }

  const metadataColumns = getMetadataColumns(columnMapping);
  const metadataSelects = metadataColumns
    .map(
      ({ dbColumn, metadataKey }) =>
        `${dbColumn} as ${escapeIdentifier(metadataKey)}`
    )
    .join(", ");

  const sql = `
    SELECT
      ${escapeIdentifier(columnMapping.chunkContent)} as content,
      ${escapeIdentifier(columnMapping.chunkIndex)} as index,
      ${metadataSelects}${metadataColumns.length > 0 ? "," : ""}
      1 - (${embeddingCast} <=> $1::vector) as similarity
    FROM ${escapeIdentifier(tableName)}
    ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""}
    ORDER BY ${embeddingCast} <=> $1::vector
    LIMIT $${paramIndex}
  `;

  values.push(limit);
  return { sql, values };
}

function getMetadataColumns(
  columnMapping: ReturnType<typeof createQueryServiceColumnMapping>
) {
  const requiredKeys = new Set(QUERY_SERVICE_REQUIRED_COLUMNS);
  return Object.entries(columnMapping as Record<string, string>)
    .filter(
      ([key]) =>
        !requiredKeys.has(key as (typeof QUERY_SERVICE_REQUIRED_COLUMNS)[number])
    )
    .map(([metadataKey, dbColumn]) => {
      if (typeof dbColumn !== "string") {
        throw ConfigurationError.invalidValue(
          `columnMapping.${metadataKey}`,
          dbColumn,
          "string"
        );
      }
      return {
        metadataKey,
        dbColumn: escapeIdentifier(dbColumn),
      };
    });
}

function mapRowToResult<TSchema extends z.ZodType<Record<string, unknown>>>(
  row: Record<string, unknown>,
  columnMapping: ReturnType<typeof createQueryServiceColumnMapping>,
  metadataSchema: TSchema
): QueryResult<z.infer<TSchema>> {
  const metadataColumns = getMetadataColumns(columnMapping);
  const metadata = parseMetadata(row, metadataColumns, metadataSchema);

  return {
    chunk: {
      content: row.content as string,
      index: row.index as number,
    },
    similarity: row.similarity as number,
    metadata,
  } as QueryResult<z.infer<TSchema>>;
}
