// End-to-end dispatch test for the REAL Telegram ConnectorPort.
//
// Seam: TelegramConnectorOptions.fetchImpl — the adapter's only contact with the
// Telegram Bot API. We feed a real Telegram `Update` through the adapter's real
// normalize(), register the real adapter in the real ConnectorRegistry, and run
// dispatchInbound so the gate -> embedded runner -> the adapter's real send()
// flow executes. The doubled fetch records the real getMe/sendMessage HTTP calls.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import type { EmbeddedRunRequest } from "../../src/agents/embedded-runner.js";
import { createTelegramConnector } from "../telegram/connector/index.js";

import { makeFetchDouble, replyingRunner, type RecordedFetch } from "./harness.js";

const BOT_TOKEN = "123456:test-bot-token";

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

/** A real Telegram getUpdates `Update` carrying a direct text message. */
function telegramUpdate(): unknown {
  return {
    update_id: 1001,
    message: {
      message_id: 42,
      date: 1_700_000_000,
      chat: { id: 555, type: "private" },
      from: { id: 999, username: "alice", first_name: "Alice" },
      text: "what's the weather?",
    },
  };
}

function telegramRoutes(double: { calls: RecordedFetch[] }) {
  return [
    (call: RecordedFetch) =>
      call.url.endsWith("/getMe")
        ? { json: { ok: true, result: { id: 7, username: "recoder_bot", first_name: "Recoder" } } }
        : undefined,
    (call: RecordedFetch) =>
      call.url.endsWith("/sendMessage")
        ? { json: { ok: true, result: { message_id: 84, chat: { id: 555 } } } }
        : undefined,
  ];
}

describe("telegram dispatch (real adapter, fetch seam)", () => {
  it("routes a real Update through normalize -> gate -> runner -> real send()", async () => {
    const double = makeFetchDouble(telegramRoutes({ calls: [] }));
    const connector = createTelegramConnector({ fetchImpl: double.fetch, log: () => {} });

    // Learn the bot username so normalize() can do mention detection — this also
    // exercises the real getMe call through the doubled fetch.
    await connector.probe("default");

    const normalized = connector.normalize(telegramUpdate(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("telegram");
    expect(normalized?.text).toBe("what's the weather?");
    expect(normalized?.conversationId).toBe("555");
    expect(normalized?.sender.SenderUsername).toBe("alice");

    const registry = new ConnectorRegistry().register(connector);
    const seen: EmbeddedRunRequest[] = [];
    const runner = replyingRunner("It is sunny.", seen);

    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner,
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["alice"] }),
      agentRouter: () => ({ agentId: "weather-bot", sessionId: "tg-555" }),
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("It is sunny.");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["84"]);
    }

    // The runner received the real normalized prompt + routing.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.prompt).toBe("what's the weather?");
    expect(seen[0]?.agentId).toBe("weather-bot");

    // The reply hit the real Bot API sendMessage with the right chat + text.
    const sends = double.callsMatching("/sendMessage");
    expect(sends).toHaveLength(1);
    expect((sends[0]?.body as { chat_id?: unknown }).chat_id).toBe("555");
    expect((sends[0]?.body as { text?: unknown }).text).toBe("It is sunny.");
  });

  it("blocks a non-allowlisted sender at the gate and never sends", async () => {
    const double = makeFetchDouble(telegramRoutes({ calls: [] }));
    const connector = createTelegramConnector({ fetchImpl: double.fetch, log: () => {} });
    await connector.probe("default");

    const normalized = connector.normalize(telegramUpdate(), "default");
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("never sent"),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["someone-else"] }),
      agentRouter: () => ({ agentId: "a", sessionId: "s" }),
    });

    expect(outcome.status).toBe("blocked");
    expect(double.callsMatching("/sendMessage")).toHaveLength(0);
  });
});
