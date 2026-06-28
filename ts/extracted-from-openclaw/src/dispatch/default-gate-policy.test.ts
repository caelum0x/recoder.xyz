import { describe, expect, it } from "vitest";

import type { NormalizedInboundMessage } from "../connector/inbound-message.js";
import { resolveGate, type GateDecision, type GateInput } from "../gating/index.js";

import {
  hasControlCommand,
  makeAllowlistGatePolicy,
  senderAllowlisted,
  type AllowlistGatePolicyOptions,
} from "./default-gate-policy.js";

/** Run the (synchronous) allowlist policy + gate for a message in one step. */
function decide(
  message: NormalizedInboundMessage,
  options: AllowlistGatePolicyOptions,
): GateDecision {
  const input = makeAllowlistGatePolicy(options)(message) as GateInput;
  return resolveGate(input);
}

function inbound(
  overrides: Partial<NormalizedInboundMessage> = {},
): NormalizedInboundMessage {
  return {
    channel: "telegram",
    accountId: "acct-1",
    messageId: "msg-1",
    conversationId: "conv-1",
    chatType: "direct",
    sender: { SenderId: "u-1", SenderUsername: "alice" },
    text: "hello there",
    wasMentioned: false,
    attachments: [],
    timestamp: 1_700_000_000_000,
    raw: null,
    ...overrides,
  };
}

describe("senderAllowlisted", () => {
  it("authorizes nobody when the allowlist is empty (hostile-by-default)", () => {
    expect(senderAllowlisted({ SenderId: "u-1" }, [])).toBe(false);
  });

  it("authorizes everyone on an explicit wildcard", () => {
    expect(senderAllowlisted({ SenderId: "u-1" }, ["*"])).toBe(true);
  });

  it("matches a sender by id, username, name, or E.164 case-insensitively", () => {
    expect(senderAllowlisted({ SenderId: "U-1" }, ["u-1"])).toBe(true);
    expect(senderAllowlisted({ SenderUsername: "Alice" }, ["alice"])).toBe(true);
    expect(senderAllowlisted({ SenderName: "Bob Jones" }, ["bob jones"])).toBe(true);
    expect(senderAllowlisted({ SenderE164: "+15550001111" }, ["+15550001111"])).toBe(true);
  });

  it("treats @handle and handle as the same principal", () => {
    expect(senderAllowlisted({ SenderUsername: "alice" }, ["@alice"])).toBe(true);
    expect(senderAllowlisted({ SenderId: "@alice" }, ["alice"])).toBe(true);
  });

  it("rejects a sender that matches no entry", () => {
    expect(senderAllowlisted({ SenderId: "u-2" }, ["u-1", "alice"])).toBe(false);
  });
});

describe("hasControlCommand", () => {
  it("detects a configured prefix followed by a command", () => {
    expect(hasControlCommand("/reset now", ["/"])).toBe(true);
    expect(hasControlCommand("!stop", ["/", "!"])).toBe(true);
  });

  it("does not treat a bare prefix or plain text as a command", () => {
    expect(hasControlCommand("/", ["/"])).toBe(false);
    expect(hasControlCommand("hello /reset", ["/"])).toBe(false);
    expect(hasControlCommand("", ["/"])).toBe(false);
  });
});

describe("makeAllowlistGatePolicy", () => {
  it("blocks an unlisted direct sender by default and never authorizes", () => {
    const decision = decide(inbound(), { allowlist: ["u-9"] });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("sender not on allowlist");
  });

  it("authorizes an allowlisted direct sender", () => {
    const decision = decide(inbound(), { allowlist: ["alice"] });
    expect(decision.blocked).toBe(false);
  });

  it("authorizes any unlisted DM when directMessagesAllowed is set", () => {
    const decision = decide(inbound({ sender: { SenderId: "stranger" } }), {
      directMessagesAllowed: true,
    });
    expect(decision.blocked).toBe(false);
  });

  it("still requires an allowlist match for groups even with directMessagesAllowed", () => {
    const decision = decide(
      inbound({ chatType: "group", wasMentioned: true, sender: { SenderId: "stranger" } }),
      { directMessagesAllowed: true },
    );
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("sender not on allowlist");
  });

  it("requires a mention in groups by default and blocks when absent", () => {
    const decision = decide(inbound({ chatType: "group", wasMentioned: false }), {
      allowlist: ["alice"],
    });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("mention required but not present");
  });

  it("admits an allowlisted, mentioned group message", () => {
    const decision = decide(inbound({ chatType: "group", wasMentioned: true }), {
      allowlist: ["alice"],
    });
    expect(decision.blocked).toBe(false);
  });

  it("blocks a control command from a DM-admitted sender who is not a command authorizer", () => {
    // The sender clears ingress only via the DM opt-in (not an allowlist match),
    // so under access groups they are NOT a configured command authorizer and the
    // command gate blocks the control command.
    const decision = decide(inbound({ text: "/reset", sender: { SenderId: "stranger" } }), {
      directMessagesAllowed: true,
      allowTextCommands: true,
      commandPrefixes: ["/"],
      useAccessGroups: true,
    });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("control command not authorized");
  });

  it("authorizes a control command from a wildcard-allowlisted sender", () => {
    // The wildcard authorizes every sender as a command authorizer too.
    const decision = decide(inbound({ text: "/reset" }), {
      allowlist: ["*"],
      allowTextCommands: true,
      commandPrefixes: ["/"],
      useAccessGroups: true,
    });
    expect(decision.blocked).toBe(false);
    expect(decision.commandAuthorized).toBe(true);
  });

  it("authorizes a control command from an explicitly allowlisted sender", () => {
    const decision = decide(inbound({ text: "/reset" }), {
      allowlist: ["alice"],
      allowTextCommands: true,
      commandPrefixes: ["/"],
      useAccessGroups: true,
    });
    expect(decision.blocked).toBe(false);
    expect(decision.commandAuthorized).toBe(true);
  });
});
