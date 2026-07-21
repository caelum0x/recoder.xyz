import type { Metadata } from 'next';
import {
  OrganizationSchema,
  SoftwareApplicationSchema,
  WebApplicationSchema,
  FAQPageSchema,
} from '@/app/components/StructuredData';

// On-page hero (page.tsx H1/¶1) and this metadata must stay in agreement:
// the real product is a terminal for running coding agents (Claude Code,
// Codex, and more) in parallel isolated git worktrees, BYOK, review + merge.
const HOME_TITLE = 'Recoder — Run Claude Code, Codex & AI Coding Agents in Parallel';
const HOME_DESCRIPTION =
  'Recoder is a terminal for AI coding agents. Run Claude Code, Codex, and more in parallel isolated git worktrees, bring your own API key (BYOK), then review the diff and merge. Free to start.';

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  keywords: [
    'parallel AI coding agents',
    'Claude Code',
    'Codex',
    'run coding agents in parallel',
    'BYOK AI',
    'bring your own API key',
    'git worktree AI',
    'terminal AI coding',
    'free AI development',
    'review and merge AI diffs',
  ],
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: 'https://recoder.xyz',
    siteName: 'Recoder',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: HOME_TITLE }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: ['https://recoder.xyz/og-image.png'],
  },
};

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OrganizationSchema />
      {/* Terminal-first hero → surface the CLI SoftwareApplication schema too. */}
      <SoftwareApplicationSchema />
      <WebApplicationSchema />
      <FAQPageSchema />
      {children}
    </>
  );
}
