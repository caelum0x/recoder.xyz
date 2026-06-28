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
