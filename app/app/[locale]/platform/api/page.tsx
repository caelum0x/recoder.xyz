import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder API - Unified API Gateway & Task Engine | Recoder.xyz',
  description: 'The unified API gateway for the Recoder ecosystem. Handles task execution, real-time streaming, queue management, rate limiting, BYOK proxy, and A2A (Agent-to-Agent) protocol support with public API versioning.',
  openGraph: {
    title: 'Recoder API - Unified API Gateway & Task Engine | Recoder.xyz',
    description: 'Unified API gateway with task execution, real-time streaming, rate limiting, BYOK proxy, and Agent-to-Agent protocol support.',
    url: 'https://recoder.xyz/platform/api',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder API - Unified API Gateway & Task Engine',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder API - Unified API Gateway & Task Engine',
    description: 'Unified API gateway with real-time streaming, rate limiting, BYOK proxy, and A2A protocol support.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/api',
  },
};

export default function APIPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="api"
      longDescription="The Recoder API is the unified gateway for the Recoder ecosystem. It handles task execution, streaming, queue management, rate limiting, and public API access. Provides a unified interface for all client applications to interact with the platform."
      features={[
        'Unified API gateway',
        'Task queue and execution engine',
        'Real-time streaming support',
        'Rate limiting and backpressure',
        'Public API with versioning',
        'BYOK (Bring Your Own Key) proxy',
        'Health and readiness endpoints',
        'A2A (Agent-to-Agent) protocol support',
      ]}
      useCases={[
        'Integrate Recoder capabilities into external applications via API',
        'Stream AI responses in real-time to client applications',
        'Manage task queues and execution pipelines',
        'Build custom integrations using the public API',
      ]}
    />
  );
}
