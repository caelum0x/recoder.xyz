// End-to-end dispatch test for the REAL WhatsApp ConnectorPort.
//
// Seam: globalThis.fetch — the WhatsApp adapter speaks the bridge daemon's HTTP
// API (POST /api/v1/send) over the runtime's global fetch, so that IS its true
// SDK seam. We feed a real WhatsApp Web `message` frame (a WAMessage) through the
// real normalizeWhatsAppEvent (via connector.normalize), register the real
// adapter, and run dispatchInbound so the gate -> embedded runner -> the
// adapter's real send() issues the real bridge send against the doubled fetch.

import { describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import { createWhatsAppConnector } from "../whatsapp/adapter/index.js";

import { makeFetchDouble, replyingRunner, withGlobalFetch, type RecordedFetch } from "./harness.js";

/** A real WhatsApp Web `message` frame carrying a direct text message. */
function whatsappFrame(): unknown {
  return {
    key: {
      remoteJid: "15550001111@s.whatsapp.net",
      id: "WAMSG-IN-1",
      fromMe: false,
    },
    message: { conversation: "status please" },
    messageTimestamp: 1_700_000_000,
    pushName: "Alice",
  };
}

function whatsappRoutes() {
  return [
    (call: RecordedFetch) =>
      call.url.includes("/api/v1/send")
        ? { json: { id: "WAMSG-OUT-1" } }
        : undefined,
  ];
}

describe("whatsapp dispatch (real adapter, global fetch seam)", () => {
  it("routes a real WAMessage through normalize -> gate -> runner -> real send()", async () => {
    const connector = createWhatsAppConnector();

    const normalized = connector.normalize(whatsappFrame(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("whatsapp");
    expect(normalized?.text).toBe("status please");
    expect(normalized?.chatType).toBe("direct");
    expect(normalized?.sender.SenderE164).toBe("+15550001111");
    expect(normalized?.conversationId).toBe("15550001111@s.whatsapp.net");

    const double = makeFetchDouble(whatsappRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, () =>
      dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("All systems green."),
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+15550001111"] }),
        agentRouter: () => ({ agentId: "status-bot", sessionId: "wa-1" }),
      }),
    );

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("All systems green.");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["WAMSG-OUT-1"]);
    }

    const sends = double.callsMatching("/api/v1/send");
    expect(sends).toHaveLength(1);
    expect((sends[0]?.body as { text?: unknown }).text).toBe("All systems green.");
    expect((sends[0]?.body as { to?: unknown }).to).toContain("15550001111");
  });

  it("blocks a non-allowlisted sender and never calls the bridge send", async () => {
    const connector = createWhatsAppConnector();
    const normalized = connector.normalize(whatsappFrame(), "default");
    const double = makeFetchDouble(whatsappRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, () =>
      dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("never"),
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+19990000000"] }),
        agentRouter: () => ({ agentId: "a", sessionId: "s" }),
      }),
    );

    expect(outcome.status).toBe("blocked");
    expect(double.callsMatching("/api/v1/send")).toHaveLength(0);
  });
});

/**
 * A real WhatsApp Web group `message` frame (a WAMessage on a `@g.us` chat). The
 * bot is `@mentioned` by putting its REAL self phone in the contextInfo mentions
 * (mentioned as "15559999999@s.whatsapp.net"; the bound self JID from the bridge
 * is the device-suffixed "15559999999:11@s.whatsapp.net" — the phone match is
 * what resolves it). Toggle `mentionBot` to mention someone else instead.
 */
function whatsappGroupFrame(opts: { mentionBot: boolean }): unknown {
  const botMentionJid = "15559999999@s.whatsapp.net";
  const otherJid = "15550002222@s.whatsapp.net";
  return {
    key: {
      remoteJid: "120363000000000000@g.us",
      participant: "15550001111@s.whatsapp.net",
      id: opts.mentionBot ? "WAMSG-GRP-1" : "WAMSG-GRP-2",
      fromMe: false,
    },
    message: {
      extendedTextMessage: {
        text: opts.mentionBot ? "@bot deploy please" : "just chatting here",
        contextInfo: {
          mentionedJid: opts.mentionBot ? [botMentionJid] : [otherJid],
        },
      },
    },
    messageTimestamp: 1_700_000_100,
    pushName: "Alice",
  };
}

/** Bridge routes: status reports the REAL linked self JID; send echoes an id. */
function whatsappGroupRoutes() {
  return [
    (call: RecordedFetch) =>
      call.url.includes("/api/v1/status")
        ? { json: { linked: true, connected: true, me: "15559999999:11@s.whatsapp.net" } }
        : undefined,
    (call: RecordedFetch) =>
      call.url.includes("/api/v1/send")
        ? { json: { id: "WAMSG-OUT-GRP" } }
        : undefined,
  ];
}

describe("whatsapp GROUP dispatch under requireMentionInGroups (real self-identity gate)", () => {
  it("delivers a group message that @mentions the bot's REAL self identity", async () => {
    const connector = createWhatsAppConnector();
    const double = makeFetchDouble(whatsappGroupRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, async () => {
      // Bind the live self JID (Baileys sock.user.id) via the real probe first —
      // exactly what the monitor loop does before ingress.
      const probe = await connector.probe("default");
      expect(probe.ready).toBe(true);

      const normalized = connector.normalize(whatsappGroupFrame({ mentionBot: true }), "default");
      expect(normalized?.chatType).toBe("group");
      // Proven off the REAL bound identity, not the "default" account label.
      expect(normalized?.wasMentioned).toBe(true);

      return dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("Deploying now."),
        // requireMentionInGroups defaults TRUE — delivery here proves the mention
        // was detected against the bot's real self identity.
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+15550001111"] }),
        agentRouter: () => ({ agentId: "ops-bot", sessionId: "wa-grp-1" }),
      });
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Deploying now.");
    }
    const sends = double.callsMatching("/api/v1/send");
    expect(sends).toHaveLength(1);
    expect((sends[0]?.body as { to?: unknown }).to).toContain("120363000000000000@g.us");
  });

  it("DROPS a group message that does NOT mention the bot (no false-positive self-match)", async () => {
    const connector = createWhatsAppConnector();
    const double = makeFetchDouble(whatsappGroupRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, async () => {
      await connector.probe("default");
      const normalized = connector.normalize(whatsappGroupFrame({ mentionBot: false }), "default");
      expect(normalized?.chatType).toBe("group");
      expect(normalized?.wasMentioned).toBe(false);

      return dispatchInbound(normalized!, {
        registry,
        // Sender IS allowlisted; only the missing mention must block it.
        runner: replyingRunner("should never send"),
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+15550001111"] }),
        agentRouter: () => ({ agentId: "ops-bot", sessionId: "wa-grp-2" }),
      });
    });

    expect(outcome.status).toBe("blocked");
    expect(double.callsMatching("/api/v1/send")).toHaveLength(0);
  });
});
