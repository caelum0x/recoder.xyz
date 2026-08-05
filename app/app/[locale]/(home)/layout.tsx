import type { Metadata } from 'next';
import {
  OrganizationSchema,
  SoftwareApplicationSchema,
  WebApplicationSchema,
  FAQPageSchema,
} from '@/app/components/StructuredData';

// On-page hero (page.tsx H1/¶1) and this metadata must stay in agreement:
// the product is the terminal IDE for AI coding agents — give one task to
// Claude Code, Codex, and Cursor at once, watch them diverge in isolated git
// worktrees, then converge the best into ONE trusted, evidence-backed merge.
// Positioning: the category leads; self-host/BYOK are footnotes, not the pitch.
const HOME_TITLE = 'Recoder — The Terminal IDE for AI Agents. One Task, Many Agents, One Merge.';
const HOME_DESCRIPTION =
  'Recoder is the terminal IDE for AI coding agents. Give one task to Claude Code, Codex, and Cursor at once, watch them diverge in isolated git worktrees, then converge the best into one trusted, evidence-backed merge. Free to start.';

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  keywords: [
    'terminal IDE for AI agents',
    'parallel AI coding agents',
    'Claude Code',
    'Codex',
    'Cursor',
    'run coding agents in parallel',
    'merge parallel agent diffs',
    'AI agent convergence',
    'git worktree AI',
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
      {/* Convergence-first hero → still surface the CLI SoftwareApplication schema. */}
      <SoftwareApplicationSchema />
      <WebApplicationSchema />
      <FAQPageSchema />
      {children}
    </>
  );
}
