import { describe, expect, it } from "vitest";

import type { ConnectorPort } from "../connector/connector-port.js";
import type { NormalizedInboundMessage } from "../connector/inbound-message.js";
import type {
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../connector/outbound-message.js";
import type {
  EmbeddedRunEvent,
  EmbeddedRunRequest,
  EmbeddedRunner,
} from "../agents/embedded-runner.js";
import type { GateInput } from "../gating/index.js";

import { ConnectorRegistry } from "./connector-registry.js";
import {
  dispatchInbound,
  replyTargetFor,
  type AgentRouter,
  type DispatchDeps,
  type GatePolicy,
} from "./dispatch-inbound.js";

// --- Pure test doubles (no channel SDK, no model call) ------------------------

/** A ConnectorPort double that records the outbound messages it is asked to send. */
class FakePort implements ConnectorPort {
  readonly kind = "telegram" as const;
  readonly sent: OutboundMessage[] = [];
  private readonly result: SendResult;
  private readonly failWith?: Error;

  constructor(opts: { result?: SendResult; failWith?: Error } = {}) {
    this.result = opts.result ?? { delivered: true, messageIds: ["m-1"] };
    this.failWith = opts.failWith;
  }

  async monitor(): Promise<{ stop(): Promise<void> }> {
    return { stop: async () => {} };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.sent.push(message);
    return this.result;
  }

  async probe(accountId: string) {
    return { channel: this.kind, accountId, ready: true, checkedAt: Date.now() };
  }

  normalize(): NormalizedInboundMessage | undefined {
    return undefined;
  }

  async react(_request: ReactionRequest): Promise<boolean> {
    return false;
  }
}

/** An EmbeddedRunner double that yields a fixed script of events. */
function scriptedRunner(events: EmbeddedRunEvent[]): EmbeddedRunner {
  return {
    run(_request: EmbeddedRunRequest): AsyncIterable<EmbeddedRunEvent> {
      async function* gen() {
        for (const ev of events) {
          yield ev;
        }
      }
      return gen();
    },
  };
}

/** An EmbeddedRunner double that records the request it received. */
function recordingRunner(events: EmbeddedRunEvent[], sink: EmbeddedRunRequest[]): EmbeddedRunner {
  return {
    run(request: EmbeddedRunRequest): AsyncIterable<EmbeddedRunEvent> {
      sink.push(request);
      async function* gen() {
        for (const ev of events) {
          yield ev;
        }
      }
      return gen();
    },
  };
}

function inbound(overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    channel: "telegram",
    accountId: "acct-1",
    messageId: "msg-1",
    conversationId: "conv-1",
    chatType: "direct",
    sender: { SenderId: "u-1" },
    text: "hello there",
    wasMentioned: false,
    attachments: [],
    timestamp: 1_700_000_000_000,
    raw: null,
    ...overrides,
  };
}

const allowAllGate: GatePolicy = (): GateInput => ({
  allowlisted: true,
  isGroup: false,
  requireMention: false,
  canDetectMention: true,
  wasMentioned: false,
  allowTextCommands: false,
  hasControlCommand: false,
  useAccessGroups: false,
  authorizers: [],
});

const denyGate: GatePolicy = (): GateInput => ({
  allowlisted: false,
  isGroup: false,
  requireMention: false,
  canDetectMention: true,
  wasMentioned: false,
  allowTextCommands: false,
  hasControlCommand: false,
  useAccessGroups: false,
  authorizers: [],
});

const fixedRouter: AgentRouter = () => ({ agentId: "agent-1", sessionId: "sess-1" });

function depsWith(
  port: FakePort,
  runner: EmbeddedRunner,
  gatePolicy: GatePolicy,
): DispatchDeps {
  const registry = new ConnectorRegistry().register(port);
  return { registry, runner, gatePolicy, agentRouter: fixedRouter };
}

// --- Tests --------------------------------------------------------------------

