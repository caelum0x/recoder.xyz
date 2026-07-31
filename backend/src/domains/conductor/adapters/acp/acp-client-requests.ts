/**
 * acp-client-requests — the CLIENT side of ACP: how THIS conductor answers the
 * requests an ACP agent initiates mid-turn. The driver advertises
 * `fs: { readTextFile, writeTextFile }` in `initialize`, so the agent may delegate
 * file reads/writes to us; and it asks `session/request_permission` before any
 * sensitive tool call. This module is the single, pure, testable handler for all
 * three, routed by method:
 *
 *  - `session/request_permission` → a permission DECISION (allow/deny) is resolved
 *    (default policy or an injected gate bridge), then translated into the ACP
 *    outcome by selecting one of the agent-offered options (`allow_once` /
 *    `reject_once`), never a fabricated optionId.
 *  - `fs/read_text_file` / `fs/write_text_file` → served against the workspace's
 *    OWN worktree only. Every path is CONTAINED: a request that resolves outside
 *    the worktree (absolute escape or `../` traversal) is refused — the isolation
 *    boundary is enforced here, not trusted from the agent.
 *
 * Default permission policy is thesis-aligned + safe: the agent works FREELY
 * inside its disposable, isolated worktree (read/edit/move/delete/search — all
 * reviewed at merge), but operations that can ESCAPE isolation — `execute` (shell)
 * and `fetch` (network) — plus any unknown kind are DENIED by default until an
 * approval-gate bridge is injected. Every seam (resolvePermission / readFile /
 * writeFile) is injectable so the whole handler is unit-tested without a real
 * agent or filesystem.
 */
import path from 'node:path';
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  realpath as fsRealpath,
} from 'node:fs/promises';
import { AcpErrorCode, type AcpRequest } from './acp-codec.js';

/** ACP tool kinds (agentclientprotocol.com schema `ToolKind`). */
export type AcpToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other';

export type AcpPermissionDecision = 'allow' | 'deny';

/** One permission choice the agent offers (schema `PermissionOption`). */
export interface AcpPermissionOption {
  readonly kind:
    'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  readonly name: string;
  readonly optionId: string;
}

/** The tool call requiring permission (schema `ToolCallUpdate`, narrowed). */
export interface AcpToolCall {
  readonly kind?: AcpToolKind | null;
  readonly title?: string | null;
  readonly locations?: ReadonlyArray<{ readonly path: string }> | null;
  readonly toolCallId?: string;
}

/** Context handed to a permission resolver (adds the workspace to the ACP request). */
export interface AcpPermissionContext {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly toolCall: AcpToolCall;
  readonly options: readonly AcpPermissionOption[];
}

/** The ACP permission outcome (schema `RequestPermissionOutcome`). */
export type AcpPermissionOutcome =
  { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string };

/**
 * Tool kinds the agent may perform freely INSIDE its isolated worktree — the
 * work product is reviewed as a diff before merge, so keystroke-level gating adds
 * friction without safety. `execute` (shell) and `fetch` (network) can escape the
 * isolation, and `other` is unknown, so they are NOT in this set (default deny).
 */
const WORKTREE_SAFE_KINDS: ReadonlySet<AcpToolKind> = new Set<AcpToolKind>([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'think',
  'switch_mode',
]);

/**
 * The default, gate-free permission policy: allow worktree-safe kinds, deny
 * escape-capable/unknown kinds. A composer injects a real bridge to override this
 * with human-in-the-loop approval for the gated kinds.
 */
export function defaultAcpPermissionPolicy(
  ctx: AcpPermissionContext
): AcpPermissionDecision {
  const kind = ctx.toolCall.kind ?? 'other';
  return WORKTREE_SAFE_KINDS.has(kind) ? 'allow' : 'deny';
}

/**
 * Translate an allow/deny decision into a concrete ACP outcome by SELECTING one
 * of the options the agent actually offered — `allow_*` for allow, `reject_*` for
 * deny. When the agent offered no matching option, fall back to `cancelled` (the
 * safe, always-valid outcome) rather than inventing an optionId.
 */
