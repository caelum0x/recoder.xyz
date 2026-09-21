"use client";

import { useState } from "react";

/**
 * "Embed this comparison" block shown on each /compare/[slug] page. It renders
 * the live badge, the copy-paste HTML/Markdown embed snippets, and a copy
 * button. Other blogs and READMEs that embed it link back to the comparison —
 * the backlink flywheel. The badge itself is served by /api/badge/[slug].
 */
export function EmbedComparison({
  slug,
  label,
}: {
  slug: string;
  label: string;
}) {
  const base = "https://recoder.xyz";
  const pageUrl = `${base}/compare/${slug}`;
  const badgeUrl = `${base}/api/badge/${slug}.svg`;
  const alt = `Recoder: ${label}`;

  const html = `<a href="${pageUrl}"><img src="${badgeUrl}" alt="${alt}" height="22"></a>`;
  const markdown = `[![${alt}](${badgeUrl})](${pageUrl})`;

  const [copied, setCopied] = useState<"html" | "markdown" | null>(null);

  async function copy(text: string, which: "html" | "markdown") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1800);
    } catch {
      // Clipboard can be blocked (permissions, insecure context). The snippet
      // is still visible and selectable, so the user can copy manually.
      setCopied(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg p-5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={badgeUrl} alt={alt} height={22} className="h-[22px]" />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Writing about these tools? Drop this badge in a blog post or README — it
        links back to this comparison.
      </p>

      <div className="mt-4 space-y-4">
        <Snippet
          title="HTML"
          code={html}
          copied={copied === "html"}
          onCopy={() => copy(html, "html")}
        />
        <Snippet
          title="Markdown"
          code={markdown}
          copied={copied === "markdown"}
          onCopy={() => copy(markdown, "markdown")}
        />
      </div>
    </div>
  );
}

function Snippet({
  title,
  code,
  copied,
  onCopy,
}: {
  title: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          {title}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:text-fg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-bg-soft px-3 py-2">
        <code className="text-xs text-muted">{code}</code>
      </pre>
    </div>
  );
}