describe("dispatchInbound", () => {
  it("blocks at the trust boundary and never runs the agent or sends", async () => {
    const port = new FakePort();
    let ran = false;
    const runner: EmbeddedRunner = {
      run() {
        ran = true;
        return scriptedRunner([]).run({ agentId: "", sessionId: "", prompt: "" });
      },
    };
    const outcome = await dispatchInbound(inbound(), depsWith(port, runner, denyGate));

    expect(outcome.status).toBe("blocked");
    if (outcome.status === "blocked") {
      expect(outcome.reason).toBe("sender not on allowlist");
      expect(outcome.decision.blocked).toBe(true);
    }
    expect(ran).toBe(false);
    expect(port.sent).toHaveLength(0);
  });

  it("runs the agent and delivers the collected reply on an authorized message", async () => {
    const port = new FakePort();
    const runner = scriptedRunner([
      { type: "text", text: "Hi " },
      { type: "text", text: "there!" },
      { type: "done", usage: { inputTokens: 10, outputTokens: 4 } },
    ]);
    const outcome = await dispatchInbound(inbound(), depsWith(port, runner, allowAllGate));

    expect(outcome.status).toBe("delivered");
    if (outcome.status === "delivered") {
      expect(outcome.reply).toBe("Hi there!");
      expect(outcome.send.delivered).toBe(true);
      expect(outcome.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
    }
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0]?.text).toBe("Hi there!");
    expect(port.sent[0]?.target).toEqual(replyTargetFor(inbound()));
  });

  it("forwards the inbound text + routing into the runner request", async () => {
    const port = new FakePort();
    const seen: EmbeddedRunRequest[] = [];
    const runner = recordingRunner(
      [{ type: "text", text: "ok" }, { type: "done" }],
      seen,
    );
    const deps: DispatchDeps = {
      registry: new ConnectorRegistry().register(port),
      runner,
      gatePolicy: allowAllGate,
      agentRouter: () => ({ agentId: "a-9", sessionId: "s-9", model: "anthropic:m" }),
    };
    await dispatchInbound(inbound({ text: "do the thing" }), deps);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.prompt).toBe("do the thing");
    expect(seen[0]?.agentId).toBe("a-9");
    expect(seen[0]?.sessionId).toBe("s-9");
    expect(seen[0]?.model).toBe("anthropic:m");
  });

  it("reports an empty outcome (no blank send) when the agent yields no text", async () => {
    const port = new FakePort();
    const runner = scriptedRunner([{ type: "done" }]);
    const outcome = await dispatchInbound(inbound(), depsWith(port, runner, allowAllGate));

    expect(outcome.status).toBe("empty");
    expect(port.sent).toHaveLength(0);
  });

  it("surfaces a runner error event as an error outcome and does not send", async () => {
    const port = new FakePort();
    const runner = scriptedRunner([
      { type: "error", message: "model unavailable" },
      { type: "done" },
    ]);
    const outcome = await dispatchInbound(inbound(), depsWith(port, runner, allowAllGate));

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.reason).toContain("model unavailable");
    }
    expect(port.sent).toHaveLength(0);
  });

  it("fails truthfully when no connector is registered for the channel", async () => {
    const runner = scriptedRunner([{ type: "text", text: "hi" }, { type: "done" }]);
    const deps: DispatchDeps = {
      registry: new ConnectorRegistry(), // empty
      runner,
      gatePolicy: allowAllGate,
      agentRouter: fixedRouter,
    };
    const outcome = await dispatchInbound(inbound(), deps);

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.reason).toContain('no connector registered for channel "telegram"');
    }
  });

  it("encodes an outbound send failure as an error outcome, not a throw", async () => {
    const port = new FakePort({ failWith: new Error("network down") });
    const runner = scriptedRunner([{ type: "text", text: "hi" }, { type: "done" }]);
    const outcome = await dispatchInbound(inbound(), depsWith(port, runner, allowAllGate));

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.reason).toContain("network down");
    }
  });
});

describe("ConnectorRegistry", () => {
  it("registers, looks up, and unregisters ports by kind", () => {
    const port = new FakePort();
    const registry = new ConnectorRegistry().register(port);
    expect(registry.has("telegram")).toBe(true);
    expect(registry.get("telegram")).toBe(port);
    expect(registry.kinds()).toEqual(["telegram"]);
    expect(registry.unregister("telegram")).toBe(true);
    expect(registry.has("telegram")).toBe(false);
  });
});
