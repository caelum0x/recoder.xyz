/**
 * `PublicTunnelPort` — NAT public-URL exposure for the webhook path (zrok). Push
 * channels (LINE/Slack) require a reachable public URL; when zrok is absent the
 * adapter returns `null` and the channel reports `down` truthfully (never a
 * silently-dropped message).
 */
export interface PublicTunnelPort {
  /**
   * Ensure a public URL fronting `path`, or `null` when no tunnel is available.
   * Degrade-safe: absence is `null`, never a throw.
   */
  ensurePublicUrl(path: string): Promise<string | null>;
}
