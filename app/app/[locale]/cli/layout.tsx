import type { Metadata } from 'next';
import { SoftwareApplicationSchema, BreadcrumbSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder CLI - Terminal AI Coding Tool | Install recoder-code',
  description: 'Terminal-first AI coding with 40+ models. Seamlessly sync with Spaces. Download projects from browser, edit locally, sync back. 100% FREE beta with BYOK.',
  keywords: [
    'recoder CLI',
    'recoder-code npm',
    'terminal AI coding',
    'CLI code generator',
    'AI terminal tool',
    'Claude CLI',
    'GPT-4 terminal',
    'web CLI sync',
    'download web projects',
    'BYOK CLI tool',
    'OpenRouter CLI',
    'free AI CLI'
  ],
  openGraph: {
    title: 'Recoder CLI - Terminal AI Coding Tool',
    description: 'Seamlessly sync Spaces + CLI. Download projects, edit locally, push changes. 40+ AI models. 100% FREE.',
    url: 'https://recoder.xyz/cli',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder CLI - Terminal AI Coding',
    description: 'Spaces + CLI sync. Download projects, edit locally. 40+ AI models. FREE.',
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
