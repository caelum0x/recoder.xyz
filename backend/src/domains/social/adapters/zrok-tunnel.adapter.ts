/**
 * `zrok-tunnel.adapter` — the {@link PublicTunnelPort} implementation for NAT
 * webhook exposure. Push channels (LINE / Slack HTTP Events) need a reachable
 * public URL; this adapter fronts a local webhook path with a zrok share.
 *
 * DEGRADE-SAFE by construction (this is a NAT convenience, never a hard dep):
 *   - zrok disabled / no share name        ⇒ `ensurePublicUrl` resolves `null`;
 *   - a static `publicBaseUrl` configured   ⇒ returns `<base><path>` (already-open
 *     reserved share — no process spawned);
 *   - an injected `opener` seam present     ⇒ opens the share and returns its URL,
 *     swallowing faults to `null`.
 * It NEVER throws and NEVER fabricates a URL that is not actually reachable.
 */
import type { PublicTunnelPort } from '../ports/tunnel.port.js';

/** Opens (or reuses) a zrok share fronting a local path → its public URL. */
export interface ZrokOpener {
  open(path: string, shareName: string): Promise<string | null>;
}

export interface ZrokTunnelDeps {
  /** Whether the tunnel is enabled (from `SocialConfig.zrok.enabled`). */
  readonly enabled: boolean;
  /** zrok reserved-share name; `null` ⇒ tunnel `down` (degrade-safe). */
  readonly shareName: string | null;
  /** A pre-opened reserved public base URL (e.g. `https://xxx.share.zrok.io`). */
  readonly publicBaseUrl?: string | null;
  /** Optional live opener seam (spawns/reuses the zrok share). */
  readonly opener?: ZrokOpener;
}

/** Join a base URL and a path without a double slash. */
function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Build the zrok tunnel adapter. Pure factory; degrade-safe by construction. */
export function createZrokTunnelAdapter(deps: ZrokTunnelDeps): PublicTunnelPort {
  return {
    async ensurePublicUrl(path: string): Promise<string | null> {
      if (!deps.enabled || !deps.shareName) return null;
      if (deps.publicBaseUrl) return joinUrl(deps.publicBaseUrl, path);
      if (deps.opener) {
        try {
          const url = await deps.opener.open(path, deps.shareName);
          return url ?? null;
        } catch {
          return null; // opener fault ⇒ truthfully no tunnel.
        }
      }
      return null;
    },
  };
}
