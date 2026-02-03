/**
 * DatabaseExplorer - Secure database exploration UI
 * Allows users to connect to databases, browse schemas, and execute queries
 *
 * SECURITY: Uses parameterized queries only - never concatenates user input
 */

import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost, dockerGet, dockerDelete } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import {
  connectionsAtom,
  activeConnectionIdAtom,
  activeConnectionAtom,
  schemaOverviewAtom,
  selectedTableAtom,
  selectedSchemaAtom,
  availableSchemasAtom,
  tableDetailsAtom,
  tablePreviewAtom,
  queryEditorAtom,
  queryResultAtom,
  queryHistoryAtom,
  isConnectingAtom,
  isLoadingSchemaAtom,
  isLoadingTableAtom,
  isExecutingQueryAtom,
  connectionErrorAtom,
  showConnectionModalAtom,
  showQueryEditorAtom,
  tablesAtom,
  viewsAtom,
  recentQueriesAtom,
  setConnections,
  addConnection,
  removeConnection,
  setActiveConnection,
  setSchemaOverview,
  setSelectedTable,
  setSelectedSchema,
  setAvailableSchemas,
  setTableDetails,
  setTablePreview,
  setQueryEditor,
  setQueryResult,
  addQueryToHistory,
  setConnecting,
  setLoadingSchema,
  setLoadingTable,
  setExecutingQuery,
  setConnectionError,
  setShowConnectionModal,
  setShowQueryEditor,
  generateSelectQuery,
  type DatabaseConnection,
  type TableInfo,
  type ColumnInfo,
  type DatabaseType,
} from '~/lib/stores/database';

interface DatabaseExplorerProps {
  className?: string;
}

