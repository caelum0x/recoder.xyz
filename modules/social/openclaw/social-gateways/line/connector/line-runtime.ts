// Owned by Recoder. Runtime loader for the real `@line/bot-sdk` messaging client.
//
// The LINE ConnectorPort adapter makes REAL LINE Messaging API calls (push /
// reply / getBotInfo / getProfile). The SDK is an OPTIONAL peer dependency of
// @recoder/connectors and is not installed by the foundation build, so the
// adapter loads it lazily here and surfaces a truthful, actionable error if it
// is absent — never a silent fake. This mirrors the foundation's "fail fast,
// surface truthful health, never fake success" rule.

import { createRequire } from "node:module";
import type {
  LineMessagingApiClient,
  LineMessagingApiClientConfig,
  LineMessagingApiNamespace,
} from "./line-sdk-types.js";

const require = createRequire(import.meta.url);

interface LineBotSdkModule {
  messagingApi: LineMessagingApiNamespace;
}

let cachedModule: LineBotSdkModule | undefined;

/**
 * Load the real `@line/bot-sdk` `messagingApi` namespace. Cached after first
 * successful load. Throws a truthful error (never returns a stub) when the
 * optional peer dependency is missing.
 */
export function loadLineMessagingApi(): LineMessagingApiNamespace {
  if (cachedModule) {
    return cachedModule.messagingApi;
  }
  let mod: LineBotSdkModule;
  try {
    mod = require("@line/bot-sdk") as LineBotSdkModule;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `LINE connector requires the optional peer dependency "@line/bot-sdk". ` +
        `Install it in the runtime that hosts the LINE adapter. Underlying error: ${reason}`,
    );
  }
  if (!mod?.messagingApi?.MessagingApiClient) {
    throw new Error(
      `LINE connector loaded "@line/bot-sdk" but it did not expose messagingApi.MessagingApiClient. ` +
        `Expected @line/bot-sdk v11+.`,
    );
  }
  cachedModule = mod;
  return mod.messagingApi;
}

/** Construct a real LINE Messaging API client for the given channel token. */
export function createLineMessagingClient(
  config: LineMessagingApiClientConfig,
): LineMessagingApiClient {
  const token = config.channelAccessToken?.trim();
  if (!token) {
    throw new Error("LINE connector: channelAccessToken is required to create a messaging client");
  }
  const messagingApi = loadLineMessagingApi();
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
}
