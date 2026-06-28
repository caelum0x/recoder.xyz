import {
  McpRegistry as BaseMcpRegistry,
  type McpServerRegistration,
} from "@recoder/agent-mcp";
import {
  validateToolCatalog,
  type CatalogValidationResult,
} from "./catalog-validator";
import type { ToolDescriptor } from "./tool-descriptor";

/**
 * `McpRegistry` — interop's owned registry, composing `@recoder/agent-mcp`'s
 * `McpRegistry` for server bookkeeping and layering the hostile-by-default
 * catalog gate on top.
 *
 * The base registry tracks `McpServerRegistration` records (serverId, kind,
 * transport, the trusted `toolNames` allowlist). This wrapper adds the missing
 * trust boundary: when a server advertises its tool descriptors over the wire,
 * `ingestAdvertisedCatalog` runs every descriptor through `validateToolCatalog`
 * before anything is exposed — AND cross-checks each advertised tool against the
 * server's registered `toolNames`, so a server cannot smuggle in a tool it was
 * never registered to expose (the registration is the source of truth, not the
 * server's self-description).
 */
export class McpRegistry {
  private readonly base = new BaseMcpRegistry();
  /** Per-server validated, allowlisted descriptors. Never the raw wire data. */
  private readonly catalogs = new Map<string, ToolDescriptor[]>();

  /** Register (or replace) a server. The registration is trusted control-plane state. */
  register(server: McpServerRegistration): McpServerRegistration {
    return this.base.register(server);
  }

  list(): McpServerRegistration[] {
    return this.base.list();
  }

  get(serverId: string): McpServerRegistration | null {
    return this.base.get(serverId);
  }

  /**
   * Ingest a server's UNTRUSTED advertised tool catalog. Validates shape +
   * sanitizes content, then keeps only descriptors whose name appears in the
   * server's registered `toolNames` allowlist. Returns the full validation
   * result (accepted + rejected) so callers can audit what a server tried to
   * advertise that it was not allowed to.
   */
  ingestAdvertisedCatalog(
    serverId: string,
    advertised: unknown,
  ): CatalogValidationResult & { unregistered: string[] } {
    const server = this.base.get(serverId);
    const validated = validateToolCatalog(advertised);

    if (!server) {
      // An unknown server cannot expose anything. Everything is "unregistered".
      return {
        accepted: [],
        rejected: validated.rejected,
        unregistered: validated.accepted.map((d) => d.name),
      };
    }

    const allowlist = new Set(server.toolNames);
    const exposed: ToolDescriptor[] = [];
    const unregistered: string[] = [];
    for (const descriptor of validated.accepted) {
      if (allowlist.has(descriptor.name)) {
        exposed.push(descriptor);
      } else {
        unregistered.push(descriptor.name);
      }
    }

    this.catalogs.set(serverId, exposed);
    return { accepted: exposed, rejected: validated.rejected, unregistered };
  }

  /** The validated, allowlisted descriptors safe to expose for a server. */
  exposedTools(serverId: string): ToolDescriptor[] {
    return this.catalogs.get(serverId) ?? [];
  }
}

export type { McpServerRegistration, McpServerKind } from "@recoder/agent-mcp";
