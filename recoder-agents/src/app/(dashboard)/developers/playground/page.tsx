'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Send,
  Clock,
  ChevronRight,
  Trash2,
  RotateCw,
  Copy,
  Check,
  Star,
  Save,
  Play,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usePlaygroundEndpoints,
  useExecutePlaygroundRequest,
  usePlaygroundHistory,
  useSavePlaygroundEntry,
  useDeletePlaygroundEntry,
} from '@/hooks/developers/use-api-playground';
import type {
  PlaygroundEndpoint,
  PlaygroundResponse,
  PlaygroundHistoryEntry,
} from '@/lib/api/api-playground';

// ---------------------------------------------------------------------------
// Method styling
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  PUT: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
  PATCH: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

const STATUS_COLORS: Record<string, string> = {
  '2': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  '3': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  '4': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  '5': 'bg-red-500/10 text-red-600 border-red-500/20',
};

function getStatusColor(status: number): string {
  const key = String(status).charAt(0);
  return STATUS_COLORS[key] || 'bg-muted text-muted-foreground';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const { data: endpointsData, isLoading: endpointsLoading } = usePlaygroundEndpoints();
  const executeMutation = useExecutePlaygroundRequest();

  // History tabs
  const [historyTab, setHistoryTab] = useState<'recent' | 'saved'>('recent');
  const { data: recentHistory = [], isLoading: recentLoading } = usePlaygroundHistory(false);
  const { data: savedHistory = [], isLoading: savedLoading } = usePlaygroundHistory(true);
  const saveMutation = useSavePlaygroundEntry();
  const deleteMutation = useDeletePlaygroundEntry();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<PlaygroundEndpoint | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [headerRows, setHeaderRows] = useState<{ key: string; value: string }[]>([]);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const endpoints = endpointsData?.endpoints || [];

  // Group endpoints by tag
  const groupedEndpoints = useMemo(() => {
    const filtered = searchQuery
      ? endpoints.filter(
          (e) =>
            e.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
            e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
            e.method.toLowerCase().includes(searchQuery.toLowerCase()) ||
            e.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : endpoints;

    const groups: Record<string, PlaygroundEndpoint[]> = {};
    filtered.forEach((endpoint) => {
      const tag = endpoint.tags[0] || 'Other';
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(endpoint);
    });
    return groups;
  }, [endpoints, searchQuery]);

  const handleSelectEndpoint = useCallback((endpoint: PlaygroundEndpoint) => {
    setSelectedEndpoint(endpoint);
    setResponse(null);
    setRequestBody('');
    setQueryParams({});
    setPathParams({});
    setHeaderRows([]);

    // Pre-populate query params from parameters
    const qp: Record<string, string> = {};
    endpoint.parameters
      .filter((p) => p.in === 'query')
      .forEach((p) => {
        qp[p.name] = '';
      });
    setQueryParams(qp);

    // Pre-populate path params
    const pp: Record<string, string> = {};
    endpoint.parameters
      .filter((p) => p.in === 'path')
      .forEach((p) => {
        pp[p.name] = '';
      });
    setPathParams(pp);

    // Pre-populate request body skeleton
    if (endpoint.request_body) {
      try {
        const props = endpoint.request_body.properties || {};
        const skeleton: Record<string, any> = {};
        Object.entries(props).forEach(([key, schema]: [string, any]) => {
          if (schema.type === 'string') skeleton[key] = '';
          else if (schema.type === 'integer' || schema.type === 'number') skeleton[key] = 0;
          else if (schema.type === 'boolean') skeleton[key] = false;
          else if (schema.type === 'array') skeleton[key] = [];
          else if (schema.type === 'object') skeleton[key] = {};
          else skeleton[key] = null;
        });
        setRequestBody(JSON.stringify(skeleton, null, 2));
      } catch {
        setRequestBody('{}');
      }
    }
  }, []);

  const handleSendRequest = useCallback(async () => {
    if (!selectedEndpoint) return;

    // Build path with path params replaced
    let path = selectedEndpoint.path;
    Object.entries(pathParams).forEach(([key, value]) => {
      if (value) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }
    });

    // Filter out empty query params
    const filteredQp: Record<string, string> = {};
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v.trim()) filteredQp[k] = v.trim();
    });

    // Build headers from rows
    const customHeaders: Record<string, string> = {};
    headerRows.forEach((row) => {
      if (row.key.trim() && row.value.trim()) {
        customHeaders[row.key.trim()] = row.value.trim();
      }
    });

    // Parse request body
    let parsedBody: Record<string, any> | undefined;
    if (requestBody.trim() && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)) {
      try {
        parsedBody = JSON.parse(requestBody);
      } catch {
        setResponse({
          status_code: 0,
          response_time_ms: 0,
          body: { detail: 'Invalid JSON in request body' },
          headers: {},
          method: selectedEndpoint.method,
          path,
        });
        return;
      }
    }

    const result = await executeMutation.mutateAsync({
      method: selectedEndpoint.method,
      path,
      headers: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
      body: parsedBody,
      query_params: Object.keys(filteredQp).length > 0 ? filteredQp : undefined,
    });

    setResponse(result);
  }, [selectedEndpoint, pathParams, queryParams, headerRows, requestBody, executeMutation]);

  const handleReplayHistory = useCallback(
    (entry: PlaygroundHistoryEntry) => {
      // Find matching endpoint
      const match = endpoints.find(
        (e) => e.method === entry.method && e.path === entry.endpoint
      );
      if (match) {
        handleSelectEndpoint(match);
      } else {
        // Set endpoint manually if not in the list
        setSelectedEndpoint({
          method: entry.method,
          path: entry.endpoint,
          summary: '',
          description: '',
          tags: [],
          parameters: [],
          request_body: null,
          operation_id: '',
        });
      }
      setRequestBody(entry.body ? JSON.stringify(entry.body, null, 2) : '');
      setResponse(null);
      setShowHistory(false);
    },
    [endpoints, handleSelectEndpoint]
  );

  const handleCopyResponse = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(response.body, null, 2)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const displayHistory = historyTab === 'saved' ? savedHistory : recentHistory;
  const historyLoading = historyTab === 'saved' ? savedLoading : recentLoading;

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">API Playground</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Explore and test API endpoints interactively
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel - Endpoint list */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="border rounded-lg bg-card">
            {/* Search */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search endpoints..."
                  className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Tabs: Endpoints | History */}
            <div className="flex border-b">
              <button
                className={cn(
                  'flex-1 py-2 text-xs font-medium text-center transition-colors',
                  !showHistory
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setShowHistory(false)}
              >
                Endpoints
              </button>
              <button
                className={cn(
                  'flex-1 py-2 text-xs font-medium text-center transition-colors',
                  showHistory
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setShowHistory(true)}
              >
                History
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
              {showHistory ? (
                <div>
                  {/* Recent / Saved tabs */}
                  <div className="px-3 pt-2">
                    <Tabs
                      value={historyTab}
                      onValueChange={(v) => setHistoryTab(v as 'recent' | 'saved')}
                    >
                      <TabsList className="h-7 w-full">
                        <TabsTrigger value="recent" className="text-xs h-6 flex-1">
                          <Clock className="h-3 w-3 mr-1" />
                          Recent
                        </TabsTrigger>
                        <TabsTrigger value="saved" className="text-xs h-6 flex-1">
                          <Star className="h-3 w-3 mr-1" />
                          Saved
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="divide-y divide-border mt-2">
                    {historyLoading ? (
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : displayHistory.length === 0 ? (
                      <div className="p-6 text-center">
                        <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {historyTab === 'saved'
                            ? 'No saved requests'
                            : 'No request history yet'}
                        </p>
                      </div>
                    ) : (
                      displayHistory.map((entry) => (
                        <div key={entry.id} className="group relative">
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            onClick={() => handleReplayHistory(entry)}
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-mono px-1.5 py-0 h-5 shrink-0',
                                  METHOD_COLORS[entry.method]
                                )}
                              >
                                {entry.method}
                              </Badge>
                              <span className="text-xs font-mono truncate text-muted-foreground">
                                {entry.endpoint}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {entry.response_status && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] px-1.5 py-0 h-4',
                                    getStatusColor(entry.response_status)
                                  )}
                                >
                                  {entry.response_status}
                                </Badge>
                              )}
                              {entry.response_time_ms != null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {entry.response_time_ms}ms
                                </span>
                              )}
                              {entry.name && (
                                <span className="text-[10px] text-primary truncate max-w-[80px]">
                                  {entry.name}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground/60 ml-auto">
                                {timeAgo(entry.created_at)}
                              </span>
                            </div>
                          </button>
                          {/* Action buttons */}
                          <div className="absolute right-2 top-2 hidden group-hover:flex gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                saveMutation.mutate({
                                  entryId: entry.id,
                                  data: { is_saved: !entry.is_saved },
                                });
                              }}
                            >
                              <Star
                                className={cn(
                                  'h-3 w-3',
                                  entry.is_saved
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-muted-foreground'
                                )}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(entry.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : endpointsLoading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                Object.entries(groupedEndpoints).map(([tag, tagEndpoints]) => (
                  <EndpointGroup
                    key={tag}
                    tag={tag}
                    endpoints={tagEndpoints}
                    selectedEndpoint={selectedEndpoint}
                    onSelect={handleSelectEndpoint}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right panel - Request/Response */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {selectedEndpoint ? (
            <>
              {/* Request */}
              <div className="border rounded-lg bg-card">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-mono text-xs px-2',
                        METHOD_COLORS[selectedEndpoint.method]
                      )}
                    >
                      {selectedEndpoint.method}
                    </Badge>
                    <code className="text-sm font-mono text-foreground">
                      {selectedEndpoint.path}
                    </code>
                  </div>
                  <Button
                    onClick={handleSendRequest}
                    disabled={executeMutation.isPending}
                    size="sm"
                    className="gap-1.5"
                  >
                    {executeMutation.isPending ? (
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Send Request
                  </Button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Description */}
                  {(selectedEndpoint.summary || selectedEndpoint.description) && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {selectedEndpoint.summary || selectedEndpoint.description}
                      </p>
                    </div>
                  )}

                  {/* Path parameters */}
                  {Object.keys(pathParams).length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Path Parameters
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(pathParams).map(([key, value]) => {
                          const param = selectedEndpoint.parameters.find(
                            (p) => p.name === key && p.in === 'path'
                          );
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <label className="text-xs font-mono w-32 shrink-0 text-foreground">
                                {key}
                                {param?.required && (
                                  <span className="text-red-500 ml-0.5">*</span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={value}
                                onChange={(e) =>
                                  setPathParams((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder={param?.description || key}
                                className="flex-1 h-8 px-2.5 text-sm font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Headers section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Headers
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() =>
                          setHeaderRows((prev) => [...prev, { key: '', value: '' }])
                        }
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>
                    {headerRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">
                        No custom headers. Authorization is sent automatically.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {headerRows.map((row, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={row.key}
                              onChange={(e) =>
                                setHeaderRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, key: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Header name"
                              className="w-40 h-8 px-2.5 text-sm font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) =>
                                setHeaderRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, value: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Value"
                              className="flex-1 h-8 px-2.5 text-sm font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setHeaderRows((prev) =>
                                  prev.filter((_, i) => i !== idx)
                                )
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Query parameters */}
                  {Object.keys(queryParams).length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Query Parameters
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(queryParams).map(([key, value]) => {
                          const param = selectedEndpoint.parameters.find(
                            (p) => p.name === key && p.in === 'query'
                          );
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <label className="text-xs font-mono w-32 shrink-0 text-foreground">
                                {key}
                                {param?.required && (
                                  <span className="text-red-500 ml-0.5">*</span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={value}
                                onChange={(e) =>
                                  setQueryParams((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder={param?.description || key}
                                className="flex-1 h-8 px-2.5 text-sm font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Request body */}
                  {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Request Body
                      </h4>
                      <textarea
                        value={requestBody}
                        onChange={(e) => setRequestBody(e.target.value)}
                        placeholder='{ "key": "value" }'
                        className="w-full h-40 px-3 py-2 text-sm font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                        spellCheck={false}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Response */}
              {response && (
                <div className="border rounded-lg bg-card">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-medium">Response</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-mono text-xs px-2',
                          getStatusColor(response.status_code)
                        )}
                      >
                        {response.status_code}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {response.response_time_ms}ms
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={handleCopyResponse}
                    >
                      {copied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="p-4">
                    {/* Response headers */}
                    {Object.keys(response.headers).length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                          Headers
                        </h4>
                        <div className="text-xs font-mono text-muted-foreground space-y-0.5">
                          {Object.entries(response.headers).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-foreground/70">{k}:</span> {v}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Response body */}
                    <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all">
                      {typeof response.body === 'string'
                        ? response.body
                        : JSON.stringify(response.body, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="border rounded-lg bg-card p-12 text-center">
              <Send className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium mb-1">Select an Endpoint</h3>
              <p className="text-sm text-muted-foreground">
                Choose an API endpoint from the list to start testing
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Endpoint group (collapsible tag section)
// ---------------------------------------------------------------------------

function EndpointGroup({
  tag,
  endpoints,
  selectedEndpoint,
  onSelect,
}: {
  tag: string;
  endpoints: PlaygroundEndpoint[];
  selectedEndpoint: PlaygroundEndpoint | null;
  onSelect: (e: PlaygroundEndpoint) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="uppercase tracking-wider">{tag}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            {endpoints.length}
          </span>
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              expanded && 'rotate-90'
            )}
          />
        </div>
      </button>
      {expanded && (
        <div className="pb-1">
          {endpoints.map((endpoint) => {
            const isSelected =
              selectedEndpoint?.method === endpoint.method &&
              selectedEndpoint?.path === endpoint.path;
            return (
              <button
                key={`${endpoint.method}-${endpoint.path}`}
                className={cn(
                  'w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors',
                  isSelected && 'bg-primary/5 border-l-2 border-primary'
                )}
                onClick={() => onSelect(endpoint)}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono px-1 py-0 h-4 shrink-0 w-12 justify-center',
                    METHOD_COLORS[endpoint.method]
                  )}
                >
                  {endpoint.method}
                </Badge>
                <span className="text-xs font-mono truncate text-muted-foreground">
                  {endpoint.path.replace('/v1/', '/')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
