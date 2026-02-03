import { z, type ZodObject, type ZodRawShape } from "zod";
import { toSnakeCase } from "./utils";

/**
 * Required columns for chunk store
 */
export const CHUNK_STORE_REQUIRED_COLUMNS = [
  "documentKey",
  "chunkContent",
  "chunkIndex",
  "version",
] as const;

export type ChunkStoreRequiredColumns = Record<
  (typeof CHUNK_STORE_REQUIRED_COLUMNS)[number],
  string
>;

const DEFAULT_CHUNK_STORE_COLUMNS: ChunkStoreRequiredColumns = {
  documentKey: "document_key",
  chunkContent: "chunk_content",
  chunkIndex: "chunk_index",
  version: "version",
} as const;

/**
 * Required columns for query service
 */
export const QUERY_SERVICE_REQUIRED_COLUMNS = [
  "chunkContent",
  "chunkIndex",
  "embedding",
] as const;

export type QueryServiceRequiredColumns = Record<
  (typeof QUERY_SERVICE_REQUIRED_COLUMNS)[number],
  string
>;

const DEFAULT_QUERY_SERVICE_COLUMNS: QueryServiceRequiredColumns = {
  chunkContent: "chunk_content",
  chunkIndex: "chunk_index",
  embedding: "embedding",
} as const;

/**
 * Column mapping type
 */
export type ColumnMapping<TMetadata> = Readonly<ChunkStoreRequiredColumns> & {
  [K in Exclude<keyof TMetadata, keyof ChunkStoreRequiredColumns>]: string;
};

/**
 * Get all field names from a Zod schema if it's an object schema.
 */
function getSchemaFieldNames<T extends ZodRawShape>(
  schema: z.ZodType<z.infer<ZodObject<T>>>
): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  return [];
}

/**
 * Build column mapping from required columns and metadata schema
 */
export function buildColumnMapping<
  TRequiredColumns extends Record<string, string>,
  TMetadata extends Record<string, unknown>
>(params: {
  defaultRequiredColumns: TRequiredColumns;
  requiredColumnOverrides?: Partial<TRequiredColumns>;
  metadataSchema: z.ZodType<TMetadata>;
  metadataColumnOverrides?: Partial<Record<keyof TMetadata, string>>;
}): TRequiredColumns & Record<keyof TMetadata, string> {
  const {
    defaultRequiredColumns,
    requiredColumnOverrides,
    metadataSchema,
    metadataColumnOverrides,
  } = params;

  // Build required columns
  const requiredColumns: TRequiredColumns = {
    ...defaultRequiredColumns,
    ...requiredColumnOverrides,
  };

  // Build metadata columns
  const metadataFields = getSchemaFieldNames(metadataSchema);
  const metadataEntries = metadataFields.map((fieldName) => {
    const customMapping =
      metadataColumnOverrides?.[fieldName as keyof TMetadata];
    return [fieldName, customMapping ?? toSnakeCase(fieldName)];
  });

  const allEntries = [...Object.entries(requiredColumns), ...metadataEntries];
  return Object.fromEntries(allEntries) as TRequiredColumns &
    Record<keyof TMetadata, string>;
}

/**
 * Validate that column mapping contains all required fields
 */
export function validateColumnMapping<TRequiredKeys extends readonly string[]>(
  mapping: Record<string, string>,
  requiredKeys: TRequiredKeys,
  metadataSchema: z.ZodType<unknown>
): { isValid: boolean; missing: { required: string[]; metadata: string[] } } {
  const missingRequired = requiredKeys.filter((key) => !(key in mapping));
  const metadataFields = getSchemaFieldNames(metadataSchema as z.ZodType<Record<string, unknown>>);
  const missingMetadata = metadataFields.filter((field) => !(field in mapping));

  return {
    isValid: missingRequired.length === 0 && missingMetadata.length === 0,
    missing: {
      required: missingRequired,
      metadata: missingMetadata,
    },
  };
}

/**
 * Create column mapping for chunk store
 */
export function createChunkStoreColumnMapping<
  TSchema extends z.ZodType<Record<string, unknown>>
>(options: {
  metadataSchema: TSchema;
  requiredColumnOverrides?: Partial<ChunkStoreRequiredColumns>;
  metadataColumnOverrides?: Partial<Record<keyof z.infer<TSchema>, string>>;
}): ColumnMapping<z.infer<TSchema>> {
  const mapping = buildColumnMapping({
    defaultRequiredColumns: DEFAULT_CHUNK_STORE_COLUMNS,
    requiredColumnOverrides: options.requiredColumnOverrides,
    metadataSchema: options.metadataSchema,
    metadataColumnOverrides: options.metadataColumnOverrides,
  });

  const validation = validateColumnMapping(
    mapping,
    CHUNK_STORE_REQUIRED_COLUMNS,
    options.metadataSchema
  );

  if (!validation.isValid) {
    const errorParts: string[] = [];
    if (validation.missing.required.length > 0) {
      errorParts.push(
        `Missing required columns: ${validation.missing.required.join(", ")}`
      );
    }
    if (validation.missing.metadata.length > 0) {
      errorParts.push(
        `Missing metadata columns: ${validation.missing.metadata.join(", ")}`
      );
    }

    throw new Error(
      `Failed to create valid ChunkStore column mapping. ${errorParts.join(". ")}`
    );
  }

  return mapping as ColumnMapping<z.infer<TSchema>>;
}

/**
 * Create column mapping for query service
 */
export function createQueryServiceColumnMapping<
  TSchema extends z.ZodType<Record<string, unknown>>
>(options: {
  metadataSchema: TSchema;
  requiredColumnOverrides?: Partial<QueryServiceRequiredColumns>;
  metadataColumnOverrides?: Partial<Record<keyof z.infer<TSchema>, string>>;
}): QueryServiceRequiredColumns & Record<keyof z.infer<TSchema>, string> {
  const mapping = buildColumnMapping({
    defaultRequiredColumns: DEFAULT_QUERY_SERVICE_COLUMNS,
    requiredColumnOverrides: options.requiredColumnOverrides,
    metadataSchema: options.metadataSchema,
    metadataColumnOverrides: options.metadataColumnOverrides,
  });

  const validation = validateColumnMapping(
    mapping,
    QUERY_SERVICE_REQUIRED_COLUMNS,
    options.metadataSchema
  );

  if (!validation.isValid) {
    const errorParts: string[] = [];
    if (validation.missing.required.length > 0) {
      errorParts.push(
        `Missing required columns: ${validation.missing.required.join(", ")}`
      );
    }
    if (validation.missing.metadata.length > 0) {
      errorParts.push(
        `Missing metadata columns: ${validation.missing.metadata.join(", ")}`
      );
    }

    throw new Error(
      `Failed to create valid QueryService column mapping. ${errorParts.join(". ")}`
    );
  }

  return mapping as QueryServiceRequiredColumns &
    Record<keyof z.infer<TSchema>, string>;
}
