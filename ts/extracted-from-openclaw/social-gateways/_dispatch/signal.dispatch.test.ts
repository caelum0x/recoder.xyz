// End-to-end dispatch test for the REAL Signal ConnectorPort.
//
// Seam: globalThis.fetch — the signal-cli adapter speaks the daemon's JSON-RPC
// wire protocol (POST /api/v1/rpc) over the runtime's global fetch, so that IS
// its true SDK seam. We feed a real signal-cli `receive` payload through the real
// normalizeSignalEvent (via connector.normalize), register the real adapter, and
// run dispatchInbound so the gate -> embedded runner -> the adapter's real send()
// issues the real `send` RPC against the doubled fetch.

import { describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import { createSignalConnector } from "../signal/adapter/index.js";

import { makeFetchDouble, replyingRunner, withGlobalFetch, type RecordedFetch } from "./harness.js";

/** A real signal-cli `receive` SSE payload (the parsed `data` of one frame). */
function signalPayload(): unknown {
  return {
    envelope: {
      sourceNumber: "+15550001111",
      sourceName: "Alice",
      timestamp: 1_700_000_000_000,
      dataMessage: {
        message: "ping the server",
        attachments: [],
      },
    },
  };
}

function signalRoutes() {
  return [
    (call: RecordedFetch) => {
      if (!call.url.includes("/api/v1/rpc")) {
        return undefined;
      }
      const body = call.body as { method?: string };
      if (body?.method === "send") {
        return { json: { jsonrpc: "2.0", result: { timestamp: 1_700_000_009_999 }, id: "1" } };
      }
      return { json: { jsonrpc: "2.0", result: {}, id: "1" } };
    },
  ];
}

describe("signal dispatch (real adapter, global fetch seam)", () => {
  it("routes a real receive payload through normalize -> gate -> runner -> real send()", async () => {
    const connector = createSignalConnector();

    const normalized = connector.normalize(signalPayload(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("signal");
    expect(normalized?.text).toBe("ping the server");
    expect(normalized?.chatType).toBe("direct");
    // A DM peer id is the sender's E.164 for a phone-based sender.
    expect(normalized?.sender.SenderE164).toBe("+15550001111");

    const double = makeFetchDouble(signalRoutes());
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await withGlobalFetch(double, () =>
      dispatchInbound(normalized!, {
        registry,
        runner: replyingRunner("pong"),
        // The DM peer is allowlisted by E.164.
        gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+15550001111"] }),
        agentRouter: () => ({ agentId: "ops-bot", sessionId: "sig-1" }),
      }),
    );

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("pong");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["1700000009999"]);
    }

    // The reply drove the real signal-cli `send` RPC with the right recipient + text.
    const sends = double
      .callsMatching("/api/v1/rpc")
      .filter((c) => (c.body as { method?: string }).method === "send");
    expect(sends).toHaveLength(1);
    const params = (sends[0]?.body as { params?: Record<string, unknown> }).params;
    expect(params?.message).toBe("pong");
    expect(params?.recipient).toEqual(["+15550001111"]);
  });

  it("blocks a non-allowlisted DM and never issues a send RPC", async () => {
    const connector = createSignalConnector();
    const normalized = connector.normalize(signalPayload(), "default");
    const double = makeFetchDouble(signalRoutes());
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
    const sends = double
      .callsMatching("/api/v1/rpc")
      .filter((c) => (c.body as { method?: string }).method === "send");
    expect(sends).toHaveLength(0);
  });
});
