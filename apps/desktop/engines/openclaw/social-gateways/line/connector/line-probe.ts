// Owned by Recoder. Truthful readiness probe for the LINE ConnectorPort adapter.
// Calls the REAL `@line/bot-sdk` `getBotInfo` endpoint (verbatim semantics from
// ../probe.ts) with a timeout. Reports `ready: false` with the real error string
// whenever the token is missing, the call fails, or it times out — never fakes
// health (foundation rule: "report truthful health, never imply success").

import { createLineMessagingClient } from "./line-runtime.js";
import type { LineMessagingApiClient } from "./line-sdk-types.js";

export interface LineProbeOutcome {
  ok: boolean;
  identity?: string;
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * Probe a LINE account by fetching the bot's own profile. Returns the bot's
 * display name + basic id as the channel-reported identity on success.
 */
export async function probeLineAccount(
  channelAccessToken: string,
  options: { timeoutMs?: number; client?: LineMessagingApiClient } = {},
): Promise<LineProbeOutcome> {
  const token = channelAccessToken?.trim();
  if (!token) {
    return { ok: false, error: "Channel access token not configured" };
  }

  let client: LineMessagingApiClient;
  try {
    client = options.client ?? createLineMessagingClient({ channelAccessToken: token });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const info = await withTimeout(client.getBotInfo(), options.timeoutMs ?? 5000);
    const identity = info.basicId
      ? `${info.displayName} (${info.basicId})`
      : (info.displayName ?? info.userId);
    return { ok: true, identity };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
