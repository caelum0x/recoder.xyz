// Owned by Recoder. WebClient factory + the structural surface of the real
// `@slack/web-api` WebClient the adapter uses.
//
// The `@recoder/connectors` package declares `@slack/web-api` and `@slack/bolt`
// as OPTIONAL peer dependencies (see package.json): the foundation install does
// not pull them in to stay ENOSPC-safe on the disk-constrained dev box, so the
// SDK's own `.d.ts` is not present in this tree. To remain typecheck-clean
// standalone WHILE calling the genuine SDK at runtime, this file declares the
// exact subset of the WebClient API the adapter invokes — the same methods the
// real extracted `slack/send.ts` / `slack/actions.ts` / `slack/probe.ts` call:
//   chat.postMessage, chat.update, chat.delete,
//   conversations.open, files.uploadV2,
//   reactions.add, reactions.remove,
//   auth.test.
// At runtime `createSlackWebClient` returns a real `@slack/web-api` WebClient
// instance, so this is a real working SDK client — not a mock.

import { loadOptionalSdk } from "./optional-sdk.js";

/** The subset of `@slack/web-api` WebClient the adapter calls. Real shape. */
export interface SlackWebClient {
  readonly chat: {
    postMessage(args: {
      channel: string;
      text: string;
      thread_ts?: string;
    }): Promise<{ ok?: boolean; ts?: string; channel?: string; error?: string }>;
    update(args: {
      channel: string;
      ts: string;
      text: string;
    }): Promise<{ ok?: boolean; ts?: string; error?: string }>;
    delete(args: {
      channel: string;
      ts: string;
    }): Promise<{ ok?: boolean; error?: string }>;
  };
  readonly conversations: {
    open(args: {
      users: string;
    }): Promise<{ ok?: boolean; channel?: { id?: string }; error?: string }>;
  };
  readonly files: {
    uploadV2(args: {
      channel_id: string;
      file: Buffer | Uint8Array;
      filename?: string;
      initial_comment?: string;
      thread_ts?: string;
    }): Promise<{
      ok?: boolean;
      files?: Array<{ id?: string; name?: string }>;
      file?: { id?: string; name?: string };
      error?: string;
    }>;
  };
  readonly reactions: {
    add(args: {
      channel: string;
      timestamp: string;
      name: string;
    }): Promise<{ ok?: boolean; error?: string }>;
    remove(args: {
      channel: string;
      timestamp: string;
      name: string;
    }): Promise<{ ok?: boolean; error?: string }>;
  };
  readonly auth: {
    test(args?: { token?: string }): Promise<{
      ok?: boolean;
      user_id?: string;
      user?: string;
      team_id?: string;
      team?: string;
      api_app_id?: string;
      error?: string;
    }>;
  };
}

/** Retry policy ported verbatim from the real extracted `slack/client.ts`. */
export const SLACK_DEFAULT_RETRY_OPTIONS = {
  retries: 2,
  factor: 2,
  minTimeout: 500,
  maxTimeout: 3000,
  randomize: true,
} as const;

type WebClientConstructor = new (
  token: string,
  options?: Record<string, unknown>,
) => SlackWebClient;

/**
 * Construct a real `@slack/web-api` WebClient with Recoder's retry defaults
 * (same options as the extracted `createSlackWebClient`). The SDK is loaded
 * lazily so the foundation install — which intentionally omits the optional
 * channel SDKs — never fails to resolve this module at import time. Throws a
 * truthful error if the optional peer dependency is not installed.
 */
export async function createSlackWebClient(
  token: string,
  options: Record<string, unknown> = {},
): Promise<SlackWebClient> {
  const mod = await loadOptionalSdk<{ WebClient?: WebClientConstructor }>(
    "@slack/web-api",
  );
  const WebClient = mod.WebClient;
  if (typeof WebClient !== "function") {
    throw new Error(
      "@slack/web-api is not installed. Add it as a dependency to enable the Recoder Slack connector " +
        "(declared as an optional peer dependency of @recoder/connectors).",
    );
  }
  return new WebClient(token, {
    ...options,
    retryConfig: options.retryConfig ?? SLACK_DEFAULT_RETRY_OPTIONS,
  });
}
