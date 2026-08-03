import type { Metadata } from 'next';
import { SoftwareApplicationSchema, BreadcrumbSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder + Your Agent CLIs - Run Coding Agents in Parallel',
  description: 'Recoder is a desktop app that runs Claude Code, Codex, opencode, and any agent CLI in parallel isolated git worktrees — then helps you review and merge the best result. BYOK.',
  keywords: [
    'recoder desktop',
    'coding agents',
    'Claude Code',
    'Codex CLI',
    'opencode',
    'parallel agents',
    'git worktrees',
    'agent orchestration',
    'diff review',
    'BYOK',
    'self-hosted AI coding'
  ],
  openGraph: {
    title: 'Recoder + Your Agent CLIs - Run Coding Agents in Parallel',
    description: 'Run your agent CLIs in parallel isolated git worktrees, compare diffs, merge the best. Desktop app for macOS, Windows & Linux. BYOK.',
    url: 'https://recoder.xyz/cli',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder + Your Agent CLIs',
    description: 'Many agents in parallel. One trusted merge. Desktop app, BYOK.',
  },
  alternates: {
    canonical: 'https://recoder.xyz/cli',
  },
};

export default function CLILayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SoftwareApplicationSchema />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://recoder.xyz' },
          { name: 'CLI', url: 'https://recoder.xyz/cli' },
        ]}
      />
      {children}
    </>
  );
}
