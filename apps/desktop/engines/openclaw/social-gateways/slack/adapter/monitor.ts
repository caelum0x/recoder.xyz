// Owned by Recoder. Slack inbound monitor for the connector adapter. This wires
// the real `@slack/bolt` App exactly as the extracted `slack/monitor/provider.ts`
// + `slack/monitor/events/messages.ts` do: it constructs a Bolt App in Socket
// Mode (bot + app token) or HTTP Events mode (bot token + signing secret),
// subscribes to the real `message` and `app_mention` events, normalizes each
// payload to the foundation NormalizedInboundMessage, and invokes the caller's
// InboundHandler. Bolt is an OPTIONAL peer dependency of @recoder/connectors
// (kept out of the foundation install), so it is loaded lazily and a truthful
// error is thrown when it is absent.

import type {
  ConnectorMonitorHandle,
  InboundHandler,
} from "../../../src/connector/index.js";
import type { ResolvedSlackAuthProfile } from "./auth-profiles.js";
import { recoderSlackLogPrefix, RECODER_SLACK_WEBHOOK_PATH } from "./identity.js";
import { normalizeSlackEvent } from "./normalize.js";
import { loadOptionalSdk } from "./optional-sdk.js";

/** The subset of the real `@slack/bolt` App the monitor uses. */
interface SlackBoltApp {
  event(
    eventName: string,
    handler: (args: { event: unknown; body?: unknown }) => Promise<void> | void,
  ): void;
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  readonly client: {
    auth: {
      test(args?: { token?: string }): Promise<{ user_id?: string; team_id?: string }>;
    };
  };
}

type SlackBoltModule = {
  App?: new (options: Record<string, unknown>) => SlackBoltApp;
  HTTPReceiver?: new (options: Record<string, unknown>) => unknown;
  default?: SlackBoltModule;
};

async function loadSlackBolt(): Promise<{
  App: new (options: Record<string, unknown>) => SlackBoltApp;
  HTTPReceiver: new (options: Record<string, unknown>) => unknown;
}> {
  const mod = await loadOptionalSdk<SlackBoltModule>("@slack/bolt");
  // Bun allows named imports from CJS; Node ESM doesn't. Mirror the real
  // provider's default+fallback compatibility shim.
  const resolved = (mod.App ? mod : mod.default) ?? mod;
  const App = resolved.App;
  const HTTPReceiver = resolved.HTTPReceiver;
  if (typeof App !== "function" || typeof HTTPReceiver !== "function") {
    throw new Error(
      "@slack/bolt is not installed. Add it as a dependency to enable Recoder Slack monitoring " +
        "(declared as an optional peer dependency of @recoder/connectors).",
    );
  }
  return { App, HTTPReceiver };
}

function buildBoltOptions(params: {
  account: ResolvedSlackAuthProfile;
  HTTPReceiver: new (options: Record<string, unknown>) => unknown;
}): Record<string, unknown> {
  const { account } = params;
  if (account.mode === "http") {
    if (!account.signingSecret) {
      throw new Error(
        `Slack signing secret missing for account "${account.accountId}" (required for HTTP Events mode).`,
      );
    }
    const receiver = new params.HTTPReceiver({
      signingSecret: account.signingSecret,
      endpoints: account.webhookPath ?? RECODER_SLACK_WEBHOOK_PATH,
    });
    return { token: account.botToken, receiver };
  }
  if (!account.appToken) {
    throw new Error(
      `Slack app token missing for account "${account.accountId}" (required for Socket Mode).`,
    );
  }
  return {
    token: account.botToken,
    appToken: account.appToken,
    socketMode: true,
  };
}

/**
 * Start Slack ingress for one account. Resolves to a handle whose `stop()`
 * tears down the Bolt connection. Each inbound `message`/`app_mention` event is
 * normalized; non-actionable events (edits, deletes, the bot's own posts) are
 * dropped by `normalizeSlackEvent` and never reach `onMessage`.
 */
export async function monitorSlackAccount(params: {
  account: ResolvedSlackAuthProfile;
  onMessage: InboundHandler;
  log?: (message: string) => void;
  onError?: (error: unknown) => void;
}): Promise<ConnectorMonitorHandle> {
  const { account, onMessage } = params;
  if (!account.botToken) {
    throw new Error(
      `Slack bot token missing for account "${account.accountId}" (cannot start monitor).`,
    );
  }

  const { App, HTTPReceiver } = await loadSlackBolt();
  const app = new App(buildBoltOptions({ account, HTTPReceiver }));

  // Resolve the bot user id so normalize() can detect @-mentions and skip the
  // bot's own posts. auth.test failing here is non-fatal — the same tolerance
  // the real provider applies (it falls back to regex mention detection).
  let botUserId: string | undefined;
  try {
    const auth = await app.client.auth.test({ token: account.botToken });
    botUserId = auth.user_id || undefined;
  } catch (err) {
    params.log?.(
      `${recoderSlackLogPrefix(account.accountId)} auth.test failed at startup: ${String(err)}`,
    );
  }

  const dispatch = async (rawEvent: unknown): Promise<void> => {
    try {
      const normalized = normalizeSlackEvent(rawEvent, account.accountId, { botUserId });
      if (!normalized) {
        return;
      }
      await onMessage(normalized);
    } catch (err) {
      params.onError?.(err);
      params.log?.(
        `${recoderSlackLogPrefix(account.accountId)} inbound handler failed: ${String(err)}`,
      );
    }
  };

  app.event("message", async ({ event }) => {
    await dispatch(event);
  });
  app.event("app_mention", async ({ event }) => {
    await dispatch(event);
  });

  if (account.mode === "socket") {
    await app.start();
    params.log?.(`${recoderSlackLogPrefix(account.accountId)} socket mode connected`);
  } else {
    params.log?.(
      `${recoderSlackLogPrefix(account.accountId)} http events mode ready at ${
        account.webhookPath ?? RECODER_SLACK_WEBHOOK_PATH
      }`,
    );
  }

  let stopped = false;
  return {
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;
      await app.stop().catch(() => undefined);
    },
  };
}
