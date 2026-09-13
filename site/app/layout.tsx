import type { Metadata } from "next";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const TITLE = "Recoder — Run Claude Code, Codex & Cursor Agents in Parallel";
const DESCRIPTION =
  "Recoder runs your own Claude Code, Codex, Cursor & opencode agents in parallel — each in an isolated git-worktree workspace. Watch them work, review the diffs, and merge the best. Your keys, your code, local-first.";
const SITE_URL = "https://recoder.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "coding agents",
    "Claude Code",
    "Codex",
    "agent orchestration",
    "multi-agent coding",
    "agent coordination",
    "shared memory for agents",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Recoder",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: SITE_URL },
};

// Structured data describes the organization + website without overstating
// availability: desktop builds are not public yet, so we deliberately do NOT
// advertise a downloadable SoftwareApplication with an OS list and a $0 offer
// to crawlers. Organization + WebSite are always-true entities that improve
// entity/knowledge-graph recognition without implying a shipped download.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Recoder",
      url: SITE_URL,
      description: DESCRIPTION,
      slogan: "The control plane for coding agents.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Recoder",
      url: SITE_URL,
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
