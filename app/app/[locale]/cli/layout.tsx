import type { Metadata } from 'next';
import { SoftwareApplicationSchema, BreadcrumbSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder + Your Agent CLIs - Run Coding Agents in Parallel',
  description: 'Recoder is the terminal IDE for AI coding agents: give one task to Claude Code, Codex, opencode, and any agent CLI at once in parallel isolated git worktrees, then converge the best result into one merge.',
  keywords: [
    'terminal IDE for AI agents',
    'recoder desktop',
    'coding agents',
    'Claude Code',
    'Codex CLI',
    'opencode',
    'parallel agents',
    'git worktrees',
    'agent orchestration',
    'diff review',
  ],
  openGraph: {
    title: 'Recoder + Your Agent CLIs - Run Coding Agents in Parallel',
    description: 'The terminal IDE for AI coding agents: run your agent CLIs in parallel isolated git worktrees, compare diffs, and converge the best. Desktop app for macOS, Windows & Linux.',
    url: 'https://recoder.xyz/cli',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder + Your Agent CLIs',
    description: 'Many agents in parallel. One trusted merge. The terminal IDE for AI agents.',
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
