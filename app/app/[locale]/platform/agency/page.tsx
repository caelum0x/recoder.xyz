import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder Agency - Multi-Agent Orchestration Platform | Recoder.xyz',
  description: 'Build, deploy, and manage AI agent workflows that collaborate on complex tasks. Define agent roles, set up inter-agent communication channels, and create sophisticated multi-agent systems with custom triggers and performance monitoring.',
  openGraph: {
    title: 'Recoder Agency - Multi-Agent Orchestration Platform | Recoder.xyz',
    description: 'Multi-agent orchestration with role definitions, inter-agent communication, custom triggers, and performance monitoring for AI workflows.',
    url: 'https://recoder.xyz/platform/agency',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Agency - Multi-Agent Orchestration Platform',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Agency - Multi-Agent Orchestration Platform',
    description: 'Multi-agent orchestration with role definitions, inter-agent communication, and custom trigger systems.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/agency',
  },
};

export default function AgencyPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="agency"
      longDescription="Recoder Agency is the multi-agent orchestration platform. Build, deploy, and manage AI agent workflows that collaborate on complex tasks. Define agent roles, set up communication channels, and create sophisticated multi-agent systems."
      features={[
        'Multi-agent orchestration engine',
        'Agent role and capability definition',
        'Inter-agent communication channels',
        'Custom trigger and event system',
        'Agent performance monitoring',
        'Workflow scheduling and automation',
        'Integration with external APIs',
        'Agent marketplace and templates',
      ]}
      useCases={[
        'Build teams of specialized AI agents that work together',
        'Create event-driven agent workflows triggered by external events',
        'Orchestrate complex development pipelines with multiple agents',
        'Monitor and optimize agent performance across workflows',
      ]}
    />
  );
}
