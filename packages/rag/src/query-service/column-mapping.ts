import type { z } from "zod/v4";
import { createColumnMapping as createGenericColumnMapping } from "../internal";

export const REQUIRED_COLUMN_KEYS = [
	"chunkContent",
	"chunkIndex",
	"embedding",
] as const;

export type RequiredColumns = Record<
	(typeof REQUIRED_COLUMN_KEYS)[number],
	string
>;

type ColumnMapping<TMetadata> = Readonly<RequiredColumns> & {
	[K in Exclude<keyof TMetadata, keyof RequiredColumns>]: string;
};

const DEFAULT_COLUMNS: RequiredColumns = {
	chunkContent: "chunk_content",
	chunkIndex: "chunk_index",
	embedding: "embedding",
} as const;

/**
 * Create column mapping for query service
 */
export function createColumnMapping<
	TSchema extends z.ZodType<Record<string, unknown>>,
>(options: {
	metadataSchema: TSchema;
	requiredColumnOverrides?: Partial<RequiredColumns>;
	metadataColumnOverrides?: Partial<Record<keyof z.infer<TSchema>, string>>;
}): ColumnMapping<z.infer<TSchema>> {
	return createGenericColumnMapping({
		requiredColumns: REQUIRED_COLUMN_KEYS,
		defaultColumns: DEFAULT_COLUMNS,
		options,
		componentName: "QueryService",
	}) as ColumnMapping<z.infer<TSchema>>;
}
