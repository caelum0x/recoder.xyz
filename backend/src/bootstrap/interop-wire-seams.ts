/**
 * Interop-wire composition-root seams — the small, PURE pieces of the bootstrap →
 * interop-wire wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts}):
 *
 *   - {@link createLocalRunDispatch} — the `LocalRunDispatchPort` over the Phase-5
 *     conductor `createWorkspace` seam. An admitted A2A `message/send` to a
 *     `kind:'runtime'` target launches a real governed run. Degrade-truthful: a
 *     refused/faulted launch returns `ok:false` with the conductor's reason — never
 *     a fabricated run id.
 *   - {@link createRemoteEnvelopeSender} — the `RemoteEnvelopeSender` that delivers
 *     an already-sealed (HMAC-signed when configured) A2A envelope to a remote peer's
 *     advertised `card.url`. Degrade-truthful: no http(s) url ⇒ `ok:false`; a non-2xx
 *     or a network/timeout fault ⇒ `ok:false` with the real reason — never a faked send.
 *
 * Both are constructed at the composition root and injected into
 * `createInteropWireComposer({ localRun, remoteSender })`. Neither reads `process.env`
 * or owns state; the composer decides when they are present.
 */
import type { Principal } from '../domains/identity/types.js';
import type {
  LocalRunDispatchPort,
  RemoteEnvelopeSender,
} from '../domains/interop-wire/dispatch/multi-dispatch.js';
import type { AgentRow, EgressEnvelope } from '../domains/interop-wire/types.js';

/**
 * The narrow conductor surface the local-run seam consumes (structural — the real
 * `ConductorModuleSurface.createWorkspace` fits without a cross-domain import here).
 */
export interface ConductorCreateWorkspacePort {
  createWorkspace(
    input: {
      readonly spaceId: string;
      readonly projectId: string;
      readonly taskId: string;
      readonly repoPath: string;
      readonly runtimeId: string;
      readonly prompt?: string;
    },
    principal: Principal,
  ): Promise<{
    readonly ok: boolean;
    readonly reason?: string;
    readonly value?: { readonly workspaceId: string; readonly runId?: string } | null;
  }>;
}

export interface LocalRunDispatchOptions {
  readonly conductor: ConductorCreateWorkspacePort;
  /** The worktree parent the launched run runs in (the sanctioned repo root). */
  readonly repoRoot: string;
  /** The space a dispatched A2A run is bucketed under (defaults to the shared space). */
  readonly spaceId?: string;
  /** Injectable clock for a deterministic synthetic task id (tests). */
  readonly now?: () => number;
}

/**
 * Build the interop-wire → conductor local-run dispatch seam. Maps a narrow A2A
 * launch (`runtimeId`/`userId`/`prompt`/`correlationId`) onto the REAL governed
 * `createWorkspace` path (gate → quota → substrate). The dispatching subject
 * becomes an internal principal (the A2A ingress already admitted it).
 */
export function createLocalRunDispatch(opts: LocalRunDispatchOptions): LocalRunDispatchPort {
  const { conductor, repoRoot } = opts;
  const spaceId = opts.spaceId ?? 'space-default';
  const now = opts.now ?? Date.now;
  return {
    async launch(input) {
      const principal: Principal = {
        userId: input.userId,
        scopes: ['internal', 'write'],
        kind: 'internal',
        isAnonymous: false,
        raw: null,
      };
      // Reuse the correlation id as the task id so RunEvents anchor to the same
      // A2A conversation; else synthesize a truthful, unique id.
      const taskId = input.correlationId ?? `a2a-${input.runtimeId}-${now().toString(36)}`;
      const res = await conductor.createWorkspace(
        {
          spaceId,
          projectId: `a2a-${input.runtimeId}`,
          taskId,
          repoPath: repoRoot,
          runtimeId: input.runtimeId,
          prompt: input.prompt,
        },
        principal,
      );
      if (!res.ok || !res.value) {
        return { ok: false, error: res.reason ?? 'conductor refused workspace.create' };
      }
      return { ok: true, ...(res.value.runId ? { runId: res.value.runId } : {}) };
    },
  };
}

/** The narrow fetch surface the remote sender needs (the global `fetch` fits). */
export type EnvelopeFetch = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number }>;

export interface RemoteEnvelopeSenderOptions {
  readonly fetch: EnvelopeFetch;
  /** Abort the POST after this many ms (a hung peer must not wedge dispatch). */
  readonly timeoutMs?: number;
}

const HTTP_URL = /^https?:\/\//i;

/**
 * Build the outbound A2A peer sender: POST the ALREADY-sealed envelope to the
 * peer's advertised `card.url`. Signing happened upstream (`egressEnvelope`); this
 * seam only delivers and reports the real HTTP/network outcome. Never faked.
 */
export function createRemoteEnvelopeSender(
  opts: RemoteEnvelopeSenderOptions,
): RemoteEnvelopeSender {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return {
    async send(target: AgentRow, sealed: EgressEnvelope) {
      const url = target.card.url;
      if (!url || !HTTP_URL.test(url)) {
        return {
          ok: false,
          error: `remote peer ${target.id} has no http(s) card.url — sealed envelope not delivered`,
        };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await opts.fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(sealed.signature ? { 'x-a2a-signature': sealed.signature } : {}),
            ...(sealed.keyId ? { 'x-a2a-key-id': sealed.keyId } : {}),
          },
          body: JSON.stringify(sealed.envelope),
          signal: controller.signal,
        });
        if (!resp.ok) {
          return { ok: false, error: `remote peer ${target.id} responded ${resp.status}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'remote send failed' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
