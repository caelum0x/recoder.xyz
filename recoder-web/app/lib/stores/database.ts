/**
 * Database Store - Central state management for Database Explorer
 * Manages database connections, tables, and query results
 */

import { atom, computed } from 'nanostores';

// ============================================
// Types
// ============================================

export type DatabaseType = 'postgresql' | 'sqlite';

export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  createdAt: number;
  lastUsed: number;
}

export interface TableInfo {
  name: string;
  schema?: string;
  type: 'table' | 'view';
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface TableDetails {
  name: string;
  schema?: string;
  type: 'table' | 'view';
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: Array<{
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }>;
  rowCount: number;
  primaryKey?: string[];
}

export interface QueryResult {
  success: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  fields?: { name: string; type?: string }[];
  error?: string;
  executionTime?: number;
  truncated?: boolean;
}

export interface SchemaOverview {
  database: string;
  type: DatabaseType;
  version: string;
  tables: TableInfo[];
  totalTables: number;
  totalViews: number;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  params: unknown[];
  executedAt: number;
  executionTime: number;
  success: boolean;
  rowCount?: number;
  error?: string;
}

// ============================================
// Atoms (Reactive State)
// ============================================

/** Active database connections */
export const connectionsAtom = atom<DatabaseConnection[]>([]);

/** Currently selected connection */
export const activeConnectionIdAtom = atom<string | null>(null);

/** Schema overview for the active connection */
export const schemaOverviewAtom = atom<SchemaOverview | null>(null);

/** Currently selected table */
export const selectedTableAtom = atom<string | null>(null);

/** Currently selected schema (PostgreSQL) */
export const selectedSchemaAtom = atom<string>('public');

/** Available schemas */
export const availableSchemasAtom = atom<string[]>(['public']);

/** Details for the selected table */
export const tableDetailsAtom = atom<TableDetails | null>(null);

/** Table preview data */
export const tablePreviewAtom = atom<{
  rows: Record<string, unknown>[];
  columns: string[];
} | null>(null);

/** Query editor content */
export const queryEditorAtom = atom<string>('');

/** Query results */
export const queryResultAtom = atom<QueryResult | null>(null);

/** Query history */
export const queryHistoryAtom = atom<QueryHistoryEntry[]>([]);

/** Loading states */
export const isConnectingAtom = atom<boolean>(false);
export const isLoadingSchemaAtom = atom<boolean>(false);
export const isLoadingTableAtom = atom<boolean>(false);
export const isExecutingQueryAtom = atom<boolean>(false);

/** Error messages */
export const connectionErrorAtom = atom<string | null>(null);
export const schemaErrorAtom = atom<string | null>(null);
export const queryErrorAtom = atom<string | null>(null);

/** UI state */
export const showConnectionModalAtom = atom<boolean>(false);
export const showQueryEditorAtom = atom<boolean>(false);

// ============================================
// Computed Values
// ============================================

/** Get the active connection */
export const activeConnectionAtom = computed(
  [connectionsAtom, activeConnectionIdAtom],
  (connections, activeId) => connections.find((c) => c.id === activeId) || null
);

/** Tables filtered by type */
export const tablesAtom = computed(schemaOverviewAtom, (overview) =>
  overview?.tables.filter((t) => t.type === 'table') || []
);

/** Views filtered by type */
export const viewsAtom = computed(schemaOverviewAtom, (overview) =>
  overview?.tables.filter((t) => t.type === 'view') || []
);

/** Is connected to any database */
export const isConnectedAtom = computed(
  activeConnectionIdAtom,
  (id) => id !== null
);

/** Recent queries (last 20) */
export const recentQueriesAtom = computed(queryHistoryAtom, (history) =>
  history.slice(-20).reverse()
);

// ============================================
// Actions
// ============================================

/**
 * Set connections list
 */
export function setConnections(connections: DatabaseConnection[]): void {
  connectionsAtom.set(connections);
}

/**
 * Add a connection
 */
export function addConnection(connection: DatabaseConnection): void {
  const current = connectionsAtom.get();
  connectionsAtom.set([...current, connection]);
}

/**
 * Remove a connection
 */
export function removeConnection(connectionId: string): void {
  const current = connectionsAtom.get();
  connectionsAtom.set(current.filter((c) => c.id !== connectionId));

  // Clear active connection if it was removed
  if (activeConnectionIdAtom.get() === connectionId) {
    activeConnectionIdAtom.set(null);
    clearDatabaseState();
  }
}

/**
 * Set active connection
 */
export function setActiveConnection(connectionId: string | null): void {
  activeConnectionIdAtom.set(connectionId);

  // Clear state when changing connections
  if (connectionId !== activeConnectionIdAtom.get()) {
    clearDatabaseState();
  }
}

/**
 * Set schema overview
 */
export function setSchemaOverview(overview: SchemaOverview | null): void {
  schemaOverviewAtom.set(overview);
}

/**
 * Set selected table
 */
export function setSelectedTable(tableName: string | null): void {
  selectedTableAtom.set(tableName);

  // Clear table-specific state
  tableDetailsAtom.set(null);
  tablePreviewAtom.set(null);
}

/**
 * Set selected schema
 */
export function setSelectedSchema(schema: string): void {
  selectedSchemaAtom.set(schema);

  // Clear schema-dependent state
  setSelectedTable(null);
  schemaOverviewAtom.set(null);
}

/**
 * Set available schemas
 */
export function setAvailableSchemas(schemas: string[]): void {
  availableSchemasAtom.set(schemas);
}

/**
 * Set table details
 */
export function setTableDetails(details: TableDetails | null): void {
  tableDetailsAtom.set(details);
}

/**
 * Set table preview
 */
export function setTablePreview(
  preview: { rows: Record<string, unknown>[]; columns: string[] } | null
): void {
  tablePreviewAtom.set(preview);
}

/**
 * Set query editor content
 */
export function setQueryEditor(query: string): void {
  queryEditorAtom.set(query);
}

/**
 * Set query result
 */
export function setQueryResult(result: QueryResult | null): void {
  queryResultAtom.set(result);
}

/**
 * Add query to history
 */
export function addQueryToHistory(entry: Omit<QueryHistoryEntry, 'id'>): void {
  const id = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const history = queryHistoryAtom.get();

  // Keep only last 100 entries
  const newHistory = [...history.slice(-99), { ...entry, id }];
  queryHistoryAtom.set(newHistory);
}

/**
 * Clear query history
 */
export function clearQueryHistory(): void {
  queryHistoryAtom.set([]);
}

/**
 * Set loading states
 */
export function setConnecting(loading: boolean): void {
  isConnectingAtom.set(loading);
}

export function setLoadingSchema(loading: boolean): void {
  isLoadingSchemaAtom.set(loading);
}

export function setLoadingTable(loading: boolean): void {
  isLoadingTableAtom.set(loading);
}

export function setExecutingQuery(loading: boolean): void {
  isExecutingQueryAtom.set(loading);
}

/**
 * Set error states
 */
export function setConnectionError(error: string | null): void {
  connectionErrorAtom.set(error);
}

export function setSchemaError(error: string | null): void {
  schemaErrorAtom.set(error);
}

export function setQueryError(error: string | null): void {
  queryErrorAtom.set(error);
}

/**
 * Set UI states
 */
export function setShowConnectionModal(show: boolean): void {
  showConnectionModalAtom.set(show);
}

export function setShowQueryEditor(show: boolean): void {
  showQueryEditorAtom.set(show);
}

/**
 * Clear all database state (when disconnecting or changing connections)
 */
export function clearDatabaseState(): void {
  schemaOverviewAtom.set(null);
  selectedTableAtom.set(null);
  tableDetailsAtom.set(null);
  tablePreviewAtom.set(null);
  queryResultAtom.set(null);
  schemaErrorAtom.set(null);
  queryErrorAtom.set(null);
  availableSchemasAtom.set(['public']);
  selectedSchemaAtom.set('public');
}

/**
 * Clear all state (when unmounting)
 */
export function resetDatabaseStore(): void {
  connectionsAtom.set([]);
  activeConnectionIdAtom.set(null);
  queryEditorAtom.set('');
  queryHistoryAtom.set([]);
  connectionErrorAtom.set(null);
  showConnectionModalAtom.set(false);
  showQueryEditorAtom.set(false);
  clearDatabaseState();
}

/**
 * Generate a simple SELECT query for a table
 */
export function generateSelectQuery(
  tableName: string,
  schema?: string,
  limit: number = 100
): string {
  if (schema && schema !== 'main') {
    return `SELECT * FROM "${schema}"."${tableName}" LIMIT ${limit}`;
  }
  return `SELECT * FROM "${tableName}" LIMIT ${limit}`;
}

/**
 * Generate a COUNT query for a table
 */
export function generateCountQuery(tableName: string, schema?: string): string {
  if (schema && schema !== 'main') {
    return `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`;
  }
  return `SELECT COUNT(*) as count FROM "${tableName}"`;
}
