/** Base-versus-head diagnostics from repository-configured LSP servers. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSafe } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';

const MAX_CONFIG_BYTES = 64_000;
const MAX_FILES = 50;
const MAX_DIAGNOSTICS = 200;
const REQUEST_TIMEOUT_MS = 8_000;

export interface LspDiagnostic {
  readonly path: string;
  readonly line: number;
  readonly character: number;
  readonly severity: number;
  readonly code?: string;
  readonly source?: string;
  readonly message: string;
}

export interface LspDiagnosticsDelta {
  readonly available: boolean;
  readonly reason?: string;
  readonly baseRef: string;
  readonly changedFiles: readonly string[];
  readonly baseCount: number;
  readonly headCount: number;
  readonly introduced: readonly LspDiagnostic[];
  readonly resolved: readonly LspDiagnostic[];
  readonly unchanged: number;
  readonly servers: readonly { id: string; status: 'ok' | 'error'; detail?: string }[];
  readonly truncated: boolean;
}

interface LspServerSpec {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly extensions: readonly string[];
  readonly initialization?: Record<string, unknown>;
}

interface RawDiagnostic {
  readonly range?: { readonly start?: { readonly line?: unknown; readonly character?: unknown } };
  readonly severity?: unknown;
  readonly code?: unknown;
  readonly source?: unknown;
  readonly message?: unknown;
}

function parseConfig(content: string): readonly LspServerSpec[] {
  let value: unknown;
  try { value = JSON.parse(content); } catch { return []; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.servers)) return [];
  return row.servers.flatMap((item): LspServerSpec[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const server = item as Record<string, unknown>;
    const id = typeof server.id === 'string' ? server.id.trim().slice(0, 80) : '';
    const command = typeof server.command === 'string' ? server.command.trim() : '';
    const args = Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === 'string') : [];
    const extensions = Array.isArray(server.extensions)
      ? server.extensions.flatMap(value => typeof value === 'string' && /^\.[a-z0-9.]+$/i.test(value) ? [value] : [])
      : [];
    const initialization = server.initialization && typeof server.initialization === 'object' && !Array.isArray(server.initialization)
      ? server.initialization as Record<string, unknown>
      : undefined;
    return id && command && extensions.length > 0
      ? [{ id, command, args, extensions, ...(initialization ? { initialization } : {}) }]
      : [];
  }).slice(0, 10);
}

function diagnostic(path: string, value: RawDiagnostic): LspDiagnostic | null {
  if (typeof value.message !== 'string') return null;
  const line = typeof value.range?.start?.line === 'number' ? value.range.start.line : 0;
  const character = typeof value.range?.start?.character === 'number' ? value.range.start.character : 0;
  const severity = typeof value.severity === 'number' ? value.severity : 1;
  return {
    path,
    line: Math.max(0, line),
    character: Math.max(0, character),
    severity,
    ...(typeof value.code === 'string' || typeof value.code === 'number' ? { code: String(value.code) } : {}),
    ...(typeof value.source === 'string' ? { source: value.source.slice(0, 100) } : {}),
    message: value.message.trim().slice(0, 1_000),
  };
}

function key(value: LspDiagnostic): string {
  return JSON.stringify([value.path, value.line, value.character, value.severity, value.code ?? '', value.message]);
}

const LANGUAGE_IDS: Readonly<Record<string, string>> = {
  '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.rb': 'ruby', '.php': 'php',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.json': 'json', '.jsonc': 'jsonc', '.yaml': 'yaml', '.yml': 'yaml', '.sh': 'shellscript',
  '.css': 'css', '.html': 'html', '.vue': 'vue', '.svelte': 'svelte', '.swift': 'swift',
};

class LspSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private id = 0;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private readonly published = new Map<string, RawDiagnostic[]>();

  constructor(spec: LspServerSpec, cwd: string) {
    this.child = spawn(spec.command, [...spec.args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', chunk => { this.buffer = Buffer.concat([this.buffer, chunk]); this.drain(); });
    this.child.on('error', error => this.rejectAll(error));
    this.child.on('exit', code => this.rejectAll(new Error(`language server exited (${code ?? 'unknown'})`)));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) { this.buffer = this.buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      if (this.buffer.length < headerEnd + 4 + length) return;
      const body = this.buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(headerEnd + 4 + length);
      let message: Record<string, unknown>;
      try { message = JSON.parse(body) as Record<string, unknown>; } catch { continue; }
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
          else pending.resolve(message.result);
        }
      } else if (message.method === 'textDocument/publishDiagnostics') {
        const params = message.params as { uri?: unknown; diagnostics?: unknown } | undefined;
        if (typeof params?.uri === 'string' && Array.isArray(params.diagnostics)) {
          this.published.set(params.uri, params.diagnostics as RawDiagnostic[]);
        }
      }
    }
  }

  private send(message: Record<string, unknown>): void {
    const body = JSON.stringify({ jsonrpc: '2.0', ...message });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  async initialize(root: string, initialization?: Record<string, unknown>): Promise<void> {
    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      capabilities: { textDocument: { diagnostic: { dynamicRegistration: false } } },
      initializationOptions: initialization ?? {},
    });
    this.send({ method: 'initialized', params: {} });
  }

  async diagnostics(uri: string, languageId: string, text: string, version: number): Promise<readonly RawDiagnostic[]> {
    this.published.delete(uri);
    this.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId, version, text } } });
    let pulled: readonly RawDiagnostic[] = [];
    try {
      const result = await this.request('textDocument/diagnostic', { textDocument: { uri } }) as { items?: unknown } | null;
      if (Array.isArray(result?.items)) pulled = result.items as RawDiagnostic[];
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const out = pulled.length > 0 ? pulled : (this.published.get(uri) ?? []);
    this.send({ method: 'textDocument/didClose', params: { textDocument: { uri } } });
    return out;
  }

  close(): void {
    this.send({ method: 'shutdown', id: ++this.id, params: null });
    this.send({ method: 'exit', params: null });
    setTimeout(() => this.child.kill(), 100).unref();
  }
}

export class LspDiagnosticsService {
  constructor(private readonly logger: Logger) {}

  async compare(workspace: Workspace): Promise<LspDiagnosticsDelta> {
    const unavailable = (reason: string): LspDiagnosticsDelta => ({
      available: false, reason, baseRef: workspace.baseRef, changedFiles: [], baseCount: 0, headCount: 0,
      introduced: [], resolved: [], unchanged: 0, servers: [], truncated: false,
    });
    if (!workspace.worktreePath) return unavailable('workspace has no worktree');
    let configText: string;
    try { configText = await readFile(join(workspace.worktreePath, '.recoder', 'lsp.json'), 'utf8'); }
    catch { return unavailable('no .recoder/lsp.json configuration'); }
    const specs = parseConfig(configText.slice(0, MAX_CONFIG_BYTES));
    if (specs.length === 0) return unavailable('.recoder/lsp.json has no valid version 1 servers');
    let changedFiles: string[];
    try {
      const result = await execFileSafe('git', ['-C', workspace.worktreePath, 'diff', '--name-only', '--diff-filter=ACMRD', workspace.baseRef, '--']);
      changedFiles = result.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, MAX_FILES);
    } catch (err) {
      return unavailable(err instanceof Error ? `could not resolve changed files: ${err.message}` : 'could not resolve changed files');
    }

    const base: LspDiagnostic[] = [];
    const head: LspDiagnostic[] = [];
    const servers: Array<LspDiagnosticsDelta['servers'][number]> = [];
    let version = 0;
    for (const spec of specs) {
      const files = changedFiles.filter(path => spec.extensions.includes(extname(path)));
      if (files.length === 0) continue;
      let session: LspSession | null = null;
      try {
        session = new LspSession(spec, workspace.worktreePath);
        await session.initialize(workspace.worktreePath, spec.initialization);
        for (const path of files) {
          const absolute = join(workspace.worktreePath, path);
          const uri = pathToFileURL(absolute).href;
          const extension = extname(path).toLowerCase();
          const languageId = LANGUAGE_IDS[extension] ?? (extension.replace(/^\./, '') || 'plaintext');
          const baseText = await execFileSafe('git', ['-C', workspace.worktreePath, 'show', `${workspace.baseRef}:${path}`])
            .then(value => value.stdout).catch(() => null);
          const headText = await readFile(absolute, 'utf8').catch(() => null);
          if (baseText !== null) {
            const rows = await session.diagnostics(uri, languageId, baseText, ++version);
            base.push(...rows.flatMap(row => { const parsed = diagnostic(path, row); return parsed ? [parsed] : []; }));
          }
          if (headText !== null) {
            const rows = await session.diagnostics(uri, languageId, headText, ++version);
            head.push(...rows.flatMap(row => { const parsed = diagnostic(path, row); return parsed ? [parsed] : []; }));
          }
        }
        servers.push({ id: spec.id, status: 'ok' });
      } catch (err) {
        const detail = err instanceof Error ? err.message.slice(0, 200) : 'language server failed';
        servers.push({ id: spec.id, status: 'error', detail });
        this.logger.debug({ err, workspaceId: workspace.workspaceId, serverId: spec.id }, 'LSP diagnostic server unavailable');
      } finally {
        session?.close();
      }
    }
    if (servers.length === 0) return unavailable('no configured LSP server matches the changed files');
    if (servers.every(server => server.status === 'error')) {
      return { ...unavailable('all matching LSP servers failed'), changedFiles, servers };
    }
    const baseKeys = new Map(base.map(item => [key(item), item]));
    const headKeys = new Map(head.map(item => [key(item), item]));
    const introduced = [...headKeys].filter(([id]) => !baseKeys.has(id)).map(([, item]) => item);
    const resolved = [...baseKeys].filter(([id]) => !headKeys.has(id)).map(([, item]) => item);
    const unchanged = [...headKeys.keys()].filter(id => baseKeys.has(id)).length;
    const truncated = introduced.length > MAX_DIAGNOSTICS || resolved.length > MAX_DIAGNOSTICS || changedFiles.length >= MAX_FILES;
    return {
      available: true,
      baseRef: workspace.baseRef,
      changedFiles,
      baseCount: base.length,
      headCount: head.length,
      introduced: introduced.slice(0, MAX_DIAGNOSTICS),
      resolved: resolved.slice(0, MAX_DIAGNOSTICS),
      unchanged,
      servers,
      truncated,
    };
  }
}