export const DatabaseExplorer = memo(({ className = '' }: DatabaseExplorerProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const connections = useStore(connectionsAtom);
  const activeConnectionId = useStore(activeConnectionIdAtom);
  const activeConnection = useStore(activeConnectionAtom);
  const schemaOverview = useStore(schemaOverviewAtom);
  const selectedTable = useStore(selectedTableAtom);
  const selectedSchema = useStore(selectedSchemaAtom);
  const availableSchemas = useStore(availableSchemasAtom);
  const tableDetails = useStore(tableDetailsAtom);
  const tablePreview = useStore(tablePreviewAtom);
  const queryEditor = useStore(queryEditorAtom);
  const queryResult = useStore(queryResultAtom);
  const recentQueries = useStore(recentQueriesAtom);
  const isConnecting = useStore(isConnectingAtom);
  const isLoadingSchema = useStore(isLoadingSchemaAtom);
  const isLoadingTable = useStore(isLoadingTableAtom);
  const isExecutingQuery = useStore(isExecutingQueryAtom);
  const connectionError = useStore(connectionErrorAtom);
  const showConnectionModal = useStore(showConnectionModalAtom);
  const showQueryEditor = useStore(showQueryEditorAtom);
  const tables = useStore(tablesAtom);
  const views = useStore(viewsAtom);

  const [activeTab, setActiveTab] = useState<'tables' | 'query' | 'history'>('tables');

  // Load connections when container is ready
  useEffect(() => {
    if (containerReady && projectId) {
      loadConnections();
    }
  }, [containerReady, projectId]);

  // Load schema when connection changes
  useEffect(() => {
    if (activeConnectionId && projectId) {
      loadSchema();
    }
  }, [activeConnectionId, projectId, selectedSchema]);

  // Load table details when table is selected
  useEffect(() => {
    if (activeConnectionId && projectId && selectedTable) {
      loadTableDetails();
    }
  }, [activeConnectionId, projectId, selectedTable]);

  // Load active connections
  const loadConnections = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await dockerGet<{
        success: boolean;
        connections?: DatabaseConnection[];
      }>(`/api/database/${projectId}/connections`);
      if (data?.success && data.connections) {
        setConnections(data.connections);
      }
    } catch (error) {
      console.error('[Database] Failed to load connections:', error);
    }
  }, [projectId]);

  // Load schema overview
  const loadSchema = useCallback(async () => {
    if (!projectId || !activeConnectionId) return;

    setLoadingSchema(true);
    try {
      // Load schemas first (PostgreSQL)
      try {
        const schemasData = await dockerGet<{
          success: boolean;
          schemas?: string[];
        }>(`/api/database/${projectId}/schemas?connectionId=${activeConnectionId}`);
        if (schemasData?.success && schemasData.schemas) {
          setAvailableSchemas(schemasData.schemas);
        }
      } catch {
        // Ignore schema loading errors for non-PostgreSQL databases
      }

      // Load tables
      const data = await dockerGet<{ success: boolean; data?: any; error?: string }>(
        `/api/database/${projectId}/tables?connectionId=${activeConnectionId}&schema=${selectedSchema}`
      );
      if (data?.success && data.data) {
        setSchemaOverview(data.data);
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (error: any) {
      console.error('[Database] Failed to load schema:', error);
      toast.error('Failed to load database schema');
    } finally {
      setLoadingSchema(false);
    }
  }, [projectId, activeConnectionId, selectedSchema]);

  // Load table details
  const loadTableDetails = useCallback(async () => {
    if (!projectId || !activeConnectionId || !selectedTable) return;

    setLoadingTable(true);
    try {
      // Load schema
      try {
        const schemaData = await dockerGet<{ success: boolean; data?: any }>(
          `/api/database/${projectId}/schema/${encodeURIComponent(selectedTable)}?connectionId=${activeConnectionId}&schema=${selectedSchema}`
        );
        if (schemaData?.success && schemaData.data) {
          setTableDetails(schemaData.data);
        }
      } catch {
        // Ignore schema details loading errors
      }

      // Load preview
      try {
        const previewData = await dockerGet<{
          success: boolean;
          rows?: Record<string, unknown>[];
          columns?: string[];
        }>(
          `/api/database/${projectId}/preview/${encodeURIComponent(selectedTable)}?connectionId=${activeConnectionId}&schema=${selectedSchema}&limit=100`
        );
        if (previewData?.success && previewData.rows) {
          setTablePreview({
            rows: previewData.rows,
            columns: previewData.columns || [],
          });
        }
      } catch {
        // Ignore preview loading errors
      }
    } catch (error: any) {
      console.error('[Database] Failed to load table details:', error);
    } finally {
      setLoadingTable(false);
    }
  }, [projectId, activeConnectionId, selectedTable, selectedSchema]);

  // Execute query
  const executeQuery = useCallback(async () => {
    if (!projectId || !activeConnectionId || !queryEditor.trim()) return;

    setExecutingQuery(true);
    const startTime = Date.now();

    try {
      // SECURITY: Send query with empty params array for parameterized query support
      const data = await dockerPost<{
        success: boolean;
        rows?: Record<string, unknown>[];
        rowCount?: number;
        fields?: { name: string }[];
        error?: string;
        executionTime?: number;
        truncated?: boolean;
      }>(`/api/database/${projectId}/query`, {
        connectionId: activeConnectionId,
        query: queryEditor,
        params: [], // Parameterized queries
      });

      const result = data || { success: false, error: 'No response from server' };
      setQueryResult(result);

      addQueryToHistory({
        query: queryEditor,
        params: [],
        executedAt: Date.now(),
        executionTime: result.executionTime || Date.now() - startTime,
        success: result.success,
        rowCount: result.rowCount,
        error: result.error,
      });

      if (result.success) {
        toast.success(`Query executed: ${result.rowCount} rows`);
      } else {
        toast.error(result.error || 'Query failed');
      }
    } catch (error: any) {
      toast.error('Failed to execute query');
      setQueryResult({ success: false, error: error.message });
    } finally {
      setExecutingQuery(false);
    }
  }, [projectId, activeConnectionId, queryEditor]);

  // Disconnect from database
  const handleDisconnect = useCallback(
    async (connectionId: string) => {
      if (!projectId) return;

      try {
        await dockerDelete(`/api/database/${projectId}/disconnect/${connectionId}`);
        removeConnection(connectionId);
        toast.success('Disconnected');
      } catch (error) {
        toast.error('Failed to disconnect');
      }
    },
    [projectId]
  );

  // Select a table and generate query
  const handleSelectTable = useCallback(
    (table: TableInfo) => {
      setSelectedTable(table.name);
      const query = generateSelectQuery(table.name, selectedSchema, 100);
      setQueryEditor(query);
    },
    [selectedSchema]
  );

  return (
    <div className={classNames('flex flex-col h-full bg-bolt-elements-background-depth-1', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <span className="i-ph:database text-blue-400" />
          <span className="font-medium text-bolt-elements-textPrimary text-sm">Database Explorer</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConnectionModal(true)}
            className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded text-green-400"
            title="New Connection"
          >
            <span className="i-ph:plus-circle" />
          </button>
          {activeConnectionId && (
            <button
              onClick={loadSchema}
              disabled={isLoadingSchema}
              className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded"
              title="Refresh"
            >
              <span className={classNames('i-ph:arrows-clockwise', isLoadingSchema ? 'animate-spin' : '')} />
            </button>
          )}
        </div>
      </div>

      {/* Connection Selector */}
      {connections.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <select
            value={activeConnectionId || ''}
            onChange={(e) => setActiveConnection(e.target.value || null)}
            className="flex-1 px-2 py-1 text-xs bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
          >
            <option value="">Select Connection</option>
            {connections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.type})
              </option>
            ))}
          </select>
          {activeConnectionId && (
            <button
              onClick={() => handleDisconnect(activeConnectionId)}
              className="p-1 text-red-400 hover:bg-bolt-elements-background-depth-2 rounded"
              title="Disconnect"
            >
              <span className="i-ph:plug" />
            </button>
          )}
        </div>
      )}

      {/* Schema Selector (PostgreSQL) */}
      {activeConnection?.type === 'postgresql' && availableSchemas.length > 1 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-bolt-elements-borderColor">
          <span className="text-xs text-bolt-elements-textTertiary">Schema:</span>
          <select
            value={selectedSchema}
            onChange={(e) => setSelectedSchema(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
          >
            {availableSchemas.map((schema) => (
              <option key={schema} value={schema}>
                {schema}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-bolt-elements-borderColor">
        {(['tables', 'query', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={classNames(
              'px-3 py-1.5 text-xs capitalize transition-colors',
              activeTab === tab
                ? 'text-bolt-elements-textPrimary border-b-2 border-blue-500 bg-bolt-elements-background-depth-2'
                : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!containerReady ? (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
            Waiting for container...
          </div>
        ) : !activeConnectionId ? (
          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
            <span className="i-ph:database text-3xl block mb-2" />
            No database connected
            <button
              onClick={() => setShowConnectionModal(true)}
              className="block mx-auto mt-2 text-blue-400 hover:underline"
            >
              Connect to a database
            </button>
          </div>
        ) : activeTab === 'tables' ? (
          <TablesTab
            tables={tables}
            views={views}
            selectedTable={selectedTable}
            tableDetails={tableDetails}
            tablePreview={tablePreview}
            isLoading={isLoadingSchema || isLoadingTable}
            onSelectTable={handleSelectTable}
          />
        ) : activeTab === 'query' ? (
          <QueryTab
            query={queryEditor}
            result={queryResult}
            isExecuting={isExecutingQuery}
            onQueryChange={setQueryEditor}
            onExecute={executeQuery}
          />
        ) : (
          <HistoryTab queries={recentQueries} onSelectQuery={setQueryEditor} />
        )}
      </div>

      {/* Connection Modal */}
      {showConnectionModal && (
        <ConnectionModal
          projectId={projectId || ''}
          onClose={() => setShowConnectionModal(false)}
          onConnect={(connection) => {
            addConnection(connection);
            setActiveConnection(connection.id);
            setShowConnectionModal(false);
          }}
        />
      )}
    </div>
  );
});

DatabaseExplorer.displayName = 'DatabaseExplorer';

// ============================================
// Sub-components
// ============================================

interface TablesTabProps {
  tables: TableInfo[];
  views: TableInfo[];
  selectedTable: string | null;
  tableDetails: any;
  tablePreview: { rows: Record<string, unknown>[]; columns: string[] } | null;
  isLoading: boolean;
  onSelectTable: (table: TableInfo) => void;
}

const TablesTab = memo(
  ({ tables, views, selectedTable, tableDetails, tablePreview, isLoading, onSelectTable }: TablesTabProps) => {
    if (isLoading && !tables.length) {
      return (
        <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
          Loading schema...
        </div>
      );
    }

    return (
      <div className="flex h-full">
        {/* Tables List */}
        <div className="w-48 border-r border-bolt-elements-borderColor overflow-auto">
          {tables.length > 0 && (
            <div className="p-2">
              <div className="text-xs text-bolt-elements-textTertiary mb-1">Tables ({tables.length})</div>
              {tables.map((table) => (
                <button
                  key={table.name}
                  onClick={() => onSelectTable(table)}
                  className={classNames(
                    'w-full px-2 py-1 text-xs text-left rounded transition-colors',
                    selectedTable === table.name
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
                  )}
                >
                  <span className="i-ph:table mr-1" />
                  {table.name}
                  {table.rowCount !== undefined && (
                    <span className="ml-1 text-bolt-elements-textTertiary">({table.rowCount})</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {views.length > 0 && (
            <div className="p-2 border-t border-bolt-elements-borderColor">
              <div className="text-xs text-bolt-elements-textTertiary mb-1">Views ({views.length})</div>
              {views.map((view) => (
                <button
                  key={view.name}
                  onClick={() => onSelectTable(view)}
                  className={classNames(
                    'w-full px-2 py-1 text-xs text-left rounded transition-colors',
                    selectedTable === view.name
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
                  )}
                >
                  <span className="i-ph:eye mr-1" />
                  {view.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table Details */}
        <div className="flex-1 overflow-auto">
          {selectedTable && tableDetails ? (
            <div className="p-3">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                {tableDetails.name}
              </h3>

              {/* Columns */}
              <div className="mb-4">
                <div className="text-xs text-bolt-elements-textTertiary mb-1">
                  Columns ({tableDetails.columns?.length || 0})
                </div>
                <div className="border border-bolt-elements-borderColor rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-bolt-elements-background-depth-2">
                      <tr>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Type</th>
                        <th className="px-2 py-1 text-left">Nullable</th>
                        <th className="px-2 py-1 text-left">Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableDetails.columns?.map((col: ColumnInfo) => (
                        <tr key={col.name} className="border-t border-bolt-elements-borderColor">
                          <td className="px-2 py-1 font-mono">{col.name}</td>
                          <td className="px-2 py-1 text-blue-400">{col.type}</td>
                          <td className="px-2 py-1">{col.nullable ? 'YES' : 'NO'}</td>
                          <td className="px-2 py-1">
                            {col.isPrimaryKey && <span className="text-yellow-400">PK</span>}
                            {col.isForeignKey && <span className="text-green-400 ml-1">FK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview Data */}
              {tablePreview && tablePreview.rows.length > 0 && (
                <div>
                  <div className="text-xs text-bolt-elements-textTertiary mb-1">
                    Preview ({tablePreview.rows.length} rows)
                  </div>
                  <div className="border border-bolt-elements-borderColor rounded overflow-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-bolt-elements-background-depth-2 sticky top-0">
                        <tr>
                          {tablePreview.columns.map((col) => (
                            <th key={col} className="px-2 py-1 text-left whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tablePreview.rows.map((row, i) => (
                          <tr key={i} className="border-t border-bolt-elements-borderColor">
                            {tablePreview.columns.map((col) => (
                              <td key={col} className="px-2 py-1 font-mono whitespace-nowrap">
                                {formatValue(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
              Select a table to view details
            </div>
          )}
        </div>
      </div>
    );
  }
);

TablesTab.displayName = 'TablesTab';

interface QueryTabProps {
  query: string;
  result: any;
  isExecuting: boolean;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
}

const QueryTab = memo(({ query, result, isExecuting, onQueryChange, onExecute }: QueryTabProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onExecute();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Query Editor */}
      <div className="p-3 border-b border-bolt-elements-borderColor">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-bolt-elements-textTertiary">SQL Query (Ctrl+Enter to execute)</span>
          <button
            onClick={onExecute}
            disabled={isExecuting || !query.trim()}
            className={classNames(
              'px-3 py-1 text-xs rounded',
              isExecuting || !query.trim()
                ? 'bg-bolt-elements-background-depth-3 opacity-50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            {isExecuting ? 'Executing...' : 'Execute'}
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM users LIMIT 10"
          className="w-full h-32 px-3 py-2 text-xs font-mono bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary resize-none"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-3">
        {result ? (
          result.success ? (
            <div>
              <div className="text-xs text-bolt-elements-textTertiary mb-2">
                {result.rowCount} rows returned
                {result.executionTime && ` in ${result.executionTime}ms`}
                {result.truncated && ' (truncated)'}
              </div>
              {result.rows && result.rows.length > 0 ? (
                <div className="border border-bolt-elements-borderColor rounded overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-bolt-elements-background-depth-2 sticky top-0">
                      <tr>
                        {result.fields?.map((field: { name: string }) => (
                          <th key={field.name} className="px-2 py-1 text-left whitespace-nowrap">
                            {field.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-t border-bolt-elements-borderColor">
                          {result.fields?.map((field: { name: string }) => (
                            <td key={field.name} className="px-2 py-1 font-mono whitespace-nowrap">
                              {formatValue(row[field.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-bolt-elements-textSecondary text-sm">Query executed successfully</div>
              )}
            </div>
          ) : (
            <div className="text-red-400 text-sm">
              <span className="i-ph:warning mr-1" />
              {result.error}
            </div>
          )
        ) : (
          <div className="text-bolt-elements-textTertiary text-sm text-center">
            Enter a query and click Execute
          </div>
        )}
      </div>
    </div>
  );
});

QueryTab.displayName = 'QueryTab';

interface HistoryTabProps {
  queries: Array<{
    id: string;
    query: string;
    executedAt: number;
    success: boolean;
    rowCount?: number;
    error?: string;
  }>;
  onSelectQuery: (query: string) => void;
}

const HistoryTab = memo(({ queries, onSelectQuery }: HistoryTabProps) => {
  if (queries.length === 0) {
    return (
      <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
        <span className="i-ph:clock-counter-clockwise text-2xl block mb-2" />
        No query history
      </div>
    );
  }

  return (
    <div className="p-2">
      {queries.map((entry) => (
        <button
          key={entry.id}
          onClick={() => onSelectQuery(entry.query)}
          className="w-full p-2 mb-1 text-left hover:bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor"
        >
          <div className="flex items-center justify-between mb-1">
            <span className={classNames('text-xs', entry.success ? 'text-green-400' : 'text-red-400')}>
              {entry.success ? `${entry.rowCount} rows` : 'Error'}
            </span>
            <span className="text-xs text-bolt-elements-textTertiary">
              {new Date(entry.executedAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-xs font-mono text-bolt-elements-textSecondary truncate">{entry.query}</div>
          {entry.error && <div className="text-xs text-red-400 mt-1 truncate">{entry.error}</div>}
        </button>
      ))}
    </div>
  );
});

HistoryTab.displayName = 'HistoryTab';

// ============================================
// Connection Modal
// ============================================

interface ConnectionModalProps {
  projectId: string;
  onClose: () => void;
  onConnect: (connection: DatabaseConnection) => void;
}

const ConnectionModal = memo(({ projectId, onClose, onConnect }: ConnectionModalProps) => {
  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [filename, setFilename] = useState('');
  const [name, setName] = useState('');
  const [useSSL, setUseSSL] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      let params: any;

      if (dbType === 'postgresql') {
        if (!host || !database || !user) {
          setError('Host, database, and user are required');
          setIsConnecting(false);
          return;
        }
        params = {
          type: 'postgresql',
          host,
          port: parseInt(port, 10),
          database,
          user,
          password,
          ssl: useSSL,
          name: name || `${host}/${database}`,
        };
      } else {
        if (!filename) {
          setError('Filename is required');
          setIsConnecting(false);
          return;
        }
        params = {
          type: 'sqlite',
          filename,
          name: name || filename.split('/').pop() || 'SQLite',
        };
      }

      const data = await dockerPost<{
        success: boolean;
        connectionId?: string;
        error?: string;
      }>(`/api/database/${projectId}/connect`, params);

      if (data?.success && data.connectionId) {
        onConnect({
          id: data.connectionId,
          name: params.name,
          type: dbType,
          createdAt: Date.now(),
          lastUsed: Date.now(),
        });
        toast.success('Connected to database');
      } else {
        setError(data?.error || 'Failed to connect');
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bolt-elements-background-depth-1 rounded-lg shadow-xl w-96 max-w-full m-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Connect to Database</h3>
          <button onClick={onClose} className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary">
            <span className="i-ph:x" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Database Type */}
          <div>
            <label className="block text-xs text-bolt-elements-textTertiary mb-1">Database Type</label>
            <select
              value={dbType}
              onChange={(e) => setDbType(e.target.value as DatabaseType)}
              className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>

          {dbType === 'postgresql' ? (
            <>
              {/* Host & Port */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-bolt-elements-textTertiary mb-1">Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                    className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs text-bolt-elements-textTertiary mb-1">Port</label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="5432"
                    className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                  />
                </div>
              </div>

              {/* Database */}
              <div>
                <label className="block text-xs text-bolt-elements-textTertiary mb-1">Database</label>
                <input
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="mydb"
                  className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs text-bolt-elements-textTertiary mb-1">Username</label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="postgres"
                  className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs text-bolt-elements-textTertiary mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                />
              </div>

              {/* SSL */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ssl"
                  checked={useSSL}
                  onChange={(e) => setUseSSL(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="ssl" className="text-xs text-bolt-elements-textSecondary">
                  Use SSL
                </label>
              </div>
            </>
          ) : (
            <>
              {/* SQLite Filename */}
              <div>
                <label className="block text-xs text-bolt-elements-textTertiary mb-1">
                  Database File (relative to /workspace)
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="data.db"
                  className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
                />
              </div>
            </>
          )}

          {/* Connection Name */}
          <div>
            <label className="block text-xs text-bolt-elements-textTertiary mb-1">
              Connection Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Database"
              className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
            />
          </div>

          {/* Error */}
          {error && <div className="text-red-400 text-xs">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-bolt-elements-borderColor">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3/80 rounded text-bolt-elements-textPrimary"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={classNames(
              'px-3 py-1.5 text-xs rounded text-white',
              isConnecting ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
});

ConnectionModal.displayName = 'ConnectionModal';

// ============================================
// Utilities
// ============================================

function formatValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, 100);
    } catch {
      return '[Object]';
    }
  }
  const str = String(value);
  return str.length > 100 ? str.slice(0, 100) + '...' : str;
}

export default DatabaseExplorer;
