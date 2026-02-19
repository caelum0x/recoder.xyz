import { PlatformDetailPage } from '@/components/PlatformDetailPage';

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
