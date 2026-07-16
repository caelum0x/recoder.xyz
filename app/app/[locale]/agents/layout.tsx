import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'AI Agents - Recoder.xyz | Autonomous Coding Agents',
  description: 'Five specialized AI agent platforms for building, deploying, and managing autonomous coding agents. From browser-based IDEs to visual workflow designers.',
  openGraph: {
    title: 'AI Agents - Recoder.xyz | Autonomous Coding Agents',
    description: 'Five specialized AI agent platforms for building, deploying, and managing autonomous coding agents.',
    url: 'https://recoder.xyz/agents',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder AI Agents',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Agents - Recoder.xyz',
    description: 'Five specialized platforms for autonomous AI coding agents. Build, deploy, and manage AI-powered workflows.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/agents',
  },
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://recoder.xyz' },
          { name: 'AI Agents', url: 'https://recoder.xyz/agents' },
        ]}
      />
      {children}
    </>
  );
}
