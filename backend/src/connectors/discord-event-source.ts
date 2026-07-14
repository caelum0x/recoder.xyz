/**
 * Discord gateway-WS ingress seam.
 *
 * Discord is the one bridged channel whose live inbound is NEITHER a long-poll
 * NOR an HTTP webhook: it arrives over the Discord gateway WebSocket. The
 * @recoder/connectors Discord adapter consumes that stream through an injected
 * `DiscordEventSource` (the carbon `GatewayPlugin` bridge a host wires) — it
 * deliberately does NOT pull the gateway client itself, so the connectors
 * backend stays free of the heavy `@buape/carbon` SDK graph (ENOSPC-safe) until
 * an operator wires a real source.
 *
 * This module is that wiring point. It holds an OPTIONAL host-registered event
 * source factory. Until a host registers one (with a real carbon GatewayPlugin
 * bridge), `resolveDiscordEventSource()` returns undefined, the adapter is built
 * WITHOUT a `monitor()` ingress, and health reports discord truthfully as
 * configured-but-not-live (`requiresExternal`, no fake running gateway). The
 * adapter's `send()` / `probe()` / `normalize()` / `react()` still work over the
 * real Discord REST v10 wire — only the gateway-WS ingress is gated on a source.
 */
import type { ConnectorPort } from '@recoder/connectors';

/**
 * A host-owned Discord gateway-WS event source. Structurally compatible with the
 * adapter's `DiscordEventSource` (subscribe(accountId, onEvent) -> unsubscribe).
 * Typed via the adapter subpath's own export shape at the wiring site; kept as a
 * minimal local contract here so this module imports no optional SDK.
 */
export interface HostDiscordEventSource {
  subscribe(
    accountId: string,
    onEvent: (event: unknown) => void | Promise<void>,
  ):
    | Promise<{ unsubscribe(): void | Promise<void> }>
    | { unsubscribe(): void | Promise<void> };
}

/** Factory the host registers to supply the live carbon gateway-WS bridge. */
export type DiscordEventSourceFactory = () => HostDiscordEventSource;

let registered: DiscordEventSourceFactory | undefined;

/**
 * Register the live Discord gateway-WS event source factory (the carbon
 * GatewayPlugin bridge). Called by a host that has the optional `@buape/carbon`
 * SDK installed and a running gateway connection. Returns an unregister fn so a
 * shutdown/test can restore the inert (no-source) state. Idempotent-by-replace.
 */
export function registerDiscordEventSource(
  factory: DiscordEventSourceFactory,
): () => void {
  const prev = registered;
  registered = factory;
  return () => {
    registered = prev;
  };
}

/**
 * Resolve the host-registered Discord gateway-WS event source, or undefined when
 * none is wired. Undefined is the truthful degrade-safe default: the adapter is
 * then built without ingress and `monitor()` surfaces a real "ingress not
 * configured" error rather than a faked live gateway.
 */
export function resolveDiscordEventSource(): HostDiscordEventSource | undefined {
  if (!registered) return undefined;
  try {
    return registered();
  } catch {
    // A source factory that throws is treated as "no live source" — truthful
    // unavailability, never a crash into the adapter build.
    return undefined;
  }
}

/** True when a host has wired a live Discord gateway-WS event source. */
export function hasDiscordEventSource(): boolean {
  return Boolean(registered);
}

/** Re-export the port type so wiring code can annotate without a second import. */
export type { ConnectorPort };
