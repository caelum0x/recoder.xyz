// Owned by Recoder. The connector registry: a small, explicit lookup from a
// `ConnectorKind` to the live `ConnectorPort` that speaks that channel. The
// dispatch pipeline uses it to find the outbound port for a reply. Keeping this
// a plain map (not a service locator) preserves explicit control flow — a
// channel with no registered port is a truthful "unsupported", never a silent
// drop dressed up as success.

import type { ConnectorKind } from "../connector/connector-kind.js";
import type { ConnectorPort } from "../connector/connector-port.js";

/** A registry of live connector ports keyed by channel. */
export class ConnectorRegistry {
  private readonly ports = new Map<ConnectorKind, ConnectorPort>();

  /** Register (or replace) the port for a channel. */
  register(port: ConnectorPort): this {
    this.ports.set(port.kind, port);
    return this;
  }

  /** Remove the port for a channel. Returns true when one was removed. */
  unregister(kind: ConnectorKind): boolean {
    return this.ports.delete(kind);
  }

  /** Look up the port for a channel, or undefined when none is registered. */
  get(kind: ConnectorKind): ConnectorPort | undefined {
    return this.ports.get(kind);
  }

  /** True when a port is registered for the channel. */
  has(kind: ConnectorKind): boolean {
    return this.ports.has(kind);
  }

  /** All registered channels, in insertion order. */
  kinds(): ConnectorKind[] {
    return [...this.ports.keys()];
  }
}
