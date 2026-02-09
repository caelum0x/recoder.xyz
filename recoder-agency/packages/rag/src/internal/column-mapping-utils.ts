import { z } from "zod/v4";

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
	return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Get all field names from a Zod schema if it's an object schema.
 * Returns an empty array for non-object schemas.
 */
function getSchemaFieldNames<T>(schema: z.ZodType<T>): string[] {
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
	TMetadata extends Record<string, unknown>,
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
	metadataSchema: z.ZodType<unknown>,
): { isValid: boolean; missing: { required: string[]; metadata: string[] } } {
	const missingRequired = requiredKeys.filter((key) => !(key in mapping));
	const metadataFields = getSchemaFieldNames(metadataSchema);
	const missingMetadata = metadataFields.filter((field) => !(field in mapping));

	return {
		isValid: missingRequired.length === 0 && missingMetadata.length === 0,
		missing: {
			required: missingRequired,
			metadata: missingMetadata,
		},
	};
}
