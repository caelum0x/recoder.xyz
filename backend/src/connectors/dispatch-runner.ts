/**
 * Embedded-agent dispatch behind the verified ingress.
 *
 * The connectors gateway has TWO inbound destinations for a gated message:
 *   1. CONDUCTOR dispatch (gateway.ts -> createWorkspace): a `/run …` style
 *      control command launches a real Conductor coding-agent workspace. This is
 *      the unchanged, proven path.
 *   2. EMBEDDED-AGENT dispatch (this module): a verified, normalized inbound
 *      message flows through the package's REAL `dispatchInbound` pipeline —
 *      normalize -> gate (allowlist/mention/command) -> embedded pi-agent runner
 *      -> `ConnectorPort.send` — and returns a truthful `DispatchOutcome`. This is
 *      the conversational reply path (answer the user in-channel) that complements
 *      the workspace-launch path.
 *
 * This module owns wiring #2. It is hostile-by-default and degrade-safe:
 *   - The trust boundary runs FIRST (inside `dispatchInbound`): a blocked message
 *     produces NO agent turn and NO send, only a truthful `blocked` outcome.
 *   - The embedded pi-agent runner is an OPTIONAL peer (ENOSPC-safe: the pi SDKs
 *     are not installed here). When no runner is configured, dispatch returns a
 *     truthful `{ kind: 'no-runner' }` outcome — the message was ACCEPTED past the
 *     gate but there is no embedded agent to answer it. That is NOT a fake
 *     success: nothing is sent, and the caller reports it honestly.
 *   - A signature-failed event never reaches here: the webhook ingress rejects it
 *     401 before any normalize/dispatch (see webhook-ingress.ts).
 *
 * The `ConnectorRegistry` is built from the gateway's already-built, configured
 * `ConnectorPort`s, so `dispatchInbound` delivers the reply over the SAME real
 * port the inbound arrived on — never a second transport.
 */
import {
  ConnectorRegistry,
  dispatchInbound,
  makeAllowlistGatePolicy,
  createPiEmbeddedRunner,
  type ConnectorPort,
  type ConnectorKind,
  type DispatchOutcome,
  type EmbeddedRunner,
  type GatePolicy,
  type NormalizedInboundMessage,
  type AgentRouting,
  readConnectorEnv,
} from '@recoder/connectors';
import { createLogger } from '../logger';
import type { GatingConfig } from './config.js';

const logger = createLogger('connectors:agent-dispatch');

/**
 * The result of running an inbound message through the embedded-agent dispatch.
 * Wraps the package's `DispatchOutcome` with a truthful degrade-safe variant for
 * the "no embedded runner configured" case (the message was accepted past the
 * gate, but there is no agent to answer — never reported as delivered).
 */
export type AgentDispatchResult =
  | { readonly kind: 'dispatched'; readonly outcome: DispatchOutcome }
  | { readonly kind: 'no-runner'; readonly reason: string }
  | { readonly kind: 'no-port'; readonly reason: string };

/** Source of the live, configured ports the registry delivers replies through. */
export interface PortSource {
  /** Built `ConnectorPort` for a configured channel, or null when unavailable. */
  getChannelPort(channel: string): ConnectorPort | null;
}

/**
 * Whether the embedded pi-agent runner is enabled for connector replies. Opt-in:
 * `RECODER_CONNECTORS_AGENT_ENABLED` (or `CONNECTORS_AGENT_ENABLED`) must be a
 * truthy flag, AND a default agent model must be resolvable (the runner needs a
 * model). Without the flag, dispatch stays in the truthful no-runner mode so an
 * operator never gets a silent (and uninstalled) pi-agent turn.
 */
