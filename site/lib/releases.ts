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
 * Per-platform direct URLs are optional. Only macOS may fall back to the bare
 * releases page: shipped builds are macOS-arm64-only today (the desktop app's
 * embedded engine binaries exist only for arm64-darwin — see
 * apps/desktop/app/electron-builder.config.cjs and bd recoder-di8l), so a
 * Windows/Linux card must never light up unless its OWN direct artifact URL is
 * configured. The WINDOWS/LINUX env slots are kept as the seam for that day.
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

/** A 64-char SHA-256 hex digest, if configured — never renders a malformed one. */
function sha256Hex(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  return /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

/**
 * The published SHA-256 checksum for a platform's artifact, if configured. Lets
 * the Download page show a `shasum -a 256` verify affordance so users can prove
 * integrity before installing. Emitted by publish-desktop-release-local.sh
 * (SHA256SUMS) and surfaced via NEXT_PUBLIC_DOWNLOAD_<PLATFORM>_SHA256.
 */
export function platformChecksum(platform: PlatformId): string | undefined {
  switch (platform) {
    case "macos":
      return sha256Hex(process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_SHA256);
    case "windows":
      return sha256Hex(process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_SHA256);
    case "linux":
      return sha256Hex(process.env.NEXT_PUBLIC_DOWNLOAD_LINUX_SHA256);
  }
}

/**
 * The best download href for a platform: its direct artifact if set, otherwise
 * (macOS only) the releases page. Returns undefined when nothing is configured
 * for the platform so callers fall back to the notify flow.
 *
 * Windows/Linux deliberately do NOT inherit the releases-page fallback: no
 * such build exists (engine binaries are arm64-darwin-only, bd recoder-di8l),
 * so rendering a "Download" card for them off the generic releases URL would
 * be a dead end. They light up only via their own NEXT_PUBLIC_DOWNLOAD_*_URL.
 */
export function downloadHref(platform: PlatformId): string | undefined {
  const direct = platformDownloadUrl(platform);
  if (direct) return direct;
  return platform === "macos" ? releasesPageUrl() : undefined;
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
