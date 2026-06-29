import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const TITLE = "Recoder — Run your coding agents in parallel";
const DESCRIPTION =
  "Recoder is a desktop app for running your own Claude Code, Codex, Cursor, and opencode agents in isolated git-worktree workspaces — see what they're doing, review their diffs, and merge. Your agents, your keys.";
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

// Structured data describes the organization/product without overstating
// availability: desktop builds are not public yet, so we do NOT advertise a
// downloadable SoftwareApplication with an OS list and a $0 offer to crawlers.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Recoder",
  url: SITE_URL,
  description: DESCRIPTION,
  slogan: "The control plane for coding agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
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
