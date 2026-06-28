import type { ExternalMcpServerConfig } from "./external-server-config";
import {
  StdioMcpClient,
  type StdioMcpTransport,
  type StdioServerState,
} from "./stdio-client";
import type { McpServerRegistration } from "../registry/registry";

/**
 * Supervises EXTERNAL stdio MCP server processes — lazy start, health, idle
 * stop. One manager owns the lifecycle of every configured external server (the
 * Python `pal-mcp-server`, project-scoped stdio servers, ...). It is the only
 * place a process is spawned; the host calls *through* it so every external tool
 * call still passes the authorize→risk→policy→audit gate before it reaches a
 * supervised process.
 *
 * Degrade-safe: a server whose executable is absent is supervised in the
 * `unavailable` state and reports truthful unhealthy — it is never hidden or
 * faked as ready.
 */

/** A health snapshot for one supervised external server. */
export interface ExternalServerHealth {
  readonly serverId: string;
  readonly state: StdioServerState;
  /** True only when the process is actually started and handshake-ready. */
  readonly healthy: boolean;
  /** Truthful reason when not healthy (executable missing, start error, ...). */
  readonly detail?: string;
}

/** Factory port so tests can inject a fake transport without spawning a process. */
export type TransportFactory = (config: ExternalMcpServerConfig) => StdioMcpTransport;

const defaultTransportFactory: TransportFactory = (config) =>
  new StdioMcpClient(config);

export class ExternalMcpProcessManager {
  private readonly configs = new Map<string, ExternalMcpServerConfig>();
  private readonly transports = new Map<string, StdioMcpTransport>();
  private readonly lastUsedAt = new Map<string, number>();

  constructor(private readonly makeTransport: TransportFactory = defaultTransportFactory) {}

  /** Declare a supervised server. Does NOT start it (lazy). */
  register(config: ExternalMcpServerConfig): void {
    this.configs.set(config.serverId, config);
  }

  /** All registered external configs. */
  list(): ExternalMcpServerConfig[] {
    return [...this.configs.values()];
  }

  /**
   * Derive the trusted `McpServerRegistration` for an external config so it can
   * be added to the catalog-gated registry. The `toolNames` allowlist is copied
   * from the trusted config — the server cannot widen it.
   */
  toRegistration(serverId: string): McpServerRegistration | null {
    const config = this.configs.get(serverId);
    if (!config) return null;
    return {
      serverId: config.serverId,
      kind: config.kind,
      displayName: config.displayName,
      transport: "stdio",
      enabled: true,
      toolNames: [...config.toolNames],
      metadata: { external: true, command: config.command },
    };
  }

  /** Lazily start a server and return its transport (or the unavailable one). */
  async ensureStarted(serverId: string): Promise<StdioMcpTransport | null> {
    const config = this.configs.get(serverId);
    if (!config) return null;
    let transport = this.transports.get(serverId);
    if (!transport) {
      transport = this.makeTransport(config);
      this.transports.set(serverId, transport);
    }
    if (transport.state !== "ready") {
      await transport.start();
    }
    this.lastUsedAt.set(serverId, Date.now());
    return transport;
  }

  /** Truthful health snapshot. Reflects real process state, never a guess. */
  health(serverId: string): ExternalServerHealth {
    const config = this.configs.get(serverId);
    if (!config) {
      return { serverId, state: "stopped", healthy: false, detail: "Not registered." };
    }
    const transport = this.transports.get(serverId);
    if (!transport) {
      return {
        serverId,
        state: "stopped",
        healthy: false,
        detail: "Not started yet (lazy).",
      };
    }
    const healthy = transport.state === "ready";
    const detail =
      transport instanceof StdioMcpClient && !healthy
        ? transport.lastStartError ?? `State: ${transport.state}`
        : undefined;
    return { serverId, state: transport.state, healthy, detail };
  }

  /** Health for every supervised server. */
  healthAll(): ExternalServerHealth[] {
    return [...this.configs.keys()].map((id) => this.health(id));
  }

  /** Stop servers idle past their TTL (TTL 0 = never idle-stop). */
  reapIdle(now: number = Date.now()): string[] {
    const stopped: string[] = [];
    for (const [serverId, config] of this.configs) {
      if (config.idleTtlMs <= 0) continue;
      const transport = this.transports.get(serverId);
      if (!transport || transport.state !== "ready") continue;
      const last = this.lastUsedAt.get(serverId) ?? 0;
      if (now - last >= config.idleTtlMs) {
        transport.stop();
        stopped.push(serverId);
      }
    }
    return stopped;
  }

  /** Stop one server. */
  stop(serverId: string): void {
    this.transports.get(serverId)?.stop();
  }

  /** Stop every supervised server (shutdown). */
  stopAll(): void {
    for (const transport of this.transports.values()) {
      transport.stop();
    }
  }
}
