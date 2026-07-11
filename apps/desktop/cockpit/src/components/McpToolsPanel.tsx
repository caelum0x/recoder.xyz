/**
 * McpToolsPanel — MCP server registry + tool list + policy-gated invoke surface.
 *
 * Surfaces:
 *   GET /api/mcp/servers  — registered MCP servers (name, kind, toolNames, enabled)
 *   GET /api/mcp/tools    — flat tool list across all servers
 *   POST /api/mcp/tools/:serverId/:toolName/check — policy gate check (NOT execute)
 *
 * DEGRADE-SAFE: when /api/mcp is unreachable or returns a non-ok response, a
 * truthful "unavailable — <reason>" banner is shown. No mock data is ever rendered.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { McpServer, McpToolEntry } from '../types';

const POLL_MS = 10_000;

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// ── Server row ────────────────────────────────────────────────────────────────

interface ServerRowProps {
  server: McpServer;
  onSelectServer: (serverId: string) => void;
  selectedServerId: string | null;
}

function ServerRow({ server, onSelectServer, selectedServerId }: ServerRowProps) {
  const isSelected = selectedServerId === server.serverId;
  return (
    <div
      class={`mcp-server-row${isSelected ? ' mcp-server-row--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelectServer(isSelected ? '' : server.serverId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectServer(isSelected ? '' : server.serverId);
        }
      }}
    >
      <span class={`badge tone-${server.enabled ? 'ok' : 'muted'}`}>
        {server.enabled ? 'enabled' : 'disabled'}
      </span>
      <span class="mcp-server-id">{server.serverId}</span>
      <span class="mcp-server-name">{server.displayName}</span>
      <span class="mcp-server-kind">{server.kind}</span>
      <span class="mcp-server-tools">{server.toolNames.length} tools</span>
    </div>
  );
}

// ── Policy-gated invoke form ──────────────────────────────────────────────────

interface CheckFormProps {
  serverId: string;
  toolName: string;
  onClose: () => void;
}

function CheckForm({ serverId, toolName, onClose }: CheckFormProps) {
  const [actorId, setActorId] = useState('cockpit-operator');
  const [argsRaw, setArgsRaw] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const argsValid = (() => {
    try {
      JSON.parse(argsRaw);
      return true;
    } catch {
      return false;
    }
  })();

  async function submit(e: Event) {
    e.preventDefault();
    if (!actorId.trim() || !argsValid) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const decision = await api.mcpCheckTool(serverId, toolName, {
        actor: {
          agentId: actorId.trim(),
          permissions: {
            defaultFileEffect: 'deny',
            pathRules: [],
            toolRules: [],
            allowNetwork: false,
            allowShell: false,
            allowGitWrite: false,
            allowPrCreation: false,
            allowSecretsAccess: false,
            maxParallelSubagents: 1,
            writeLockRequired: true,
          },
        },
        args: JSON.parse(argsRaw) as Record<string, unknown>,
      });
      const effect = decision.requiresApproval
        ? 'needs_approval'
        : decision.allowed
          ? 'allow'
          : 'deny';
      setResult(
        `Decision: ${effect}` +
          (decision.reason ? ` — ${decision.reason}` : '') +
          `\nAudit ID: ${decision.auditEvent.eventId}`,
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="mcp-check-form" onSubmit={submit}>
      <div class="mcp-check-form-header">
        <strong>Policy check</strong>
        <span class="mcp-tool-label">
          {serverId} / {toolName}
        </span>
      </div>
      <div class="field">
        <span>Actor agent ID</span>
        <input
          value={actorId}
          onInput={(e) => setActorId((e.target as HTMLInputElement).value)}
          placeholder="cockpit-operator"
        />
      </div>
      <div class="field">
        <span>Args (JSON)</span>
        <textarea
          rows={3}
          value={argsRaw}
          onInput={(e) => setArgsRaw((e.target as HTMLTextAreaElement).value)}
          placeholder="{}"
          class={argsValid ? '' : 'field-error'}
        />
        {!argsValid && <p class="form-error">Args must be valid JSON</p>}
      </div>
      {result && (
        <pre class="mcp-check-result">{result}</pre>
      )}
      {error && <p class="action-error">{error}</p>}
      <div class="modal-actions">
        <button class="btn btn-sm btn-ghost" type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
        <button
          class="btn btn-sm btn-primary"
          type="submit"
          disabled={!actorId.trim() || !argsValid || busy}
        >
          {busy ? 'Checking…' : 'Check policy'}
        </button>
      </div>
    </form>
  );
}

// ── Tool list for a selected server ──────────────────────────────────────────

interface ToolListProps {
  tools: McpToolEntry[];
  serverId: string;
  onInvoke: (serverId: string, toolName: string) => void;
}

function ToolList({ tools, serverId, onInvoke }: ToolListProps) {
  const serverTools = tools.filter((t) => t.serverId === serverId);
  if (serverTools.length === 0) {
    return <div class="panel-empty">No tools registered for this server.</div>;
  }
  return (
    <div class="mcp-tool-list">
      {serverTools.map((tool) => (
        <div class="mcp-tool-row" key={`${tool.serverId}:${tool.toolName}`}>
          <span class="mcp-tool-name">{tool.toolName}</span>
          <button
            class="btn btn-xs btn-ghost"
            type="button"
            title="Check policy gate for this tool"
            onClick={() => onInvoke(tool.serverId, tool.toolName)}
          >
            Check
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function McpToolsPanel() {
  const servers = usePoll(() => api.mcpServers(), POLL_MS);
  const tools = usePoll(() => api.mcpTools(), POLL_MS);

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [checkTarget, setCheckTarget] = useState<{ serverId: string; toolName: string } | null>(null);

  const serverList: McpServer[] = servers.data ?? [];
  const toolList: McpToolEntry[] = tools.data ?? [];

  const unreachable =
    servers.error instanceof BackendUnreachableError ||
    tools.error instanceof BackendUnreachableError;

  const fetchError = servers.error ?? tools.error;

  return (
    <section class="mcp-panel">
      <div class="panel-head">
        <h2 class="panel-title">MCP Tools</h2>
        <div class="panel-head-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              servers.refresh();
              tools.refresh();
            }}
            disabled={servers.loading || tools.loading}
          >
            {servers.loading || tools.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {unreachable && (
        <div class="banner banner-error">
          <strong>MCP host unavailable.</strong> Backend unreachable — cannot list servers or tools.
        </div>
      )}

      {fetchError && !unreachable && (
        <p class="action-error">MCP error: {fetchError.message}</p>
      )}

      {checkTarget && (
        <CheckForm
          serverId={checkTarget.serverId}
          toolName={checkTarget.toolName}
          onClose={() => setCheckTarget(null)}
        />
      )}

      {!fetchError && (
        <div class="mcp-summary">
          <span class="mcp-stat">
            <strong>{serverList.length}</strong> server{serverList.length !== 1 ? 's' : ''}
          </span>
          <span class="mcp-stat">
            <strong>{toolList.length}</strong> tool{toolList.length !== 1 ? 's' : ''}
          </span>
          <span class="mcp-stat">
            <strong>{serverList.filter((s) => s.enabled).length}</strong> enabled
          </span>
        </div>
      )}

      <div class="mcp-server-list">
        {servers.loading && serverList.length === 0 ? (
          <div class="panel-empty">Loading MCP servers…</div>
        ) : serverList.length === 0 && !servers.error ? (
          <div class="panel-empty">
            <p>No MCP servers registered.</p>
            <p class="panel-empty-sub">
              MCP servers are registered by the backend on startup. Check that the backend is
              running with the expected environment configuration.
            </p>
          </div>
        ) : (
          serverList.map((server) => (
            <div key={server.serverId}>
              <ServerRow
                server={server}
                onSelectServer={(id) => setSelectedServerId(id || null)}
                selectedServerId={selectedServerId}
              />
              {selectedServerId === server.serverId && (
                <ToolList
                  tools={toolList}
                  serverId={server.serverId}
                  onInvoke={(sid, toolName) => setCheckTarget({ serverId: sid, toolName })}
                />
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
