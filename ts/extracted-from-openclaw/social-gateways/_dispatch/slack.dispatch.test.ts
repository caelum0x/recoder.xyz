// End-to-end dispatch test for the REAL Slack ConnectorPort.
//
// Seam: SlackConnectorOptions.clientFactory — the adapter's documented injection
// point for the `@slack/web-api` WebClient (the same seam the adapter ships for
// tests). We feed a real Slack message event through the real normalizeSlackEvent
// (via connector.normalize), register the real adapter, and run dispatchInbound
// so the gate -> embedded runner -> the adapter's real send() drives the in-memory
// SlackWebClient double. Nothing in the dispatch path is mocked.

import { describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import { createSlackConnector } from "../slack/adapter/index.js";
import type { SlackWebClient } from "../slack/adapter/web-client.js";

import { replyingRunner } from "./harness.js";

interface PostedMessage {
  channel: string;
  text: string;
  thread_ts?: string;
}

/** A real-shaped in-memory SlackWebClient double recording posts. */
function fakeSlackClient(posts: PostedMessage[]): SlackWebClient {
  return {
    chat: {
      async postMessage(args) {
        posts.push({ channel: args.channel, text: args.text, thread_ts: args.thread_ts });
        return { ok: true, ts: `1700000000.00000${posts.length}`, channel: args.channel };
      },
      async update() {
        return { ok: true };
      },
      async delete() {
        return { ok: true };
      },
    },
    conversations: {
      async open() {
        return { ok: true, channel: { id: "D999" } };
      },
    },
    files: {
      async uploadV2() {
        return { ok: true, files: [] };
      },
    },
    reactions: {
      async add() {
        return { ok: true };
      },
      async remove() {
        return { ok: true };
      },
    },
    auth: {
      async test() {
        return { ok: true, user_id: "UBOT", user: "recoder", team_id: "T1" };
      },
    },
  };
}

/** A real Slack DM `message` event payload. */
function slackEvent(): unknown {
  return {
    type: "message",
    channel: "D123",
    channel_type: "im",
    user: "U777",
    text: "deploy the app",
    ts: "1700000000.000200",
  };
}

describe("slack dispatch (real adapter, clientFactory seam)", () => {
  it("routes a real message event through normalize -> gate -> runner -> real send()", async () => {
    const posts: PostedMessage[] = [];
    const connector = createSlackConnector({
      profiles: [{ accountId: "default", botToken: "xoxb-test", enabled: true }],
      clientFactory: async () => fakeSlackClient(posts),
    });

    const normalized = connector.normalize(slackEvent(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("slack");
    expect(normalized?.text).toBe("deploy the app");
    expect(normalized?.conversationId).toBe("D123");
    expect(normalized?.chatType).toBe("direct");
    expect(normalized?.sender.SenderId).toBe("U777");

    const registry = new ConnectorRegistry().register(connector);
    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("Deploying now."),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["U777"] }),
      agentRouter: () => ({ agentId: "deploy-bot", sessionId: "slack-D123" }),
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Deploying now.");
      expect(outcome.send.delivered).toBe(true);
    }

    // The reply hit the real send path -> chat.postMessage on the right channel,
    // threaded under the inbound message ts.
    expect(posts).toHaveLength(1);
    expect(posts[0]?.channel).toBe("D123");
    expect(posts[0]?.text).toBe("Deploying now.");
    expect(posts[0]?.thread_ts).toBe("1700000000.000200");
  });

  it("blocks an unlisted sender at the gate and never posts", async () => {
    const posts: PostedMessage[] = [];
    const connector = createSlackConnector({
      profiles: [{ accountId: "default", botToken: "xoxb-test", enabled: true }],
      clientFactory: async () => fakeSlackClient(posts),
    });
    const normalized = connector.normalize(slackEvent(), "default");
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("never"),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["someone-else"] }),
      agentRouter: () => ({ agentId: "a", sessionId: "s" }),
    });

    expect(outcome.status).toBe("blocked");
    expect(posts).toHaveLength(0);
  });
});