export function isEmbeddedAgentEnabled(): boolean {
  const flag = (readConnectorEnv('AGENT_ENABLED') ?? process.env.CONNECTORS_AGENT_ENABLED ?? '')
    .trim()
    .toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

/** Resolve the default agent id used for connector reply turns. */
function resolveAgentId(): string {
  return (readConnectorEnv('AGENT_ID') ?? process.env.CONNECTORS_AGENT_ID ?? 'connector-reply').trim() || 'connector-reply';
}

/** Resolve the optional default model for the embedded reply agent. */
function resolveAgentModel(): string | undefined {
  const model = (readConnectorEnv('AGENT_MODEL') ?? process.env.CONNECTORS_AGENT_MODEL ?? '').trim();
  return model || undefined;
}

/**
 * Build the deployment `GatePolicy` for the embedded-agent dispatch from the
 * gateway's gating config. Mirrors the gateway's own gate inputs (allowlist,
 * requireMention) so both inbound destinations apply the SAME trust boundary.
 * Hostile-by-default: an empty allowlist (and no "*") authorizes nobody.
 */
export function buildGatePolicy(gating: GatingConfig): GatePolicy {
  return makeAllowlistGatePolicy({
    allowlist: gating.allowlist,
    requireMentionInGroups: gating.requireMention,
    // Direct messages still require an allowlist match unless "*" is set — we do
    // NOT silently open DMs (the gateway's Conductor path is equally strict).
    directMessagesAllowed: false,
    canDetectMention: true,
    // Treat `/`-prefixed text as a control command so command-gated deployments
    // match; the allowlist remains the authorization source.
    allowTextCommands: true,
    commandPrefixes: ['/'],
    useAccessGroups: false,
  });
}

/**
 * The embedded-agent dispatcher. Holds a lazily-built `EmbeddedRunner` (the real
 * pi-agent runner) and the gate policy, and runs the package's `dispatchInbound`
 * for a verified inbound message. Degrade-safe: when the embedded runner is not
 * enabled, it returns a truthful no-runner result without touching any model.
 */
export class ConnectorAgentDispatcher {
  private readonly ports: PortSource;
  private readonly gatePolicy: GatePolicy;
  private readonly enabled: boolean;
  private runner?: EmbeddedRunner;

  constructor(params: { ports: PortSource; gating: GatingConfig; runner?: EmbeddedRunner }) {
    this.ports = params.ports;
    this.gatePolicy = buildGatePolicy(params.gating);
    // An injected runner (tests / a host that wired pi) wins; otherwise the
    // runner is built lazily only when the embedded agent is enabled by env.
    this.runner = params.runner;
    this.enabled = Boolean(params.runner) || isEmbeddedAgentEnabled();
  }

  /** True when an embedded agent will actually answer (runner present/enabled). */
  get ready(): boolean {
    return this.enabled;
  }

  /** Build a one-channel `ConnectorRegistry` from the live configured port. */
  private registryFor(port: ConnectorPort): ConnectorRegistry {
    return new ConnectorRegistry().register(port);
  }

  /** Resolve (and cache) the real embedded pi-agent runner. */
  private resolveRunner(): EmbeddedRunner {
    if (this.runner) return this.runner;
    const model = resolveAgentModel();
    this.runner = createPiEmbeddedRunner(model ? { defaultModel: model } : {});
    return this.runner;
  }

  /**
   * Dispatch ONE verified, normalized inbound message through the package's real
   * normalize -> gate -> embedded-runner -> port.send pipeline. Never throws:
   * every failure mode is a truthful `AgentDispatchResult`.
   */
  async dispatch(message: NormalizedInboundMessage): Promise<AgentDispatchResult> {
    const channel = message.channel as ConnectorKind;
    const port = this.ports.getChannelPort(channel);
    if (!port) {
      return { kind: 'no-port', reason: `no live connector port for channel "${channel}"` };
    }

    if (!this.enabled) {
      // Truthful degrade-safe: accepted, but no embedded agent to answer. We do
      // NOT send anything and do NOT fake a delivered outcome.
      return {
        kind: 'no-runner',
        reason:
          'embedded agent runner not configured (set CONNECTORS_AGENT_ENABLED=true with the pi-agent peer SDKs to enable in-channel replies)',
      };
    }

    const agentId = resolveAgentId();
    const model = resolveAgentModel();
    const outcome = await dispatchInbound(message, {
      registry: this.registryFor(port),
      runner: this.resolveRunner(),
      gatePolicy: this.gatePolicy,
      agentRouter: (m): AgentRouting => ({
        agentId,
        // One conversation = one session so multi-turn context is preserved.
        sessionId: `${m.channel}:${m.accountId}:${m.conversationId}`,
        ...(model ? { model } : {}),
      }),
    });

    if (outcome.status === 'error') {
      logger.warn({ channel, reason: outcome.reason }, 'connectors embedded-agent dispatch error');
    }
    return { kind: 'dispatched', outcome };
  }
}
