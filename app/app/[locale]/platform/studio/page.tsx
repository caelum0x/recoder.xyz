import { PlatformDetailPage } from '@/components/PlatformDetailPage';

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
