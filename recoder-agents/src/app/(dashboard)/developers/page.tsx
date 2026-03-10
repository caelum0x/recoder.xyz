'use client';

import { useState, useCallback } from 'react';
import { Code, ChevronDown, ChevronRight, Send, Key, Copy, Check, Globe, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HttpMethod = 'GET' | 'POST' | 'DELETE';

interface Param {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  type: string;
}

interface Endpoint {
  method: HttpMethod;
  path: string;
  description: string;
  params: Param[];
}

interface EndpointGroup {
  name: string;
  description: string;
  endpoints: Endpoint[];
}

// ---------------------------------------------------------------------------
// API catalogue
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.recoder.xyz';

const endpointGroups: EndpointGroup[] = [
  {
    name: 'Agents',
    description: 'Query agent analytics, performance data, and cost estimates.',
    endpoints: [
      {
        method: 'GET',
        path: '/agents/{agent_id}/analytics',
        description: 'Get analytics overview for an agent including total runs, success rate, and average duration.',
        params: [
          { name: 'agent_id', in: 'path', required: true, description: 'The unique identifier of the agent', type: 'string' },
          { name: 'period', in: 'query', required: false, description: 'Time period (7d, 30d, 90d)', type: 'string' },
        ],
      },
      {
        method: 'GET',
        path: '/agents/{agent_id}/analytics/daily',
        description: 'Get daily breakdown of agent usage metrics.',
        params: [
          { name: 'agent_id', in: 'path', required: true, description: 'The unique identifier of the agent', type: 'string' },
          { name: 'days', in: 'query', required: false, description: 'Number of days to return (default 30)', type: 'number' },
        ],
      },
      {
        method: 'GET',
        path: '/agents/{agent_id}/analytics/models',
        description: 'Get model performance metrics including tokens used, latency, and cost per model.',
        params: [
          { name: 'agent_id', in: 'path', required: true, description: 'The unique identifier of the agent', type: 'string' },
        ],
      },
      {
        method: 'GET',
        path: '/agents/{agent_id}/cost-estimate',
        description: 'Estimate the cost for running an agent based on historical usage patterns.',
        params: [
          { name: 'agent_id', in: 'path', required: true, description: 'The unique identifier of the agent', type: 'string' },
          { name: 'runs', in: 'query', required: false, description: 'Estimated number of runs (default 100)', type: 'number' },
        ],
      },
    ],
  },
  {
    name: 'Workflows',
    description: 'Create, manage, and execute multi-step workflows.',
    endpoints: [
      {
        method: 'POST',
        path: '/workflows',
        description: 'Create a new workflow definition.',
        params: [
          { name: 'name', in: 'query', required: true, description: 'Name of the workflow', type: 'string' },
          { name: 'description', in: 'query', required: false, description: 'Optional description', type: 'string' },
        ],
      },
      {
        method: 'GET',
        path: '/workflows/{workflow_id}',
        description: 'Get a workflow by ID including all step definitions.',
        params: [
          { name: 'workflow_id', in: 'path', required: true, description: 'The workflow identifier', type: 'string' },
        ],
      },
      {
        method: 'DELETE',
        path: '/workflows/{workflow_id}',
        description: 'Delete a workflow and all associated execution history.',
        params: [
          { name: 'workflow_id', in: 'path', required: true, description: 'The workflow identifier', type: 'string' },
        ],
      },
      {
        method: 'POST',
        path: '/workflows/{workflow_id}/execute',
        description: 'Execute a workflow, optionally with input variables.',
        params: [
          { name: 'workflow_id', in: 'path', required: true, description: 'The workflow identifier', type: 'string' },
          { name: 'dry_run', in: 'query', required: false, description: 'Validate without executing (true/false)', type: 'boolean' },
        ],
      },
      {
        method: 'GET',
        path: '/workflows/{workflow_id}/executions',
        description: 'List past executions for a workflow with status and timing.',
        params: [
          { name: 'workflow_id', in: 'path', required: true, description: 'The workflow identifier', type: 'string' },
          { name: 'limit', in: 'query', required: false, description: 'Max results (default 20)', type: 'number' },
          { name: 'offset', in: 'query', required: false, description: 'Pagination offset', type: 'number' },
        ],
      },
      {
        method: 'GET',
        path: '/workflows/templates/list',
        description: 'List available workflow templates that can be cloned.',
        params: [
          { name: 'category', in: 'query', required: false, description: 'Filter by category', type: 'string' },
        ],
      },
      {
        method: 'GET',
        path: '/workflows/analytics/overview',
        description: 'Get aggregate analytics across all workflows.',
        params: [
          { name: 'period', in: 'query', required: false, description: 'Time period (7d, 30d, 90d)', type: 'string' },
        ],
      },
    ],
  },
  {
    name: 'Threads',
    description: 'Manage conversation threads and context.',
    endpoints: [
      {
        method: 'POST',
        path: '/threads/{thread_id}/compress',
        description: 'Compress thread context to reduce token usage while preserving important information.',
        params: [
          { name: 'thread_id', in: 'path', required: true, description: 'The thread identifier', type: 'string' },
          { name: 'strategy', in: 'query', required: false, description: 'Compression strategy (summary, selective, hybrid)', type: 'string' },
          { name: 'target_ratio', in: 'query', required: false, description: 'Target compression ratio (0.1 - 0.9)', type: 'number' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  POST: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
  DELETE: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold font-mono tracking-wide',
        methodColors[method],
      )}
    >
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Endpoint Card
// ---------------------------------------------------------------------------

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullPath = `${API_BASE_URL}${endpoint.path}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [fullPath]);

  const pathParams = endpoint.params.filter((p) => p.in === 'path');
  const queryParams = endpoint.params.filter((p) => p.in === 'query');

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header - always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-xl"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-mono text-foreground truncate">{endpoint.path}</code>
        <span className="ml-auto text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
          {endpoint.description}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">{endpoint.description}</p>

          {/* Full URL with copy */}
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <code className="text-xs font-mono text-foreground flex-1 truncate">{fullPath}</code>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Parameters */}
          {pathParams.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Path Parameters</h4>
              <div className="space-y-1.5">
                {pathParams.map((p) => (
                  <ParamRow key={p.name} param={p} />
                ))}
              </div>
            </div>
          )}

          {queryParams.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Query Parameters</h4>
              <div className="space-y-1.5">
                {queryParams.map((p) => (
                  <ParamRow key={p.name} param={p} />
                ))}
              </div>
            </div>
          )}

          {/* Try it placeholder */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="gap-1.5" disabled>
              <Send className="h-3.5 w-3.5" />
              Try it
            </Button>
            <span className="text-xs text-muted-foreground">Coming soon — live request testing</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamRow({ param }: { param: Param }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <code className="font-mono text-xs bg-muted/60 rounded px-1.5 py-0.5 text-foreground flex-shrink-0">
        {param.name}
      </code>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {param.type}
      </span>
      {param.required && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
          required
        </Badge>
      )}
      <span className="text-xs text-muted-foreground">{param.description}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DevelopersPage() {
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState(false);

  return (
    <div className="min-h-[100dvh]">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Page header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Code className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold">API Explorer</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg">
            Explore and test the Recoder platform API. Browse available endpoints, view parameters, and prepare requests.
            {' '}Try the <a href="/developers/playground" className="text-primary hover:underline font-medium">interactive playground</a> to execute requests live.
          </p>
        </div>

        {/* Base URL + Auth */}
        <SpotlightCard className="border border-border bg-card">
          <div className="p-5 space-y-4">
            {/* Base URL */}
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Base URL</span>
              <code className="ml-2 rounded-md bg-muted/60 px-2.5 py-1 text-sm font-mono text-foreground">
                {API_BASE_URL}
              </code>
            </div>

            {/* API Key */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (keySet) setKeySet(false);
                  }}
                  placeholder="sk-..."
                  className={cn(
                    'ml-2 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono',
                    'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
                  )}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (apiKey.trim()) setKeySet(true);
                }}
                disabled={!apiKey.trim()}
              >
                <Key className="h-3.5 w-3.5" />
                {keySet ? 'Key Set' : 'Set Key'}
              </Button>
            </div>

            {keySet && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                API key configured. It will be included in requests when live testing is available.
              </p>
            )}
          </div>
        </SpotlightCard>

        {/* Endpoint groups */}
        <div className="space-y-8">
          {endpointGroups.map((group) => (
            <section key={group.name} className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{group.name}</h2>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
              <div className="space-y-2">
                {group.endpoints.map((ep) => (
                  <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer note */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            This API explorer is auto-generated from the Recoder OpenAPI specification.
            For full documentation, visit the{' '}
            <a href="https://docs.recoder.xyz" className="underline hover:text-foreground transition-colors">
              developer docs
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
