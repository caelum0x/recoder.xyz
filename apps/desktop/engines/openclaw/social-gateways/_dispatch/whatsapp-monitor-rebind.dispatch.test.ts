// Regression guard for the WhatsApp ConnectorPort monitor's self-identity
// (re)binding on SSE reconnect.
//
// The silent-drop window: #bindSelfIdentity used to run ONCE at monitor()
// startup behind a permanent has()-based early-exit. If the bridge was
// unreachable AT THAT MOMENT, the self JID never bound and was never retried, so
// group-mention gating stayed fail-closed and every group message was dropped
// for the monitor's whole lifetime with no operator signal. The fix rebinds
// before EVERY SSE (re)connect (via onBeforeConnect) until it succeeds, and
// surfaces an observable warning while it stays unresolved.
//
// Seam: the whatsapp transport module — whatsappCheck (the bridge /status probe
// that yields the linked self JID) and streamWhatsAppEvents (the SSE ingress).
// We double ONLY that seam, so the REAL WhatsAppConnector + the REAL
// runWhatsAppSseLoop reconnect/backoff loop run unmodified.

import { afterEach, describe, expect, it, vi } from "vitest";

const transportMocks = vi.hoisted(() => ({
  whatsappCheck: vi.fn(),
  streamWhatsAppEvents: vi.fn(),
}));

vi.mock("../whatsapp/adapter/transport.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../whatsapp/adapter/transport.js")>();
  return {
    ...actual,
    whatsappCheck: transportMocks.whatsappCheck as unknown as typeof actual.whatsappCheck,
    streamWhatsAppEvents:
      transportMocks.streamWhatsAppEvents as unknown as typeof actual.streamWhatsAppEvents,
  };
});

import type { NormalizedInboundMessage } from "../../src/connector/inbound-message.js";
import type { WhatsAppSseEvent } from "../whatsapp/adapter/transport.js";
import { createWhatsAppConnector } from "../whatsapp/adapter/index.js";

/** The linked account's REAL self JID as the bridge status endpoint reports it. */
const SELF_JID = "15559999999:11@s.whatsapp.net";

/**
 * A real WhatsApp Web group `message` frame whose contextInfo mentions the bot's
 * self phone ("15559999999@s.whatsapp.net"); the bound self JID is the
 * device-suffixed SELF_JID and the phone match is what resolves it.
 */
function groupMentionFrame(): unknown {
  return {
    key: {
      remoteJid: "120363000000000000@g.us",
      participant: "15550001111@s.whatsapp.net",
      id: "WAMSG-GRP-REBIND",
      fromMe: false,
    },
    message: {
      extendedTextMessage: {
        text: "@bot deploy please",
        contextInfo: { mentionedJid: ["15559999999@s.whatsapp.net"] },
      },
    },
    messageTimestamp: 1_700_000_100,
    pushName: "Alice",
  };
}

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  transportMocks.whatsappCheck.mockReset();
  transportMocks.streamWhatsAppEvents.mockReset();
});

describe("whatsapp monitor self-identity rebind on SSE reconnect", () => {
  it("recovers a failed first bind on reconnect and stops dropping group mentions", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // The bridge is unreachable on the FIRST bind, then reachable afterwards.
    transportMocks.whatsappCheck
      .mockResolvedValueOnce({ ok: false, status: null, error: "unreachable" })
      .mockResolvedValue({
        ok: true,
        status: 200,
        error: null,
        linked: true,
        connected: true,
        selfJid: SELF_JID,
      });

    let connectCount = 0;
    let liveOnEvent: ((event: WhatsAppSseEvent) => void) | undefined;
    transportMocks.streamWhatsAppEvents.mockImplementation(
      async (params: {
        onEvent: (event: WhatsAppSseEvent) => void;
        abortSignal?: AbortSignal;
      }): Promise<void> => {
        connectCount += 1;
        if (connectCount === 1) {
          // First connect ends immediately -> the loop schedules a reconnect.
          return;
        }
        // Second (and later) connect stays open until aborted, exposing onEvent.
        liveOnEvent = params.onEvent;
        await new Promise<void>((resolve) => {
          if (params.abortSignal?.aborted) {
            resolve();
            return;
          }
          params.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    );

    const connector = createWhatsAppConnector();
    const received: NormalizedInboundMessage[] = [];
    const handle = await connector.monitor("default", (msg) => {
      received.push(msg);
    });

    // First connect: bind attempted while unreachable -> self identity unresolved.
    await flushMicrotasks();
    expect(transportMocks.whatsappCheck).toHaveBeenCalledTimes(1);
    // The silent-drop window is now OBSERVABLE (never silent).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("group-mention gating is fail-closed");
    // Fail-closed: with no bound self, a self-mention group frame is NOT a mention.
    expect(connector.normalize(groupMentionFrame(), "default")?.wasMentioned).toBe(false);

    // Advance past the reconnect backoff -> the second connect rebinds the self JID.
    await vi.advanceTimersByTimeAsync(1_500);
    await flushMicrotasks();
    expect(transportMocks.whatsappCheck).toHaveBeenCalledTimes(2);
    expect(connectCount).toBe(2);
    // No further warning once the identity resolves.
    expect(warn).toHaveBeenCalledTimes(1);

    // The window is CLOSED: the same self-mention frame now resolves as a mention.
    expect(connector.normalize(groupMentionFrame(), "default")?.wasMentioned).toBe(true);

    // A live group-mention frame on the reconnected stream is delivered (not dropped).
    expect(liveOnEvent).toBeTypeOf("function");
    liveOnEvent?.({ event: "message", data: JSON.stringify(groupMentionFrame()) });
    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(received[0]?.chatType).toBe("group");
    expect(received[0]?.wasMentioned).toBe(true);

    await handle.stop();
    await flushMicrotasks();
  });
});
