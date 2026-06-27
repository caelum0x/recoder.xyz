// Owned by Recoder. Truthful Slack readiness probe for the connector adapter.
// Ported verbatim in behavior from the real extracted `slack/probe.ts`: it
// calls `auth.test` behind a timeout and reports readiness ONLY when Slack
// confirms `ok` — never faking health (interop §2 / the ConnectorPort
// "never report ready unless genuinely reachable" rule).

import type { SlackWebClient } from "./web-client.js";

export interface SlackProbeOutcome {
  readonly ok: boolean;
  readonly elapsedMs: number;
  /** Bot/user identity reported by Slack when reachable. */
  readonly identity?: string;
  /** Truthful error string when not ready. */
  readonly error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/** Probe a Slack account via the real `auth.test`, with a hard timeout. */
export async function probeSlack(
  client: SlackWebClient,
  timeoutMs = 2500,
): Promise<SlackProbeOutcome> {
  const start = Date.now();
  try {
    const result = await withTimeout(client.auth.test(), timeoutMs);
    if (!result.ok) {
      return {
        ok: false,
        elapsedMs: Date.now() - start,
        error: result.error ?? "unknown",
      };
    }
    const identity = [result.user, result.team].filter(Boolean).join("@") || result.user_id;
    return {
      ok: true,
      elapsedMs: Date.now() - start,
      identity: identity || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, elapsedMs: Date.now() - start, error: message };
  }
}
