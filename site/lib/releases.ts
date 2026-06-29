/**
 * Real GitHub releases wiring for the Download flow (ROADMAP M4.3).
 *
 * The Download flow points at *real* GitHub release artifacts the moment they
 * exist, and falls back honestly to the "notify me" signup until then. We never
 * hardcode a release URL that 404s, so every URL is environment-driven:
 *
 *   - NEXT_PUBLIC_GITHUB_RELEASES_URL — the releases *page* (e.g.
 *     https://github.com/<org>/<repo>/releases). When set, the Download page
 *     shows a real "Download" CTA pointing at the latest release.
 *   - NEXT_PUBLIC_DOWNLOAD_MACOS_URL   — direct macOS artifact (.dmg)
 *   - NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL — direct Windows artifact (.exe / .msi)
 *   - NEXT_PUBLIC_DOWNLOAD_LINUX_URL   — direct Linux artifact (.AppImage / .deb)
 *   - NEXT_PUBLIC_RELEASE_VERSION      — optional human label (e.g. "v0.4.0")
 *
 * Per-platform direct URLs are optional: if only the releases page is set, the
 * download page links every platform card at that page. If a platform's direct
 * URL is set, that card downloads the artifact directly.
 *
 * This is pure static-edge config — no backend coupling beyond the release URL
 * (INTEGRATION-PLAN §b.4, M4.3). It does NOT touch SITE_ASSET_PREFIX: these are
 * absolute external (GitHub) URLs, never Next.js `/_next/*` assets.
 */

export type PlatformId = "macos" | "windows" | "linux";

/** Only accept absolute http(s) URLs so a misconfigured value never renders. */
function httpUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/** The GitHub releases page, if configured. */
export function releasesPageUrl(): string | undefined {
  return httpUrl(process.env.NEXT_PUBLIC_GITHUB_RELEASES_URL);
}

/** A direct download URL for a specific platform, if configured. */
export function platformDownloadUrl(platform: PlatformId): string | undefined {
  switch (platform) {
    case "macos":
      return httpUrl(process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_URL);
    case "windows":
      return httpUrl(process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL);
    case "linux":
      return httpUrl(process.env.NEXT_PUBLIC_DOWNLOAD_LINUX_URL);
  }
}

/**
 * The best download href for a platform: its direct artifact if set, otherwise
 * the releases page. Returns undefined when nothing is configured (no public
 * build yet) so callers fall back to the notify flow.
 */
export function downloadHref(platform: PlatformId): string | undefined {
  return platformDownloadUrl(platform) ?? releasesPageUrl();
}

/** Optional human-readable version label (e.g. "v0.4.0") for display only. */
export function releaseVersionLabel(): string | undefined {
  return process.env.NEXT_PUBLIC_RELEASE_VERSION?.trim() || undefined;
}

/**
 * True once any public build is reachable — either the releases page or at
 * least one per-platform artifact is configured. Drives whether the Download
 * page serves real builds or the honest "notify me" fallback.
 */
export function releasesArePublic(): boolean {
  return Boolean(
    releasesPageUrl() ||
      platformDownloadUrl("macos") ||
      platformDownloadUrl("windows") ||
      platformDownloadUrl("linux"),
  );
}
