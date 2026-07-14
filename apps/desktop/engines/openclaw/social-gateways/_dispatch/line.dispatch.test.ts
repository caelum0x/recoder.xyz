// End-to-end dispatch test for the REAL LINE ConnectorPort.
//
// Seam: LineConnectorOptions.clientFactory — the adapter's injection point for
// the `@line/bot-sdk` MessagingApiClient (the optional peer SDK). We feed a real
// LINE webhook message event through the real normalizeLineEvent (via
// connector.normalize), register the real adapter, and run dispatchInbound so the
// gate -> embedded runner -> the adapter's real send() drives the in-memory
// MessagingApiClient double through the real deliverLineMessage push/reply logic.

import { describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import { LineConnector } from "../line/connector/index.js";
import type {
  LineIngress,
  LineWebhookReceiver,
} from "../line/connector/line-monitor.js";
import type { LineMessagingApiClient } from "../line/connector/line-sdk-types.js";

import { replyingRunner } from "./harness.js";

/** A no-op ingress; the dispatch test drives normalize + send, not monitor(). */
const noopIngress: LineIngress = {
  register(_receiver: LineWebhookReceiver) {
    return { unregister() {} };
  },
};

interface LinePush {
  to: string;
  text: string;
}
interface LineReply {
  replyToken: string;
  text: string;
}

/** A real-shaped in-memory LINE MessagingApiClient double. */
function fakeLineClient(pushes: LinePush[], replies: LineReply[]): LineMessagingApiClient {
  let n = 0;
  const ids = () => [{ id: `line-out-${(n += 1)}` }];
  return {
    async pushMessage(request) {
      for (const m of request.messages) {
        if (m.type === "text") {
          pushes.push({ to: request.to, text: m.text });
        }
      }
      return { sentMessages: ids() };
    },
    async replyMessage(request) {
      for (const m of request.messages) {
        if (m.type === "text") {
          replies.push({ replyToken: request.replyToken, text: m.text });
        }
      }
      return { sentMessages: ids() };
    },
    async getBotInfo() {
      return { userId: "Ubot", basicId: "@recoder", displayName: "Recoder" };
    },
    async getProfile() {
      return { userId: "U777", displayName: "Alice" };
    },
    async showLoadingAnimation() {
      return {};
    },
  };
}

/** A real LINE webhook `message` event (text, from a user source). */
function lineEvent(): unknown {
  return {
    type: "message",
    replyToken: "reply-token-1",
    timestamp: 1_700_000_000_000,
    source: { type: "user", userId: "U777" },
    message: { type: "text", id: "line-in-1", text: "summarize the doc" },
  };
}

function connectorWith(pushes: LinePush[], replies: LineReply[]): LineConnector {
  return new LineConnector({
    ingress: noopIngress,
    config: { channelAccessToken: "line-token", channelSecret: "line-secret" },
    clientFactory: () => fakeLineClient(pushes, replies),
  });
}

describe("line dispatch (real adapter, clientFactory seam)", () => {
  it("routes a real webhook event through normalize -> gate -> runner -> real send()", async () => {
    const pushes: LinePush[] = [];
    const replies: LineReply[] = [];
    const connector = connectorWith(pushes, replies);

    const normalized = connector.normalize(lineEvent(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("line");
    expect(normalized?.text).toBe("summarize the doc");
    expect(normalized?.chatType).toBe("direct");
    expect(normalized?.conversationId).toBe("line:user:U777");
    expect(normalized?.sender.SenderId).toBe("U777");

    const registry = new ConnectorRegistry().register(connector);
    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("Here is the summary."),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["U777"] }),
      agentRouter: () => ({ agentId: "doc-bot", sessionId: "line-1" }),
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Here is the summary.");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["line-out-1"]);
    }

    // dispatchInbound builds the reply target with `replyTo = inbound messageId`,
    // which the real LINE send treats as the one-time reply token: the reply goes
    // out via the cheaper reply path (no push quota) addressed by that token.
    expect(replies).toHaveLength(1);
    expect(replies[0]?.replyToken).toBe("line-in-1");
    expect(replies[0]?.text).toBe("Here is the summary.");
    expect(pushes).toHaveLength(0);
  });

  it("blocks a non-allowlisted sender and never delivers", async () => {
    const pushes: LinePush[] = [];
    const replies: LineReply[] = [];
    const connector = connectorWith(pushes, replies);
    const normalized = connector.normalize(lineEvent(), "default");
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("never"),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["someone-else"] }),
      agentRouter: () => ({ agentId: "a", sessionId: "s" }),
    });

    expect(outcome.status).toBe("blocked");
    expect(pushes).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });
});
