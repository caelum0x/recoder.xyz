"use client";

import { useState } from "react";
import { LeadForm } from "@/components/lead-form";

interface Platform {
  os: string;
  note: string;
  value: string;
}

const PLATFORMS: Platform[] = [
  { os: "macOS", note: "Apple silicon & Intel", value: "macos" },
  { os: "Windows", note: "x64", value: "windows" },
  { os: "Linux", note: "AppImage & deb", value: "linux" },
];

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
