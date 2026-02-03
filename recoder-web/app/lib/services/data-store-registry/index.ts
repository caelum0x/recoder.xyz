import { z } from 'zod';

/**
 * Data Store Registry
 *
 * Provides type-safe configuration and validation for data store providers.
 * Currently supports PostgreSQL with connection string secret management.
 */

// PostgreSQL configuration schema
const postgresConfigSchema = z.object({
  connectionStringSecretId: z.string().min(1, 'Connection string secret ID is required'),
});

export type PostgresConfig = z.infer<typeof postgresConfigSchema>;

/**
 * Registry of supported data store providers with their configuration schemas.
 * Each entry defines:
 * - provider: Unique identifier for the data store type
 * - label: Human-readable display name
 * - configurationSchema: Zod schema for validating provider-specific configuration
 */
export const dataStoreRegistry = [
  {
    provider: 'postgres',
    label: 'PostgreSQL',
    configurationSchema: postgresConfigSchema,
  },
] as const;

/**
 * Type representing valid data store provider identifiers.
 * Derived from the registry to ensure type safety.
 */
export type DataStoreProvider = (typeof dataStoreRegistry)[number]['provider'];

// Extract provider strings for runtime validation
const dataStoreProviders = dataStoreRegistry.map((x) => x.provider);

/**
 * Type guard to check if an unknown value is a valid DataStoreProvider.
 *
 * @param v - The value to check
 * @returns True if the value is a valid provider identifier
 *
 * @example
 * ```typescript
 * const provider = 'postgres';
 * if (isDataStoreProvider(provider)) {
 *   // TypeScript knows provider is DataStoreProvider here
 *   const def = getProviderDefinition(provider);
 * }
 * ```
 */
export function isDataStoreProvider(v: unknown): v is DataStoreProvider {
  return typeof v === 'string' && (dataStoreProviders as string[]).includes(v);
}

/**
 * Type for provider definition entries in the registry.
 */
export type ProviderDefinition = (typeof dataStoreRegistry)[number];

/**
 * Retrieves the full provider definition from the registry.
 *
 * @param provider - The provider identifier to look up
 * @returns The provider definition including label and configuration schema
 * @throws Error if the provider is not found in the registry
 *
 * @example
 * ```typescript
 * const def = getProviderDefinition('postgres');
 * console.log(def.label); // "PostgreSQL"
 * ```
 */
export function getProviderDefinition(provider: DataStoreProvider): ProviderDefinition {
  const def = dataStoreRegistry.find((x) => x.provider === provider);
  if (!def) {
    throw new Error(`Unknown data store provider: ${provider}`);
  }
  return def;
}

/**
 * Inferred configuration type for a given provider.
 * Maps provider identifiers to their corresponding configuration types.
 */
export type ConfigurationForProvider<P extends DataStoreProvider> = P extends 'postgres'
  ? PostgresConfig
  : never;

/**
 * Parses and validates configuration for a specific data store provider.
 * Uses the provider's Zod schema to ensure the configuration is valid.
 *
 * @param provider - The provider identifier
 * @param unknownConfig - The raw configuration object to validate
 * @returns The validated and typed configuration object
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * const config = parseConfiguration('postgres', {
 *   connectionStringSecretId: 'secret_123',
 * });
 * // config is typed as { connectionStringSecretId: string }
 * ```
 */
export function parseConfiguration<P extends DataStoreProvider>(
  provider: P,
  unknownConfig: unknown,
): ConfigurationForProvider<P> {
  const def = getProviderDefinition(provider);
  const parsed = def.configurationSchema.safeParse(unknownConfig);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data as ConfigurationForProvider<P>;
}

/**
 * Safely parses configuration without throwing errors.
 * Returns a result object indicating success or failure.
 *
 * @param provider - The provider identifier
 * @param unknownConfig - The raw configuration object to validate
 * @returns A result object with either the parsed data or validation errors
 *
 * @example
 * ```typescript
 * const result = safeParseConfiguration('postgres', config);
 * if (result.success) {
 *   console.log(result.data.connectionStringSecretId);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function safeParseConfiguration<P extends DataStoreProvider>(
  provider: P,
  unknownConfig: unknown,
): z.SafeParseReturnType<unknown, ConfigurationForProvider<P>> {
  const def = getProviderDefinition(provider);
  return def.configurationSchema.safeParse(unknownConfig) as z.SafeParseReturnType<
    unknown,
    ConfigurationForProvider<P>
  >;
}

/**
 * Returns all available provider identifiers.
 * Useful for building UI dropdowns or validation lists.
 *
 * @returns Array of all valid provider identifiers
 */
export function getAllProviders(): DataStoreProvider[] {
  return [...dataStoreProviders];
}

/**
 * Returns all provider definitions with their full metadata.
 * Useful for building configuration UIs.
 *
 * @returns Array of all provider definitions
 */
export function getAllProviderDefinitions(): readonly ProviderDefinition[] {
  return dataStoreRegistry;
}
