import type { z } from 'zod';
import type {
  DataStoreProvider,
  ConfigurationForProvider,
  ProviderDefinition,
} from './index';

/**
 * Data Store Types
 *
 * Additional type definitions for working with data stores.
 */

/**
 * Represents a configured data store instance.
 */
export interface DataStoreInstance<P extends DataStoreProvider = DataStoreProvider> {
  /** Unique identifier for this data store instance */
  id: string;
  /** The data store provider type */
  provider: P;
  /** Human-readable name for this instance */
  name: string;
  /** Provider-specific configuration (validated) */
  configuration: ConfigurationForProvider<P>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Whether this data store is currently active/enabled */
  isActive: boolean;
}

/**
 * PostgreSQL-specific data store instance.
 */
export type PostgresDataStoreInstance = DataStoreInstance<'postgres'>;

/**
 * Input for creating a new data store.
 */
export interface CreateDataStoreInput<P extends DataStoreProvider = DataStoreProvider> {
  /** The data store provider type */
  provider: P;
  /** Human-readable name for this instance */
  name: string;
  /** Provider-specific configuration (will be validated) */
  configuration: unknown;
}

/**
 * Input for updating an existing data store.
 */
export interface UpdateDataStoreInput {
  /** New name (optional) */
  name?: string;
  /** New configuration (optional, will be validated if provided) */
  configuration?: unknown;
  /** Whether to enable/disable the data store */
  isActive?: boolean;
}

/**
 * Result of a data store connection test.
 */
export interface ConnectionTestResult {
  /** Whether the connection was successful */
  success: boolean;
  /** Error message if connection failed */
  error?: string;
  /** Connection latency in milliseconds */
  latencyMs?: number;
  /** Additional connection details */
  details?: {
    /** Database version string */
    version?: string;
    /** Server host */
    host?: string;
    /** Server port */
    port?: number;
    /** Database name */
    database?: string;
  };
}

/**
 * Data store health status.
 */
export interface DataStoreHealth {
  /** Whether the data store is healthy */
  isHealthy: boolean;
  /** Last successful connection timestamp */
  lastSuccessfulConnection?: Date;
  /** Last error timestamp */
  lastError?: Date;
  /** Last error message */
  lastErrorMessage?: string;
  /** Number of consecutive failures */
  consecutiveFailures: number;
}

/**
 * Schema definition for dynamic configuration UIs.
 */
export interface ConfigurationFieldDefinition {
  /** Field name (must match schema key) */
  name: string;
  /** Display label */
  label: string;
  /** Field type for UI rendering */
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  /** Placeholder text */
  placeholder?: string;
  /** Help text */
  description?: string;
  /** Whether the field is required */
  required: boolean;
  /** Options for select type */
  options?: Array<{ value: string; label: string }>;
  /** Default value */
  defaultValue?: unknown;
}

/**
 * Extended provider definition with UI metadata.
 */
export interface ProviderDefinitionWithUI extends ProviderDefinition {
  /** Icon name or URL */
  icon?: string;
  /** Provider description */
  description?: string;
  /** Documentation URL */
  docsUrl?: string;
  /** Field definitions for configuration UI */
  fields?: ConfigurationFieldDefinition[];
}

/**
 * Zod schema type helper for extracting input types.
 */
export type SchemaInput<T> = T extends z.ZodType<infer O, z.ZodTypeDef, infer I> ? I : never;

/**
 * Zod schema type helper for extracting output types.
 */
export type SchemaOutput<T> = T extends z.ZodType<infer O> ? O : never;
