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
    (call: RecordedFetch) =>
      call.url.includes("/im/v1/messages")
        ? { json: { code: 0, data: { message_id: "om_msg_out_1" } } }
        : undefined,
  ];
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
