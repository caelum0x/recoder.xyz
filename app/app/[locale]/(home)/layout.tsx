import type { Metadata } from 'next';
import {
  OrganizationSchema,
  SoftwareApplicationSchema,
  WebApplicationSchema,
  FAQPageSchema,
} from '@/app/components/StructuredData';

// On-page hero (page.tsx H1/¶1) and this metadata must stay in agreement:
// the product is the self-hosted convergence workspace for coding agents —
// run Claude Code, Codex, and any agent in parallel isolated git worktrees
// (BYOK), compare divergent diffs, and land ONE trusted, evidence-backed
// merge (docs/PRODUCT-THESIS.md §0/§12).
const HOME_TITLE = 'Recoder — Claude Code, Codex & Any Agent in Parallel. One Trusted Merge.';
const HOME_DESCRIPTION =
  'Recoder is the self-hosted convergence workspace for AI coding agents. Run Claude Code, Codex, and any agent in parallel isolated git worktrees with your own API keys (BYOK), compare their divergent diffs side by side, and merge one trusted, evidence-backed change. Free to start.';

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  keywords: [
    'parallel AI coding agents',
    'Claude Code',
    'Codex',
    'run coding agents in parallel',
    'merge parallel agent diffs',
    'AI agent convergence',
    'self-hosted AI coding',
    'BYOK AI',
    'bring your own API key',
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
