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
 * Recoder cube logo — uses /logo.png which exists in each app's public dir.
 */
function RecoderSymbolInline({ size = 16 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="Recoder"
      width={size}
      height={size}
      style={{ flexShrink: 0, objectFit: "contain" }}
    />
  );
}
