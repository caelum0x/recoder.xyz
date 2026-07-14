// Owned by Recoder. Real unit tests for the Feishu ConnectorPort adapter. These
// drive the pure normalize/chunk/account logic and exercise probe/send/react
// against a fetch double (no network, no SDK). The monitor long-connection is
// driven through an injected SDK loader so the full flow runs without the real
// `@larksuiteoapi/node-sdk` package being installed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeishuConnector } from "./connector.js";
import {
  FeishuAccountRegistry,
  normalizeAccountId,
  DEFAULT_FEISHU_ACCOUNT_ID,
} from "./auth-store.js";
import { chunkFeishuText } from "./chunk.js";
import { normalizeFeishuEvent } from "./normalize.js";
import { FeishuRestClient } from "./rest-client.js";
import { setLarkSdkLoader, type LarkSdkModule } from "./lark-ws-port.js";

function buildRegistry(): FeishuAccountRegistry {
  const registry = new FeishuAccountRegistry();
  registry.register({
    accountId: DEFAULT_FEISHU_ACCOUNT_ID,
    credentials: { appId: "cli_test_app", appSecret: "secret_test" },
    name: "Recoder Bot",
    enabled: true,
  });
  return registry;
}

/** A fetch double that returns queued JSON responses in order. */
function fetchReturning(...payloads: unknown[]): typeof fetch {
  const queue = [...payloads];
  return vi.fn(async () => {
    const body = queue.shift() ?? {};
    return {
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  FeishuRestClient.resetTokenCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setLarkSdkLoader(undefined);
  vi.restoreAllMocks();
});

describe("normalizeFeishuEvent", () => {
  it("normalizes a text DM into a NormalizedInboundMessage", () => {
    const event = {
      message: {
        chat_id: "oc_chat_1",
        chat_type: "p2p",
        message_type: "text",
        message_id: "om_1",
        create_time: "1700000000000",
        content: JSON.stringify({ text: "hello recoder" }),
      },
      sender: { sender_id: { open_id: "ou_user_1", user_id: "u1" } },
    };
    const result = normalizeFeishuEvent(event, "default");
    expect(result).toBeDefined();
    expect(result?.channel).toBe("feishu");
    expect(result?.accountId).toBe("default");
    expect(result?.chatType).toBe("direct");
    expect(result?.conversationId).toBe("oc_chat_1");
    expect(result?.messageId).toBe("om_1");
    expect(result?.text).toBe("hello recoder");
    expect(result?.wasMentioned).toBe(false);
    expect(result?.sender.SenderId).toBe("ou_user_1");
    expect(result?.timestamp).toBe(1700000000000);
  });

  it("strips @mention keys and marks group messages as mentioned", () => {
    const event = {
      message: {
        chat_id: "oc_group_1",
        chat_type: "group",
        message_type: "text",
        message_id: "om_2",
        create_time: 1700000001000,
        content: JSON.stringify({ text: "@_user_1 do the thing" }),
        mentions: [{ key: "@_user_1", name: "Bot" }],
      },
      sender: { sender_id: { open_id: "ou_user_2" } },
    };
    const result = normalizeFeishuEvent(event, "default");
    expect(result?.chatType).toBe("group");
    expect(result?.wasMentioned).toBe(true);
    expect(result?.text).toBe("do the thing");
  });

  it("returns undefined for unsupported message types", () => {
    const event = {
      message: {
        chat_id: "oc_chat_1",
        chat_type: "p2p",
        message_type: "system",
        message_id: "om_3",
        create_time: 1,
      },
    };
    expect(normalizeFeishuEvent(event, "default")).toBeUndefined();
  });

  it("returns a single attachment for image messages", () => {
    const event = {
      message: {
        chat_id: "oc_chat_1",
        chat_type: "p2p",
        message_type: "image",
        message_id: "om_4",
        create_time: 1,
        image_key: "img_key_1",
      },
      sender: { sender_id: { open_id: "ou_user_1" } },
    };
    const result = normalizeFeishuEvent(event, "default");
    expect(result?.attachments).toHaveLength(1);
    expect(result?.attachments[0]?.remoteId).toBe("img_key_1");
  });

  it("returns undefined for non-object events", () => {
    expect(normalizeFeishuEvent(null, "default")).toBeUndefined();
    expect(normalizeFeishuEvent("nope", "default")).toBeUndefined();
  });
});

describe("chunkFeishuText", () => {
  it("returns a single chunk under the limit", () => {
    expect(chunkFeishuText("short", 2000)).toEqual(["short"]);
  });

  it("splits on newline boundaries", () => {
    const text = `${"a".repeat(6)}\n${"b".repeat(6)}`;
    expect(chunkFeishuText(text, 8)).toEqual(["aaaaaa", "bbbbbb"]);
  });

  it("hard-splits an over-long single line", () => {
    const chunks = chunkFeishuText("x".repeat(25), 10);
    expect(chunks).toEqual(["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx"]);
  });

  it("returns empty array for empty input", () => {
    expect(chunkFeishuText("", 2000)).toEqual([]);
  });
});

describe("FeishuAccountRegistry", () => {
  it("normalizes empty account ids to the default", () => {
    expect(normalizeAccountId(undefined)).toBe(DEFAULT_FEISHU_ACCOUNT_ID);
    expect(normalizeAccountId("  ")).toBe(DEFAULT_FEISHU_ACCOUNT_ID);
    expect(normalizeAccountId("team-a")).toBe("team-a");
  });

  it("resolves a registered account and lists enabled ids", () => {
    const registry = buildRegistry();
    registry.register({
      accountId: "team-b",
      credentials: { appId: "cli_b", appSecret: "sec_b" },
      enabled: false,
    });
    expect(registry.get("default")?.credentials.appId).toBe("cli_test_app");
    expect(registry.enabledAccountIds()).toEqual([DEFAULT_FEISHU_ACCOUNT_ID]);
  });

  it("rejects accounts missing credentials", () => {
    const registry = new FeishuAccountRegistry();
    expect(() =>
      registry.register({
        accountId: "bad",
        credentials: { appId: "", appSecret: "" },
        enabled: true,
      }),
    ).toThrow(/missing appId/);
  });
});

describe("FeishuConnector.probe", () => {
  it("reports ready when token + bot info succeed", async () => {
    globalThis.fetch = fetchReturning(
      { code: 0, msg: "ok", tenant_access_token: "t_1", expire: 7200 },
      { code: 0, msg: "ok", bot: { app_name: "Recoder Bot", open_id: "ou_bot" } },
    );
    const connector = new FeishuConnector({ registry: buildRegistry() });
    const probe = await connector.probe("default");
    expect(probe.ready).toBe(true);
    expect(probe.channel).toBe("feishu");
    expect(probe.identity).toBe("Recoder Bot");
  });

  it("reports a truthful error when the token exchange fails", async () => {
    globalThis.fetch = fetchReturning({ code: 99991663, msg: "app secret invalid" });
    const connector = new FeishuConnector({ registry: buildRegistry() });
    const probe = await connector.probe("default");
    expect(probe.ready).toBe(false);
    expect(probe.error).toContain("app secret invalid");
  });

  it("reports not-configured for an unknown account without faking health", async () => {
    const connector = new FeishuConnector({ registry: new FeishuAccountRegistry() });
    const probe = await connector.probe("missing");
    expect(probe.ready).toBe(false);
    expect(probe.error).toContain("not configured");
  });
});

describe("FeishuConnector.send", () => {
  it("chunks and sends, returning channel-native message ids", async () => {
    globalThis.fetch = fetchReturning(
      { code: 0, msg: "ok", tenant_access_token: "t_1", expire: 7200 },
      { code: 0, msg: "ok", data: { message_id: "om_a" } },
      { code: 0, msg: "ok", data: { message_id: "om_b" } },
    );
    const connector = new FeishuConnector({ registry: buildRegistry(), textChunkLimit: 5 });
    const result = await connector.send({
      target: { channel: "feishu", accountId: "default", conversationId: "oc_chat_1" },
      text: "hello\nworld",
    });
    expect(result.delivered).toBe(true);
    expect(result.messageIds).toEqual(["om_a", "om_b"]);
  });

  it("does not deliver an empty message", async () => {
    globalThis.fetch = fetchReturning({
      code: 0,
      msg: "ok",
      tenant_access_token: "t_1",
      expire: 7200,
    });
    const connector = new FeishuConnector({ registry: buildRegistry() });
    const result = await connector.send({
      target: { channel: "feishu", accountId: "default", conversationId: "oc_chat_1" },
      text: "",
    });
    expect(result.delivered).toBe(false);
    expect(result.messageIds).toEqual([]);
  });
});

describe("FeishuConnector.react", () => {
  it("maps a unicode emoji and returns true on success", async () => {
    globalThis.fetch = fetchReturning(
      { code: 0, msg: "ok", tenant_access_token: "t_1", expire: 7200 },
      { code: 0, msg: "ok", data: { reaction_id: "rx_1" } },
    );
    const connector = new FeishuConnector({ registry: buildRegistry() });
    const reacted = await connector.react({
      channel: "feishu",
      accountId: "default",
      conversationId: "oc_chat_1",
      messageId: "om_1",
      emoji: "👍",
    });
    expect(reacted).toBe(true);
  });

  it("returns false when the channel rejects the emoji", async () => {
    globalThis.fetch = fetchReturning(
      { code: 0, msg: "ok", tenant_access_token: "t_1", expire: 7200 },
      { code: 230002, msg: "invalid emoji_type" },
    );
    const connector = new FeishuConnector({ registry: buildRegistry() });
    const reacted = await connector.react({
      channel: "feishu",
      accountId: "default",
      conversationId: "oc_chat_1",
      messageId: "om_1",
      emoji: "🤔",
    });
    expect(reacted).toBe(false);
  });
});

describe("FeishuConnector.monitor", () => {
  it("normalizes inbound events from the long-connection and stops cleanly", async () => {
    const received: string[] = [];
    let registered: ((data: unknown) => void | Promise<void>) | undefined;
    let started = false;

    const fakeSdk: LarkSdkModule = {
      EventDispatcher: class {
        register(handlers: Record<string, (data: unknown) => void | Promise<void>>) {
          registered = handlers["im.message.receive_v1"];
          return this;
        }
      },
      WSClient: class {
        async start() {
          started = true;
        }
      },
      LoggerLevel: { info: 1 },
    };
    setLarkSdkLoader(async () => fakeSdk);

    const connector = new FeishuConnector({ registry: buildRegistry() });
    const handle = await connector.monitor("default", (msg) => {
      received.push(msg.text);
    });

    expect(started).toBe(true);
    expect(registered).toBeDefined();

    await registered?.({
      message: {
        chat_id: "oc_chat_1",
        chat_type: "p2p",
        message_type: "text",
        message_id: "om_1",
        create_time: 1,
        content: JSON.stringify({ text: "live message" }),
      },
      sender: { sender_id: { open_id: "ou_1" } },
    });

    expect(received).toEqual(["live message"]);
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  it("fails fast with a truthful error when the SDK is unavailable", async () => {
    setLarkSdkLoader(async () => {
      throw new Error("Cannot find module");
    });
    const connector = new FeishuConnector({ registry: buildRegistry() });
    await expect(connector.monitor("default", () => {})).rejects.toThrow(
      /@larksuiteoapi\/node-sdk/,
    );
  });
});
