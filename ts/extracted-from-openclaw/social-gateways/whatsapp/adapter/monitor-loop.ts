// Owned by Recoder. The resilient SSE ingress loop for the WhatsApp
// ConnectorPort. Reconnect/backoff semantics (exponential backoff with jitter,
// attempt counter reset on each delivered event) mirror the real WhatsApp Web
// gateway's reconnect behavior — the same resilient-loop contract the Signal
// adapter uses — with the backoff math inlined locally so the loop has no
// dependency on un-extracted infra modules.

import { streamWhatsAppEvents, type WhatsAppSseEvent } from "./transport.js";

export interface BackoffPolicy {
  readonly initialMs: number;
  readonly maxMs: number;
  readonly factor: number;
  readonly jitter: number;
}

const DEFAULT_RECONNECT_POLICY: BackoffPolicy = {
  initialMs: 1_000,
  maxMs: 15_000,
  factor: 2,
  jitter: 0.2,
};

/** Exponential backoff with jitter for reconnect attempt `attempt` (>= 1). */
export function computeBackoff(policy: BackoffPolicy, attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(policy.maxMs, policy.initialMs * policy.factor ** exponent);
  const jitterSpan = base * policy.jitter;
  const jitter = jitterSpan > 0 ? (Math.random() * 2 - 1) * jitterSpan : 0;
  return Math.max(0, Math.round(base + jitter));
}

/** Sleep for `ms`, resolving early (without throwing) if `signal` aborts. */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface WhatsAppSseLoopParams {
  readonly baseUrl: string;
  readonly token?: string;
  readonly abortSignal?: AbortSignal;
  readonly onEvent: (event: WhatsAppSseEvent) => void;
  readonly onError?: (error: unknown) => void;
  readonly policy?: Partial<BackoffPolicy>;
}

/**
 * Run the WhatsApp SSE ingress loop until `abortSignal` fires, reconnecting with
 * backoff on stream end or error. Resets the attempt counter on each event so a
 * healthy stream never accrues backoff.
 */
export async function runWhatsAppSseLoop(params: WhatsAppSseLoopParams): Promise<void> {
  const { baseUrl, token, abortSignal, onEvent, onError } = params;
  const reconnectPolicy: BackoffPolicy = { ...DEFAULT_RECONNECT_POLICY, ...params.policy };
  let reconnectAttempts = 0;

  while (!abortSignal?.aborted) {
    try {
      await streamWhatsAppEvents({
        baseUrl,
        token,
        abortSignal,
        onEvent: (event) => {
          reconnectAttempts = 0;
          onEvent(event);
        },
      });
      if (abortSignal?.aborted) {
        return;
      }
      reconnectAttempts += 1;
      await sleepWithAbort(computeBackoff(reconnectPolicy, reconnectAttempts), abortSignal);
    } catch (err) {
      if (abortSignal?.aborted) {
        return;
      }
      onError?.(err);
      reconnectAttempts += 1;
      await sleepWithAbort(computeBackoff(reconnectPolicy, reconnectAttempts), abortSignal);
    }
  }
}
