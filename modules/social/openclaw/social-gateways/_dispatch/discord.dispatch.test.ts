// End-to-end dispatch test for the REAL Discord ConnectorPort.
//
// Seam: DiscordConnectorOptions.fetchImpl — the adapter's DiscordApiClient speaks
// the Discord REST v10 API (`/channels/:id/messages`, `/users/@me/channels`)
// over raw fetch, so that IS its true SDK/HTTP seam. We feed a real Discord
// gateway MessageCreate event through the real normalizeDiscordMessageEvent (via
// connector.normalize), register the real adapter, and run dispatchInbound so the
// gate -> embedded runner -> the adapter's real send() POSTs the reply against
// the doubled fetch. Nothing in the dispatch path is mocked: only the channel's
// HTTP transport is replaced.

import { describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import { DiscordConnector } from "../discord/connector/index.js";

import { makeFetchDouble, replyingRunner, type RecordedFetch } from "./harness.js";

/** A real Discord gateway `MessageCreate` event (text, from a user in a channel). */
function discordChannelEvent(): unknown {
  return {
    message: {
      id: "1300000000000000001",
      channelId: "999000000000000111",
      content: "summarize the thread",
      channelType: 0, // GUILD_TEXT
      timestamp: "2026-01-01T00:00:00.000Z",
      attachments: [],
      mentions: { users: [] },
    },
    author: {
      id: "555000000000000222",
      username: "alice",
      globalName: "Alice",
      discriminator: "0",
      bot: false,
    },
    member: { nickname: "Allie" },
  };
}

/** A real Discord DM gateway event (text, DM channel type). */
function discordDmEvent(): unknown {
  return {
    message: {
      id: "1300000000000000009",
      channelId: "dm-channel-77",
      content: "ping",
      channelType: 1, // DM
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    author: { id: "555000000000000222", username: "alice", discriminator: "0", bot: false },
  };
}

/**
 * Discord REST routes for the doubled fetch: getCurrentUser (probe/monitor),
 * the channelMessages POST (the real send), and the DM-channel create. Each
 * returns a real-shaped Discord payload.
 */
function discordRoutes(created: Array<{ channelId: string; body: unknown }>) {
  let outId = 0;
  return [
    (call: RecordedFetch) =>
      call.url.endsWith("/users/@me") && call.method === "GET"
        ? { json: { id: "bot-1", username: "recoder-bot", discriminator: "0" } }
        : undefined,
    (call: RecordedFetch) =>
      call.url.endsWith("/users/@me/channels") && call.method === "POST"
        ? { json: { id: "dm-channel-77" } }
        : undefined,
    (call: RecordedFetch) => {
      const match = call.url.match(/\/channels\/([^/]+)\/messages$/);
      if (!match || call.method !== "POST") {
        return undefined;
      }
      created.push({ channelId: match[1], body: call.body });
      outId += 1;
      return { json: { id: `discord-out-${outId}`, channel_id: match[1] } };
    },
  ];
}

function connectorWith(double: ReturnType<typeof makeFetchDouble>): DiscordConnector {
  return new DiscordConnector({
    config: { token: "discord-bot-token" },
    fetchImpl: double.fetch,
  });
}

describe("discord dispatch (real adapter, fetchImpl seam)", () => {
  it("routes a real channel message through normalize -> gate -> runner -> real send()", async () => {
    const created: Array<{ channelId: string; body: unknown }> = [];
    const double = makeFetchDouble(discordRoutes(created));
    const connector = connectorWith(double);

    const normalized = connector.normalize(discordChannelEvent(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("discord");
    expect(normalized?.text).toBe("summarize the thread");
    expect(normalized?.chatType).toBe("channel");
    expect(normalized?.conversationId).toBe("999000000000000111");
    expect(normalized?.messageId).toBe("1300000000000000001");
    expect(normalized?.sender.SenderId).toBe("555000000000000222");
    expect(normalized?.sender.SenderName).toBe("Allie");

    const registry = new ConnectorRegistry().register(connector);
    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("Here is the summary."),
      // A guild-channel message: the deployment allows this principal and does
      // not require an @mention to act in this channel.
      gatePolicy: makeAllowlistGatePolicy({
        allowlist: ["555000000000000222"],
        requireMentionInGroups: false,
      }),
      agentRouter: () => ({ agentId: "doc-bot", sessionId: "discord-1" }),
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Here is the summary.");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["discord-out-1"]);
    }

    // The real send POSTed to the inbound channel and threaded the reply under
    // the inbound message id (dispatchInbound sets replyTo = inbound messageId).
    expect(created).toHaveLength(1);
    expect(created[0]?.channelId).toBe("999000000000000111");
    const body = created[0]?.body as {
      content: string;
      message_reference?: { message_id: string };
    };
    expect(body.content).toBe("Here is the summary.");
    expect(body.message_reference?.message_id).toBe("1300000000000000001");

    // No DM channel was created for a guild-channel target.
    expect(double.callsMatching("/users/@me/channels")).toHaveLength(0);
  });

  it("opens a DM channel and pushes when the inbound is a direct message", async () => {
    const created: Array<{ channelId: string; body: unknown }> = [];
    const double = makeFetchDouble(discordRoutes(created));
    const connector = connectorWith(double);

    const normalized = connector.normalize(discordDmEvent(), "default");
    expect(normalized?.chatType).toBe("direct");
    expect(normalized?.conversationId).toBe("dm-channel-77");

    const registry = new ConnectorRegistry().register(connector);
    // Send to a user recipient so the adapter exercises the real DM-open path.
    const outcome = await connector.send({
      target: {
        channel: "discord",
        accountId: "default",
        conversationId: "user:555000000000000222",
      },
      text: "pong",
    });

    expect(outcome.delivered).toBe(true);
    expect(outcome.messageIds).toEqual(["discord-out-1"]);
    // A DM channel was opened, then the message POSTed into the resolved channel.
    expect(double.callsMatching("/users/@me/channels")).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(created[0]?.channelId).toBe("dm-channel-77");
    expect(registry.get("discord")).toBe(connector);
  });

  it("probes the real bot identity, detects an @mention, and delivers under mention gating", async () => {
    const created: Array<{ channelId: string; body: unknown }> = [];
    const double = makeFetchDouble(discordRoutes(created));
    const connector = connectorWith(double);

    // probe() drives the real GET /users/@me and binds the bot user id, so the
    // next normalize() can detect a `<@bot-1>` mention in a guild channel.
    const probe = await connector.probe("default");
    expect(probe.ready).toBe(true);
    expect(probe.identity).toBe("@recoder-bot");
    expect(double.callsMatching("/users/@me").length).toBeGreaterThan(0);

    const mentionEvent = {
      message: {
        id: "1300000000000000050",
        channelId: "999000000000000111",
        content: "<@bot-1> deploy please",
        channelType: 0,
        timestamp: "2026-01-01T00:00:00.000Z",
        mentions: { users: [{ id: "bot-1" }] },
      },
      author: { id: "555000000000000222", username: "alice", discriminator: "0", bot: false },
    };

    const normalized = connector.normalize(mentionEvent, "default");
    expect(normalized?.wasMentioned).toBe(true);

    const registry = new ConnectorRegistry().register(connector);
    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("Deploying now."),
      // Mention gating ON (the default): only acts in the channel when @mentioned.
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["555000000000000222"] }),
      agentRouter: () => ({ agentId: "ops-bot", sessionId: "discord-2" }),
    });

    expect(outcome.status).toBe("delivered");
    expect(created).toHaveLength(1);
    expect(created[0]?.channelId).toBe("999000000000000111");
  });

  it("blocks a non-allowlisted sender and never delivers", async () => {
    const created: Array<{ channelId: string; body: unknown }> = [];
    const double = makeFetchDouble(discordRoutes(created));
    const connector = connectorWith(double);
    const normalized = connector.normalize(discordChannelEvent(), "default");
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("never"),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["someone-else"] }),
      agentRouter: () => ({ agentId: "a", sessionId: "s" }),
    });

    expect(outcome.status).toBe("blocked");
    expect(created).toHaveLength(0);
  });
});