export function toPermissionOutcome(
  decision: AcpPermissionDecision,
  options: readonly AcpPermissionOption[]
): AcpPermissionOutcome {
  const preferred: AcpPermissionOption['kind'][] =
    decision === 'allow'
      ? ['allow_once', 'allow_always']
      : ['reject_once', 'reject_always'];
  for (const kind of preferred) {
    const opt = options.find(o => o.kind === kind);
    if (opt) return { outcome: 'selected', optionId: opt.optionId };
  }
  return { outcome: 'cancelled' };
}

/** Narrow a raw `session/request_permission` params object into typed context. */
export function parsePermissionRequest(
  workspaceId: string,
  params: unknown
): AcpPermissionContext | null {
  if (params == null || typeof params !== 'object') return null;
  const p = params as Record<string, unknown>;
  const rawOptions = Array.isArray(p.options) ? p.options : [];
  const options: AcpPermissionOption[] = rawOptions
    .filter(
      (o): o is Record<string, unknown> => o != null && typeof o === 'object'
    )
    .filter(o => typeof o.optionId === 'string' && typeof o.kind === 'string')
    .map(o => ({
      kind: o.kind as AcpPermissionOption['kind'],
      name: String(o.name ?? ''),
      optionId: String(o.optionId),
    }));
  const toolCall = (
    p.toolCall != null && typeof p.toolCall === 'object' ? p.toolCall : {}
  ) as AcpToolCall;
  return {
    workspaceId,
    sessionId: String(p.sessionId ?? ''),
    toolCall,
    options,
  };
}

/** Return the window `[line, line+limit)` of a file's text (1-based line, ACP semantics). */
export function applyLineWindow(
  content: string,
  line?: number | null,
  limit?: number | null
): string {
  if ((line == null || line <= 0) && limit == null) return content;
  const lines = content.split('\n');
  const start = line != null && line > 0 ? line - 1 : 0;
  const end = limit != null && limit >= 0 ? start + limit : lines.length;
  return lines.slice(start, end).join('\n');
}

export interface AcpClientRequestHandlerDeps {
  readonly workspaceId: string;
  /** The workspace's worktree — fs ops are CONTAINED to this directory tree. */
  readonly workspaceRoot: string;
  /** Resolve a permission request to allow/deny (default: worktree-isolation policy). */
  readonly resolvePermission?: (
    ctx: AcpPermissionContext
  ) => Promise<AcpPermissionDecision> | AcpPermissionDecision;
  /** Read a file (default: node fs, utf8); injected in tests. */
  readonly readFile?: (absPath: string) => Promise<string>;
  /** Write a file (default: node fs, utf8); injected in tests. */
  readonly writeFile?: (absPath: string, content: string) => Promise<void>;
  /**
   * Canonicalize a path by resolving symlinks (default: node fs.realpath);
   * injected in tests. Used to re-check containment against the REAL
   * filesystem so a committed symlink can't escape the worktree.
   */
  readonly realpath?: (absPath: string) => Promise<string>;
  readonly warn?: (message: string, meta?: unknown) => void;
}

/** A JSON-RPC-style error the client turns into an error response to the agent. */
class AcpHandlerError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
    this.name = 'AcpHandlerError';
  }
}

/**
 * Build the agent→client request handler bound to one workspace. The returned fn
 * is what the driver wires as `onRequest`; its return value becomes the ACP
 * response result, and a throw becomes a truthful JSON-RPC error to the agent.
 */
