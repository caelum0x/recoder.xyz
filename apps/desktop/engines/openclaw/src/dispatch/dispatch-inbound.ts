// Owned by Recoder. The inbound -> gating -> embedded-agent -> outbound dispatch
// pipeline (interop §7.4). This is the dispatch half of @recoder/connectors: it
// fuses the trust boundary (`resolveGate`) with the embedded pi-agent runner and
// the outbound `ConnectorPort` into one auditable flow.
//
// Order of operations, hostile-by-default:
//   1. Build the gate input for the normalized inbound message (deployment policy).
//   2. Run `resolveGate`. A blocked message produces NO agent turn and NO send —
//      it returns a truthful `{ status: "blocked", reason }` outcome only.
//   3. Authorized messages drive one embedded agent turn via the `EmbeddedRunner`.
//   4. The collected reply is delivered through the registered `ConnectorPort`.
//
// The pipeline itself is pure orchestration: the gate is pure, the runner and
// the ports are injected. That keeps it unit-testable without any channel SDK or
// model call (see dispatch-inbound.test.ts), while the real wiring drives the
// genuine adapters + pi runner in production.

import type { ConnectorKind } from "../connector/connector-kind.js";
import type { NormalizedInboundMessage } from "../connector/inbound-message.js";
import type {
  OutboundMessage,
  OutboundTarget,
  SendResult,
} from "../connector/outbound-message.js";
import type {
  EmbeddedRunner,
  EmbeddedRunUsage,
} from "../agents/embedded-runner.js";
import { collectReplyText } from "../agents/pi-embedded-runner.js";
import { resolveGate, type GateDecision, type GateInput } from "../gating/index.js";

import type { ConnectorRegistry } from "./connector-registry.js";

/**
 * Deployment policy that turns a normalized inbound message into the pure
 * `GateInput` the trust boundary consumes. This is intentionally injected: the
 * allowlist decision, mention-detection capability, and command detection are
 * channel- and deployment-specific (who is allowed, which prefixes are control
 * commands, whether the channel can report mentions). The foundation owns the
 * *decision* (`resolveGate`); the integrator owns the *inputs*.
 */
export type GatePolicy = (
  message: NormalizedInboundMessage,
) => GateInput | Promise<GateInput>;

/**
 * Resolve the agent + session + model to run for an authorized inbound message.
 * Lets a deployment route different channels/conversations to different agents.
 */
export interface AgentRouting {
  readonly agentId: string;
  readonly sessionId: string;
  readonly model?: string;
}

/** Routes an authorized inbound message to the agent that should answer it. */
export type AgentRouter = (
  message: NormalizedInboundMessage,
) => AgentRouting | Promise<AgentRouting>;

/** Inputs to one `dispatchInbound` call. */
export interface DispatchDeps {
  /** Registry holding the outbound `ConnectorPort` per channel. */
  readonly registry: ConnectorRegistry;
  /** The embedded agent runner that produces the reply. */
  readonly runner: EmbeddedRunner;
  /** Maps the inbound message to its pure gate input. */
  readonly gatePolicy: GatePolicy;
  /** Routes the inbound message to an agent/session/model. */
  readonly agentRouter: AgentRouter;
  /** Optional abort signal cancelling the agent turn. */
  readonly signal?: AbortSignal;
}

/** The terminal outcome of dispatching one inbound message. */
export type DispatchOutcome =
  | {
      readonly status: "blocked";
      readonly decision: GateDecision;
      readonly reason: string;
    }
  | {
      readonly status: "empty";
      readonly decision: GateDecision;
      readonly reason: string;
    }
  | {
      readonly status: "delivered";
      readonly decision: GateDecision;
      readonly reply: string;
      readonly send: SendResult;
      readonly usage?: EmbeddedRunUsage;
    }
  | {
      readonly status: "error";
      readonly decision?: GateDecision;
      readonly reason: string;
    };

/** Build the wire-agnostic outbound target that replies to an inbound message. */
export function replyTargetFor(message: NormalizedInboundMessage): OutboundTarget {
  return {
    channel: message.channel,
    accountId: message.accountId,
    conversationId: message.conversationId,
    replyTo: message.messageId,
  };
}

/** Build the outbound message delivering `text` back to the inbound conversation. */
export function replyMessageFor(
  message: NormalizedInboundMessage,
  text: string,
): OutboundMessage {
  return {
    target: replyTargetFor(message),
    text,
  };
}

/**
 * Run one inbound message through the full pipeline. Never throws: every failure
 * mode is encoded in the returned `DispatchOutcome` so a caller's ingress loop
 * can log + continue without a try/catch and without faking success.
 */
export async function dispatchInbound(
  message: NormalizedInboundMessage,
  deps: DispatchDeps,
): Promise<DispatchOutcome> {
  // 1) Trust boundary. A blocked message produces no agent turn and no send.
  let decision: GateDecision;
  try {
    const gateInput = await deps.gatePolicy(message);
    decision = resolveGate(gateInput);
  } catch (err) {
    return {
      status: "error",
      reason: `gate policy failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (decision.blocked) {
    return {
      status: "blocked",
      decision,
      reason: decision.reason ?? "blocked by connector trust boundary",
    };
  }

  // 2) Resolve the outbound port up front so an unsupported channel is a truthful
  //    failure before we spend a model turn.
  const channel: ConnectorKind = message.channel;
  const port = deps.registry.get(channel);
  if (!port) {
    return {
      status: "error",
      decision,
      reason: `no connector registered for channel "${channel}"`,
    };
  }

  // 3) Route + run one embedded agent turn, folding the streamed text into a reply.
  let reply: string;
  let usage: EmbeddedRunUsage | undefined;
  try {
    const routing = await deps.agentRouter(message);
    const events = deps.runner.run({
      agentId: routing.agentId,
      sessionId: routing.sessionId,
      prompt: message.text,
      ...(routing.model ? { model: routing.model } : {}),
      ...(deps.signal ? { signal: deps.signal } : {}),
    });
    const collected = await collectReplyText(events);
    reply = collected.text;
    usage = collected.usage;
  } catch (err) {
    return {
      status: "error",
      decision,
      reason: `embedded agent turn failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // An empty reply is delivered as nothing — never a blank message to the channel.
  if (!reply.trim()) {
    return {
      status: "empty",
      decision,
      reason: "embedded agent produced no reply text",
    };
  }

  // 4) Deliver the reply through the registered connector port.
  try {
    const send = await port.send(replyMessageFor(message, reply));
    return usage
      ? { status: "delivered", decision, reply, send, usage }
      : { status: "delivered", decision, reply, send };
  } catch (err) {
    return {
      status: "error",
      decision,
      reason: `outbound send failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
