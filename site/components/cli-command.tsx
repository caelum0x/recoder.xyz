"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard shell command chip, used on the homepage and /download
 * page "Try the CLI first" paths. Every command rendered through this
 * component must be a real, verified-on-npm package (see
 * site/app/download/page.tsx and site/app/page.tsx for the verified list) —
 * never a placeholder or aspirational command.
 */
export function CliCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the command text
      // is still selectable, so this is a silent no-op, not a dead end.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 py-3 font-mono text-[13px]">
      <code className="overflow-x-auto whitespace-pre text-muted">
        <span className="select-none text-faint">$ </span>
        {command}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
