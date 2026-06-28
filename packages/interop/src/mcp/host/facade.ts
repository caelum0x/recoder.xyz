import { InteropMcpHost, type InteropMcpHostOptions } from "./host";
import { ExternalMcpProcessManager } from "../external/process-manager";
import type { ExternalMcpServerConfig } from "../external/external-server-config";
import type { McpToolCallInput } from "@recoder/agent-mcp";
import type { HostCallOutcome } from "./host";

/**
 * `McpHost` — the public facade that composes the in-proc gated host with the
 * external-process supervisor into one entry point for consumers (e.g.
 * docker-backend's thin MCP routes).
 *
 * One object owns: the catalog-gated registry, the authorize→risk→policy→audit
 * call gate, per-agent sessions, AND the supervised external stdio servers (the
 * Python `pal-mcp-server`, project servers). An external server is registered
 * into the SAME registry as in-proc servers, so its tool calls traverse the
 * identical permission gate before the process is ever touched.
 *
 * Fail-safe: registering an external server whose process is absent succeeds (it
 * shows in the registry + reports unhealthy) — the facade never fakes a running
 * server.
 */
export class McpHost {
  private readonly host: InteropMcpHost;
  readonly external: ExternalMcpProcessManager;

  constructor(
    options: InteropMcpHostOptions = {},
    externalManager: ExternalMcpProcessManager = new ExternalMcpProcessManager(),
  ) {
    this.host = new InteropMcpHost(options);
    this.external = externalManager;
  }

  /** The catalog-gated registry (in-proc + external servers). */
  get registry() {
    return this.host.registry;
  }

  /** Per-agent MCP session tracking. */
  get sessions() {
    return this.host.sessions;
  }

  /**
   * Register a supervised external stdio server (e.g. pal-mcp-server). The
   * trusted registration (allowlisted tool names) is added to the registry; the
   * process is NOT started here (lazy). Returns false if the registration could
   * not be derived (unknown server).
   */
  registerExternalServer(config: ExternalMcpServerConfig): boolean {
    this.external.register(config);
    const registration = this.external.toRegistration(config.serverId);
    if (!registration) return false;
    this.registry.register(registration);
    return true;
  }

  /** AUTHORIZE only (pure decision), no execution. */
  authorize(input: McpToolCallInput) {
    return this.host.authorize(input);
  }

  /** Full gated call (authorize→risk→execute→audit). */
  call(input: McpToolCallInput): Promise<HostCallOutcome> {
    return this.host.call(input);
  }

  /** Truthful health for every supervised external server. */
  externalHealth() {
    return this.external.healthAll();
  }
}
