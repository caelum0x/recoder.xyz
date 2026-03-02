import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder Studio - Visual AI Workflow Designer | Recoder.xyz',
  description: 'Design, simulate, and deploy AI agent pipelines with a visual drag-and-drop workflow builder. Recoder Studio supports canary deployments, simulation gates, blueprint templates, and real-time workflow monitoring.',
  openGraph: {
    title: 'Recoder Studio - Visual AI Workflow Designer | Recoder.xyz',
    description: 'Visual drag-and-drop workflow designer for AI agent pipelines with canary deployments, simulation gates, and real-time monitoring.',
    url: 'https://recoder.xyz/platform/studio',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Studio - Visual AI Workflow Designer',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Studio - Visual AI Workflow Designer',
    description: 'Visual drag-and-drop workflow designer for AI agent pipelines with canary deployments and real-time monitoring.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/studio',
  },
};

export default function StudioPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="studio"
      longDescription="Recoder Studio is a visual workflow designer for building AI agent pipelines. Create complex multi-step agent workflows using a drag-and-drop interface. Design, simulate, and deploy agent orchestrations without writing code. Includes canary deployments, simulation gates, and deployment history."
      features={[
        'Visual drag-and-drop workflow designer',
        'Agent pipeline builder',
        'Simulation and testing gates',
        'Canary deployment support',
        'Deployment history and rollback',
        'Blueprint gallery with templates',
        'No-code agent creation',
        'Real-time workflow monitoring',
      ]}
      useCases={[
        'Design complex multi-agent workflows visually',
        'Create reusable agent blueprints for your team',
        'Test and simulate workflows before deployment',
        'Monitor running agent pipelines in real-time',
      ]}
    />
  );
}
