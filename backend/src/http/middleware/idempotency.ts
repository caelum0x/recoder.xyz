/**
 * `Idempotency-Key` replay guard (BE-10.3) — makes duplicate-spawning mutations
 * (conductor `POST /workspaces`, agent-os `POST /runs`) safe to retry: a client
 * that resends the SAME `Idempotency-Key` after a network failure gets the
 * ORIGINAL success response replayed instead of spawning a second worktree/run.
 *
 * Posture:
 *  - opt-in per route, mounted AFTER `authenticate`/`authenticateMutating` — the
 *    stored entry is keyed to the resolved principal, so one caller can NEVER
 *    replay another caller's response (the security invariant);
 *  - no header / no principal ⇒ byte-identical passthrough (never a shared or
 *    unauthenticated replay);
 *  - only 2xx-3xx responses are persisted (with a TTL) — a failed create stays
 *    retryable for real;
 *  - degrade-open: a KV fault is logged and the request proceeds (availability
 *    over replay protection — the KV layer itself is degrade-safe);
 *  - concurrent IN-FLIGHT duplicates are out of scope for this slice: the guard
 *    replays a single STORED result, it does not serialize racing requests.
 */
import type { Request, RequestHandler, Response } from 'express';
import type { KvStore } from '../../domains/persistence/ports/kv-store.port.js';
import type { Logger } from '../../shared/logger.js';
import { ErrorCode, createError, sendError } from '../../shared/errors.js';

/** KV namespace for stored idempotent responses. */
const NAMESPACE = 'idempotency';
/** Default retention for a stored success (24h — ample for client retry windows). */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/** Bound the caller-supplied key so it can never bloat the KV key space. */
const MAX_KEY_LENGTH = 200;
/** Response header marking a replayed (not re-executed) response. */
const REPLAY_HEADER = 'idempotency-replayed';

export interface IdempotencyDeps {
  /** The durable (degrade-safe) KV the stored responses live in. */
  readonly kv: KvStore;
  /** Retention for a stored success. Defaults to 24 hours. */
  readonly ttlMs?: number;
  readonly logger?: Logger;
}

/** The persisted shape: enough to replay the original success verbatim. */
interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Extract a single header value; `null` when absent, `undefined` when malformed. */
function headerValue(req: Request): string | null | undefined {
  const raw = req.headers['idempotency-key'];
  if (raw === undefined) return null;
  const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY_LENGTH) {
    return undefined;
  }
  return value;
}

/**
 * Build the replay-guard middleware. Mount it AFTER the auth middleware on
 * exactly the duplicate-spawning POST edges; absent header/principal it is a
 * pure passthrough.
 */
export function createIdempotencyMiddleware(deps: IdempotencyDeps): RequestHandler {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  return async (req, res, next) => {
    const key = headerValue(req);
    if (key === null) return next();
    if (key === undefined) {
      sendError(
        res,
        createError(
          ErrorCode.VALIDATION_ERROR,
          `\`Idempotency-Key\` must be a single non-empty string of at most ${MAX_KEY_LENGTH} characters.`,
        ),
      );
      return;
    }

    // No authenticated principal ⇒ pass through untouched. The middleware must sit
    // AFTER authenticate; a principal-less (or anonymous) request never reads or
    // writes the store, so an unauthenticated caller can neither poison nor replay.
    const principal = req.principal;
    if (!principal || principal.isAnonymous) return next();

    const kvKey = `idem:${principal.userId}:${req.method}:${req.baseUrl}${req.path}:${key}`;

    let stored: StoredResponse | null = null;
    try {
      stored = await deps.kv.getJson<StoredResponse>(NAMESPACE, kvKey);
    } catch (err) {
      // Degrade-open: a KV read fault must not block the mutation; the retry
      // simply loses replay protection for this request (logged truthfully).
      deps.logger?.warn({ err: message(err), kvKey }, 'idempotency read failed (proceeding without replay)');
    }
    if (stored && !res.headersSent) {
      res.setHeader(REPLAY_HEADER, 'true');
      res.status(stored.status).json(stored.body);
      return;
    }

    // Miss: capture the outgoing response (the canonical `sendSuccess`/`sendError`
    // path funnels through `res.status(...).json(...)`) and persist a success.
    const json = res.json.bind(res) as Response['json'];
    res.json = ((body: unknown) => {
      const status = res.statusCode ?? 200;
      const result = json(body);
      if (status >= 200 && status < 400) {
        void deps.kv
          .setJson<StoredResponse>(NAMESPACE, kvKey, { status, body }, { ttlMs })
          .catch((err: unknown) => {
            deps.logger?.warn({ err: message(err), kvKey }, 'idempotency store failed (response already sent)');
          });
      }
      return result;
    }) as Response['json'];
    next();
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
