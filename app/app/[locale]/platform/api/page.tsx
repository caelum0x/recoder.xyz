import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export default function APIPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="docker-backend"
      longDescription="The Docker Backend is the API gateway for the Recoder ecosystem. It handles task execution, streaming, queue management, rate limiting, and public API access. Provides a unified interface for all client applications to interact with the platform."
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
