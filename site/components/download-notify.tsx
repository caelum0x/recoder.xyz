"use client";

import { useState } from "react";
import { LeadForm } from "@/components/lead-form";
import type { PlatformId } from "@/lib/releases";

interface Platform {
  os: string;
  note: string;
  value: PlatformId;
}

const PLATFORMS: Platform[] = [
  { os: "macOS", note: "Apple Silicon (arm64)", value: "macos" },
  { os: "Windows", note: "x64", value: "windows" },
  { os: "Linux", note: "AppImage & deb", value: "linux" },
];

/**
 * Live-release variant: real signed release artifacts exist, so each card is a
 * direct "Download" link to the build for that platform. The hrefs (and optional
 * SHA-256 checksums) are resolved server-side from environment config and passed
 * in, so this component never hardcodes a URL that could 404, and users can
 * verify integrity before installing.
 */
export function DownloadReleases({
  hrefs,
  checksums,
  versionLabel,
}: {
  hrefs: Partial<Record<PlatformId, string>>;
  checksums?: Partial<Record<PlatformId, string>>;
  versionLabel?: string;
}) {
  return (
    <div className="mt-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {PLATFORMS.map((p) => {
          const href = hrefs[p.value];
          if (!href) return null;
          const external = !href.startsWith("/");
          const sum = checksums?.[p.value];
          const file = href.split("/").pop() || "the download";
          return (
            <div
              key={p.value}
              className="rounded-xl border border-border bg-bg-soft p-6 text-left"
            >
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group block transition-colors hover:text-accent"
              >
                <div className="text-lg font-medium">{p.os}</div>
                <div className="mt-1 text-xs text-faint">{p.note}</div>
                <div className="mt-4 text-sm text-accent">Download</div>
              </a>
              {sum ? (
                <details className="mt-4 border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-fg">
                    Verify checksum
                  </summary>
                  <p className="mt-2 text-[11px] text-faint">
                    Confirm the SHA-256 matches before installing:
                  </p>
                  <code className="mt-2 block break-all rounded bg-bg px-2 py-1.5 text-[11px] text-muted">
                    shasum -a 256 {file}
                  </code>
                  <code className="mt-1 block break-all rounded bg-bg px-2 py-1.5 text-[11px] text-faint">
                    {sum}
                  </code>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-faint">
        {versionLabel ? `${versionLabel} · ` : ""}Self-hosted builds, served
        directly from Recoder. macOS is signed with a Developer ID and notarized
        by Apple. Your agents, your keys — Recoder never proxies tokens.
      </p>
    </div>
  );
}

/**
 * No public desktop builds have shipped yet, so the platform cards capture a
 * real "notify me" signup against /api/leads instead of dead-ending on `#`.
 * Selecting a card reveals the form pre-targeted at that platform.
 */
export function DownloadNotify() {
  const [selected, setSelected] = useState<Platform>(PLATFORMS[0]);

  return (
    <div className="mt-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {PLATFORMS.map((p) => {
          const active = p.value === selected.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setSelected(p)}
              aria-pressed={active}
              className={
                "rounded-xl border p-6 text-left transition-colors " +
                (active
                  ? "border-accent bg-bg-soft"
                  : "border-border bg-bg-soft hover:border-border-strong")
              }
            >
              <div className="text-lg font-medium">{p.os}</div>
              <div className="mt-1 text-xs text-faint">{p.note}</div>
              <div
                className={
                  "mt-4 text-sm " + (active ? "text-accent" : "text-muted")
                }
              >
                {active ? "Selected" : "Notify me"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <LeadForm
          kind="notify"
          source="download"
          platform={selected.value}
          submitLabel="Notify me"
          successText={`Thanks — we'll email you when the ${selected.os} build is ready.`}
        />
        <p className="mt-3 text-center text-xs text-faint">
          One email when the {selected.os} build lands. No spam, unsubscribe
          anytime.
        </p>
      </div>
    </div>
  );
}