export function createAcpClientRequestHandler(
  deps: AcpClientRequestHandlerDeps
): (req: AcpRequest) => Promise<unknown> {
  const resolvePermission =
    deps.resolvePermission ?? defaultAcpPermissionPolicy;
  const readFile = deps.readFile ?? ((p: string) => fsReadFile(p, 'utf8'));
  const writeFile =
    deps.writeFile ?? ((p: string, c: string) => fsWriteFile(p, c, 'utf8'));
  const realpath = deps.realpath ?? ((p: string) => fsRealpath(p));
  const root = path.resolve(deps.workspaceRoot);

  /** True if an already-absolute path lies at or under the worktree root. */
  const isWithin = (abs: string): boolean =>
    abs === root || abs.startsWith(root + path.sep);

  /** Lexical containment: `../` traversal + absolute escape, or null if it escapes. */
  const contain = (requested: string): string | null => {
    if (typeof requested !== 'string' || requested === '') return null;
    const abs = path.resolve(root, requested);
    return isWithin(abs) ? abs : null;
  };

  /**
   * Canonicalize the nearest EXISTING path on the way to `abs`, resolving
   * symlinks. If `abs` exists it is realpath'd directly (catching a symlinked
   * leaf); if it does not, we walk up to the closest existing ancestor and
   * realpath THAT (catching a symlinked parent that redirects a new file).
   * A non-ENOENT failure is propagated so the caller can DENY — never fall open.
   */
  const realNearestExisting = async (abs: string): Promise<string> => {
    let current = abs;
    for (;;) {
      try {
        return await realpath(current);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
        const parent = path.dirname(current);
        if (parent === current) throw err; // reached fs root, nothing exists
        current = parent;
      }
    }
  };

  /**
   * Full containment: the cheap lexical gate FIRST, then a realpath re-check of
   * the real filesystem target (or its nearest existing ancestor for a new
   * file). `path.resolve` normalizes `..` but does NOT follow symlinks, so a
   * committed symlink (git mode 120000) could otherwise pass the lexical check
   * and let `fsReadFile`/`fsWriteFile` follow it outside the worktree. Returns
   * the absolute path to operate on, or null if it escapes / cannot be verified.
   */
  const containReal = async (requested: string): Promise<string | null> => {
    const abs = contain(requested);
    if (abs === null) return null;
    let real: string;
    try {
      real = await realNearestExisting(abs);
    } catch {
      return null; // degrade-truthful: any realpath failure DENIES
    }
    return isWithin(real) ? abs : null;
  };

  return async (req: AcpRequest): Promise<unknown> => {
    switch (req.method) {
      case 'session/request_permission': {
        const ctx = parsePermissionRequest(deps.workspaceId, req.params);
        if (!ctx) {
          deps.warn?.('acp permission request malformed — denying', req.params);
          return { outcome: { outcome: 'cancelled' } };
        }
        let decision: AcpPermissionDecision = 'deny';
        try {
          decision = await resolvePermission(ctx);
        } catch (err) {
          deps.warn?.('acp permission resolver threw — denying', err);
          decision = 'deny';
        }
        return { outcome: toPermissionOutcome(decision, ctx.options) };
      }

      case 'fs/read_text_file': {
        const p = (req.params ?? {}) as Record<string, unknown>;
        const abs = await containReal(String(p.path ?? ''));
        if (!abs) {
          deps.warn?.('acp fs read outside worktree — refused', p.path);
          throw new AcpHandlerError(
            AcpErrorCode.InvalidParams,
            'path escapes the workspace worktree'
          );
        }
        const raw = await readFile(abs);
        return {
          content: applyLineWindow(
            raw,
            p.line as number | null,
            p.limit as number | null
          ),
        };
      }

      case 'fs/write_text_file': {
        const p = (req.params ?? {}) as Record<string, unknown>;
        const abs = await containReal(String(p.path ?? ''));
        if (!abs) {
          deps.warn?.('acp fs write outside worktree — refused', p.path);
          throw new AcpHandlerError(
            AcpErrorCode.InvalidParams,
            'path escapes the workspace worktree'
          );
        }
        await writeFile(abs, String(p.content ?? ''));
        return {}; // WriteTextFileResponse is empty
      }

      default:
        deps.warn?.(`acp unsupported client request: ${req.method}`);
        throw new AcpHandlerError(
          AcpErrorCode.MethodNotFound,
          `unsupported client method: ${req.method}`
        );
    }
  };
}
