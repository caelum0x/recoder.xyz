/**
 * preview-engine — the concrete executor behind the `recoder.preview` MCP server.
 * Lets an AGENT close the verify-your-own-work loop on a live preview of its OWN
 * workspace: resolve the workspace's preview URL, probe its health, run the richer
 * headless browser-check, and attach the evidence to the task's audit trail.
 *
 * The preview URL is owned by the conductor (set on `workspace.metadata.previewUrl`
 * by the publish/preview surface), NOT invented here — when a workspace has no
 * preview (the common case: most tasks produce code, not a live page) the tools
 * return a truthful "no preview URL" rather than a fabricated link. Runs behind the
 * interop gate. Deps are injected so the wiring is unit-testable without the
 * conductor or a real network.
 */
import { randomUUID } from 'node:crypto';
import { previewMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import type { Artifact } from '@recoder/agent-os';
import type { AgentOsRepository } from '../repositories/agent-os.repository.js';

/** Minimal workspace shape the engine needs (a subset of the domain Workspace). */
export interface PreviewWorkspaceLike {
  workspaceId: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface PreviewProbeResult {
  ok: boolean;
  status: number;
  message: string;
}

/** Injected conductor/network seams; real ones are wired in inproc-engines. */
export interface PreviewEngineDeps {
  getWorkspace(id: string): Promise<PreviewWorkspaceLike | null>;
  listWorkspaces(): Promise<PreviewWorkspaceLike[]>;
  /** Optional richer headless-browser check (render + console + screenshot). */
  runBrowserCheck?(workspaceId: string): Promise<unknown>;
  /** Optional custom reachability probe; defaults to a built-in fetch probe. */
  probe?(url: string): Promise<PreviewProbeResult>;
}

const PROBE_TIMEOUT_MS = Number(process.env.RECODER_PREVIEW_PROBE_TIMEOUT_MS) || 8_000;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Read a preview URL off workspace metadata (several historical key spellings). */
function previewUrlOf(ws: PreviewWorkspaceLike | null | undefined): string | undefined {
  const meta = ws?.metadata;
  if (!meta) return undefined;
  for (const value of [meta.previewUrl, meta.preview_url, meta.previewURL]) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return undefined;
}

/** Default dependency-light reachability probe (2xx/3xx == healthy). Never throws. */
async function defaultProbe(url: string): Promise<PreviewProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const ok = res.status >= 200 && res.status < 400;
    return {
      ok,
      status: res.status,
      message: ok ? `Preview reachable (HTTP ${res.status})` : `Preview returned HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, status: 0, message: `Preview unreachable: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

export function registerPreviewMcpTools(
  router: McpToolRouter,
  repository: AgentOsRepository,
  deps: PreviewEngineDeps,
): void {
  const probe = deps.probe ?? defaultProbe;

  /**
   * Resolve the workspace this call is about: an explicit `workspaceId` wins,
   * otherwise the caller's task is matched to its workspace. Throws a truthful
   * error when neither resolves (never guesses).
   */
  async function resolveWorkspace(input: McpToolCallInput): Promise<PreviewWorkspaceLike> {
    const wid = str(input.args.workspaceId) ?? str(input.args.id);
    if (wid) {
      const ws = await deps.getWorkspace(wid);
      if (!ws) throw new Error(`workspace not found: ${wid}`);
      return ws;
    }
    const tid = str(input.args.taskId) ?? input.task?.taskId;
    if (!tid) throw new Error('workspaceId (or a task context) is required');
    const all = await deps.listWorkspaces();
    // Most recent workspace for the task wins, mirroring control-plane read order.
    const forTask = all.filter((w) => w.taskId === tid);
    if (forTask.length === 0) throw new Error(`no workspace found for task ${tid}`);
    return forTask[forTask.length - 1];
  }

  router.register(previewMcpServer, 'preview.issue_url', async (input) => {
    const ws = await resolveWorkspace(input);
    const url = previewUrlOf(ws);
    if (!url) {
      return {
        content: {
          workspaceId: ws.workspaceId,
          url: null,
          message: 'This workspace has no preview URL (it produced code, not a live page).',
        },
      };
    }
    return { content: { workspaceId: ws.workspaceId, url } };
  });

  router.register(previewMcpServer, 'preview.health', async (input) => {
    const ws = await resolveWorkspace(input);
    const url = str(input.args.url) ?? previewUrlOf(ws);
    if (!url) throw new Error('no preview URL for this workspace to health-check');
    const result = await probe(url);
    return { content: { workspaceId: ws.workspaceId, url, healthy: result.ok, status: result.status, message: result.message } };
  });

  router.register(previewMcpServer, 'preview.browser_check', async (input) => {
    const ws = await resolveWorkspace(input);
    if (!deps.runBrowserCheck) {
      throw new Error('browser check is not available in this runtime');
    }
    const outcome = await deps.runBrowserCheck(ws.workspaceId);
    return { content: { workspaceId: ws.workspaceId, outcome } };
  });

  router.register(previewMcpServer, 'preview.attach_evidence', async (input) => {
    const ws = await resolveWorkspace(input);
    const tid = str(input.args.taskId) ?? ws.taskId ?? input.task?.taskId;
    if (!tid) throw new Error('taskId is required to attach preview evidence');
    const note = str(input.args.note) ?? str(input.args.content);
    const url = str(input.args.url) ?? previewUrlOf(ws);
    if (!note && !url) throw new Error('preview evidence requires a note or a url');
    const artifact: Artifact = {
      artifactId: `art_${randomUUID()}`,
      taskId: tid,
      runId: str(input.args.runId),
      kind: 'preview',
      mimeType: 'text/plain',
      content: [url ? `Preview: ${url}` : '', note ?? ''].filter(Boolean).join('\n'),
      public: false,
      createdAt: new Date().toISOString(),
      createdBy: input.actor?.agentId || 'agent',
      provenance: { sourceUrl: url },
    };
    const saved = await repository.upsertArtifact(artifact);
    return { content: { artifactId: saved.artifactId, workspaceId: ws.workspaceId, url: url ?? null } };
  });
}
