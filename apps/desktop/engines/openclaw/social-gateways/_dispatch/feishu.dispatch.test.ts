// End-to-end dispatch test for the REAL Feishu ConnectorPort.
//
// Seam: globalThis.fetch — the Feishu adapter's FeishuRestClient speaks the open
// platform REST API (tenant_access_token + im/v1/messages) over raw fetch, so
// that IS its true SDK seam. We feed a real Feishu message-receive event through
// the real normalizeFeishuEvent (via connector.normalize), register the real
// adapter against a real FeishuAccountRegistry, and run dispatchInbound so the
// gate -> embedded runner -> the adapter's real send() issues the real token
// exchange + message create against the doubled fetch.

import { describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import {
  FeishuAccountRegistry,
  FeishuConnector,
} from "../feishu/connector-index.js";

import { makeFetchDouble, replyingRunner, withGlobalFetch, type RecordedFetch } from "./harness.js";

/** A real Feishu `im.message.receive_v1` event payload. */
function feishuEvent(): unknown {
  return {
    sender: { sender_id: { open_id: "ou_alice", user_id: "alice" } },
    message: {
      chat_id: "oc_chat_1",
      message_id: "om_msg_in_1",
      message_type: "text",
      chat_type: "p2p",
      create_time: "1700000000000",
      content: JSON.stringify({ text: "rotate the keys" }),
    },
  };
}

/** A fresh registry holding one real (test) Feishu app account. */
function registryWith(appId: string): FeishuAccountRegistry {
  const registry = new FeishuAccountRegistry();
  registry.register({
    accountId: "default",
    credentials: { appId, appSecret: "test-secret" },
    enabled: true,
  });
  return registry;
}

function feishuRoutes() {
  return [
    (call: RecordedFetch) =>
      call.url.includes("/auth/v3/tenant_access_token/internal")
        ? { json: { code: 0, tenant_access_token: "t-token", expire: 7200 } }
        : undefined,
    // bot-info binds the REAL bot open_id (the mention trust anchor).
    (call: RecordedFetch) =>
      call.url.includes("/bot/v3/info")
        ? { json: { code: 0, bot: { app_name: "Recoder Bot", open_id: "ou_bot" } } }
        : undefined,
    (call: RecordedFetch) =>
      call.url.includes("/im/v1/messages")
        ? { json: { code: 0, data: { message_id: "om_msg_out_1" } } }
        : undefined,
  ];
}

/**
 * A real Feishu group `im.message.receive_v1` event. The `@mention` carries the
 * mentioned principal's open_id on `mention.id` — the bound bot ("ou_bot") when
 * `mentionBot`, some other member ("ou_other") otherwise.
 */
function feishuGroupEvent(opts: { mentionBot: boolean }): unknown {
  return {
    sender: { sender_id: { open_id: "ou_alice", user_id: "alice" } },
    message: {
      chat_id: "oc_group_1",
      message_id: opts.mentionBot ? "om_grp_in_1" : "om_grp_in_2",
      message_type: "text",
      chat_type: "group",
      create_time: "1700000000000",
      content: JSON.stringify({ text: "@_user_1 rotate the keys" }),
      mentions: [
        {
          key: "@_user_1",
          name: opts.mentionBot ? "Recoder Bot" : "Someone Else",
          id: { open_id: opts.mentionBot ? "ou_bot" : "ou_other" },
        },
      ],
    },
  };
}

describe("feishu dispatch (real adapter, global fetch seam)", () => {
  it("routes a real receive event through normalize -> gate -> runner -> real send()", async () => {
    // A unique appId keeps this test off the FeishuRestClient static token cache.
    const connector = new FeishuConnector({ registry: registryWith("app-dispatch-1") });

    const normalized = connector.normalize(feishuEvent(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("feishu");
    expect(normalized?.text).toBe("rotate the keys");
    expect(normalized?.chatType).toBe("direct");
    expect(normalized?.conversationId).toBe("oc_chat_1");
    expect(normalized?.sender.SenderId).toBe("ou_alice");

    const double = makeFetchDouble(feishuRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, () =>
      dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("Keys rotated."),
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["ou_alice"] }),
        agentRouter: () => ({ agentId: "sec-bot", sessionId: "fs-1" }),
      }),
    );

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Keys rotated.");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["om_msg_out_1"]);
    }

    // The reply drove the real im/v1/messages create with the right receive_id + text.
    const sends = double.callsMatching("/im/v1/messages");
    expect(sends).toHaveLength(1);
    const body = sends[0]?.body as { receive_id?: unknown; content?: unknown };
    expect(body.receive_id).toBe("oc_chat_1");
    expect(JSON.parse(String(body.content)).text).toBe("Keys rotated.");
  });

  it("blocks a non-allowlisted sender and never calls the send API", async () => {
    const connector = new FeishuConnector({ registry: registryWith("app-dispatch-2") });
    const normalized = connector.normalize(feishuEvent(), "default");
    const double = makeFetchDouble(feishuRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, () =>
      dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("never"),
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["ou_someone_else"] }),
        agentRouter: () => ({ agentId: "a", sessionId: "s" }),
      }),
    );

    expect(outcome.status).toBe("blocked");
    expect(double.callsMatching("/im/v1/messages")).toHaveLength(0);
  });
});

describe("feishu GROUP dispatch under requireMentionInGroups (real bot-open_id gate)", () => {
  it("delivers a group message that @mentions the bound bot open_id", async () => {
    const connector = new FeishuConnector({ registry: registryWith("app-dispatch-grp-1") });
    const double = makeFetchDouble(feishuRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, async () => {
      // probe() drives the real token + bot-info exchange and binds the bot
      // open_id, so the next normalize() can detect a mention of the bot.
      const probe = await connector.probe("default");
      expect(probe.ready).toBe(true);

      const normalized = connector.normalize(feishuGroupEvent({ mentionBot: true }), "default");
      expect(normalized?.chatType).toBe("group");
      expect(normalized?.wasMentioned).toBe(true);
      expect(normalized?.text).toBe("rotate the keys");

      return dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("Keys rotated."),
        // requireMentionInGroups defaults TRUE — delivery proves the mention was
        // matched against the bound bot open_id.
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["ou_alice"] }),
        agentRouter: () => ({ agentId: "sec-bot", sessionId: "fs-grp-1" }),
      });
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Keys rotated.");
    }
    expect(double.callsMatching("/im/v1/messages")).toHaveLength(1);
  });

  it("DROPS a group message whose @mention targets someone other than the bot", async () => {
    const connector = new FeishuConnector({ registry: registryWith("app-dispatch-grp-2") });
    const double = makeFetchDouble(feishuRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, async () => {
      await connector.probe("default");
      const normalized = connector.normalize(feishuGroupEvent({ mentionBot: false }), "default");
      expect(normalized?.chatType).toBe("group");
      // A mention exists, but not of the bot: must NOT be treated as addressed.
      expect(normalized?.wasMentioned).toBe(false);

      return dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("should never send"),
        // Sender IS allowlisted; only the missing bot-mention blocks it.
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["ou_alice"] }),
        agentRouter: () => ({ agentId: "sec-bot", sessionId: "fs-grp-2" }),
      });
    });

    expect(outcome.status).toBe("blocked");
    expect(double.callsMatching("/im/v1/messages")).toHaveLength(0);
  });
});
