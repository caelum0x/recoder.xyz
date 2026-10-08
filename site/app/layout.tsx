import type { Metadata } from "next";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const TITLE = "Recoder — Run AI Coding Agents in Parallel · Free Download";
const DESCRIPTION =
  "Run Claude Code, Codex, Cursor, and opencode simultaneously — each in its own isolated git worktree. Compare diffs side by side, merge the best result. Free download for Mac.";
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
      alternateName: "Recoder.xyz",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      description: DESCRIPTION,
      slogan: "The control plane for coding agents.",
      sameAs: [
        "https://github.com/recoderxyz",
        "https://www.npmjs.com/~recoder.xyz",
        "https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Recoder",
      alternateName: "Recoder.xyz",
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
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
