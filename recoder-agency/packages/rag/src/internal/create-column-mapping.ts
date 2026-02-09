import type { z } from "zod/v4";
import {
	buildColumnMapping,
	validateColumnMapping,
} from "./column-mapping-utils";

/**
 * Generic column mapping creator for any component
 */
export function createColumnMapping<
	TRequiredColumns extends Record<string, string>,
	TSchema extends z.ZodType<Record<string, unknown>>,
>(params: {
	requiredColumns: readonly string[];
	defaultColumns: TRequiredColumns;
	options: {
		metadataSchema: TSchema;
		requiredColumnOverrides?: Partial<TRequiredColumns>;
		metadataColumnOverrides?: Partial<Record<keyof z.infer<TSchema>, string>>;
	};
	componentName: string;
}): TRequiredColumns & Record<keyof z.infer<TSchema>, string> {
	const { requiredColumns, defaultColumns, options, componentName } = params;

	const mapping = buildColumnMapping({
		defaultRequiredColumns: defaultColumns,
		requiredColumnOverrides: options.requiredColumnOverrides,
		metadataSchema: options.metadataSchema,
		metadataColumnOverrides: options.metadataColumnOverrides,
	});

	const validation = validateColumnMapping(
		mapping,
		requiredColumns,
		options.metadataSchema,
	);

	if (!validation.isValid) {
		const errorParts: string[] = [];
		if (validation.missing.required.length > 0) {
			errorParts.push(
				`Missing required columns: ${validation.missing.required.join(", ")}`,
			);
		}
		if (validation.missing.metadata.length > 0) {
			errorParts.push(
				`Missing metadata columns: ${validation.missing.metadata.join(", ")}`,
			);
		}

		throw new Error(
			`Failed to create valid ${componentName} column mapping. ${errorParts.join(". ")}`,
		);
	}

	return mapping as TRequiredColumns & Record<keyof z.infer<TSchema>, string>;
}
