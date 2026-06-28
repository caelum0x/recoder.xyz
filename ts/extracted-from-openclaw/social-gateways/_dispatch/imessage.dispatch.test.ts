// End-to-end dispatch test for the REAL iMessage ConnectorPort.
//
// Seam: the `imsg rpc` CLI binary (RECODER_IMESSAGE_CLI_PATH). The iMessage
// adapter's send() spawns `imsg rpc` and speaks line-delimited JSON-RPC 2.0 over
// stdin/stdout — that subprocess IS its true SDK seam. We point the binary at a
// faithful in-memory `imsg` daemon double (fixtures/fake-imsg.mjs) that speaks the
// exact protocol, feed a real `imsg` watch payload through the real
// normalizeIMessageEvent (via connector.normalize), register the real adapter,
// and run dispatchInbound so the gate -> embedded runner -> the adapter's real
// send() spawns the real RPC client and issues the real `send` request.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ConnectorRegistry, dispatchInbound, makeAllowlistGatePolicy } from "../../src/index.js";
import { createIMessageConnector } from "../imessage/adapter/index.js";

import { replyingRunner } from "./harness.js";

const FAKE_IMSG = fileURLToPath(new URL("./fixtures/fake-imsg.mjs", import.meta.url));

let workDir: string;
let sendLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "imsg-dispatch-"));
  sendLog = join(workDir, "sends.log");
  process.env.RECODER_IMESSAGE_CLI_PATH = FAKE_IMSG;
  process.env.FAKE_IMSG_LOG = sendLog;
});

afterEach(() => {
  delete process.env.RECODER_IMESSAGE_CLI_PATH;
  delete process.env.FAKE_IMSG_LOG;
  rmSync(workDir, { recursive: true, force: true });
});

/** A real `imsg` watch `message` row (direct message from a handle). */
function imessagePayload(): unknown {
  return {
    id: 4242,
    sender: "+15550001111",
    text: "ship it",
    is_from_me: false,
    is_group: false,
    created_at: "2026-01-01T00:00:00.000Z",
    attachments: [],
  };
}

function readSends(): Array<{ method: string; params: Record<string, unknown> }> {
  let raw = "";
  try {
    raw = readFileSync(sendLog, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { method: string; params: Record<string, unknown> });
}

describe("imessage dispatch (real adapter, imsg rpc subprocess seam)", () => {
  it("routes a real watch row through normalize -> gate -> runner -> real send()", async () => {
    const connector = createIMessageConnector();

    const normalized = connector.normalize(imessagePayload(), "default");
    expect(normalized).toBeDefined();
    expect(normalized?.channel).toBe("imessage");
    expect(normalized?.text).toBe("ship it");
    expect(normalized?.chatType).toBe("direct");
    expect(normalized?.conversationId).toBe("imessage:+15550001111");

    const registry = new ConnectorRegistry().register(connector);
    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("Shipped."),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+15550001111"] }),
      agentRouter: () => ({ agentId: "ship-bot", sessionId: "imsg-1" }),
    });

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Shipped.");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.send.messageIds).toEqual(["imsg-out-1"]);
    }

    // The reply drove the real `imsg` send RPC over the spawned subprocess.
    const sends = readSends();
    expect(sends).toHaveLength(1);
    expect(sends[0]?.method).toBe("send");
    expect(sends[0]?.params.text).toBe("Shipped.");
    expect(sends[0]?.params.to).toBe("+15550001111");
  });

  it("blocks a non-allowlisted sender and never spawns a send", async () => {
    const connector = createIMessageConnector();
    const normalized = connector.normalize(imessagePayload(), "default");
    const registry = new ConnectorRegistry().register(connector);

    const outcome = await dispatchInbound(normalized!, {
      registry,
      runner: replyingRunner("never"),
      gatePolicy: makeAllowlistGatePolicy({ allowlist: ["+19990000000"] }),
      agentRouter: () => ({ agentId: "a", sessionId: "s" }),
    });

    expect(outcome.status).toBe("blocked");
    expect(readSends()).toHaveLength(0);
  });
});
