"use client";

import type { EcosystemAppId } from "@recoder/ecosystem-config";
import {
  getSwitcherApps,
  RECODER_ECOSYSTEM_URLS,
} from "@recoder/ecosystem-config";

const apps = getSwitcherApps();

/**
 * Compact top-level navigation bar that lets users jump between Recoder apps.
 *
 * Uses inline styles so it works in any React framework (Next.js, Remix, etc.)
 * without requiring Tailwind or a shared CSS build.
 *
 * Usage:
 *   <PlatformNav currentApp="agents" />
 */
export function PlatformNav({
  currentApp,
}: {
  /** The EcosystemAppId of the app currently being viewed. */
  currentApp: EcosystemAppId;
}) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "0 12px",
        height: "32px",
        borderBottom: "1px solid var(--platform-nav-border, rgba(128,128,128,0.15))",
        background: "var(--platform-nav-bg, transparent)",
        fontSize: "12px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {/* Recoder logo / home link */}
      <a
        href={RECODER_ECOSYSTEM_URLS.home}
        style={{
          display: "inline-flex",
          alignItems: "center",
          marginRight: "8px",
          textDecoration: "none",
          flexShrink: 0,
        }}
        aria-label="Recoder Home"
      >
        <RecoderSymbolInline size={14} />
      </a>

      {/* Separator */}
      <span
        style={{
          width: "1px",
          height: "14px",
          background: "rgba(128,128,128,0.25)",
          marginRight: "6px",
          flexShrink: 0,
        }}
      />

      {/* App links */}
      {apps.map((app) => {
        const isCurrent = app.id === currentApp;
        return (
          <a
            key={app.id}
            href={app.href}
            title={app.description}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              textDecoration: "none",
              fontWeight: isCurrent ? 600 : 400,
              color: isCurrent ? "var(--platform-nav-active, #000)" : "var(--platform-nav-muted, #888)",
              background: isCurrent ? "var(--platform-nav-active-bg, rgba(0,0,0,0.06))" : "transparent",
              transition: "background 150ms, color 150ms",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (!isCurrent) {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--platform-nav-hover-bg, rgba(0,0,0,0.04))";
                (e.currentTarget as HTMLElement).style.color =
                  "var(--platform-nav-hover, #444)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isCurrent) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color =
                  "var(--platform-nav-muted, #888)";
              }
            }}
          >
            {app.label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Minimal inline SVG of the Recoder symbol so we don't depend on /logo.png
 * being present (it's in each app's public dir but the shared package can't
 * reference a relative path reliably).
 */
function RecoderSymbolInline({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 25"
      fill="currentColor"
      style={{ flexShrink: 0 }}
    >
      <path d="M25.5614 24.916H29.8268C29.8268 19.6306 26.9378 15.0039 22.6171 12.4587C26.9377 9.91355 29.8267 5.28685 29.8267 0.00146484H25.5613C25.5613 5.00287 21.8906 9.18692 17.0654 10.1679V0.00146484H12.8005V10.1679C7.9526 9.20401 4.3046 5.0186 4.3046 0.00146484H0.0391572C0.0391572 5.28685 2.92822 9.91355 7.24884 12.4587C2.92818 15.0039 0.0390625 19.6306 0.0390625 24.916H4.30451C4.30451 19.8989 7.95259 15.7135 12.8005 14.7496V24.9206H17.0654V14.7496C21.9133 15.7134 25.5614 19.8989 25.5614 24.916Z" />
    </svg>
  );
}
