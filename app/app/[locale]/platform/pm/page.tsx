import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export default function PMPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="pm"
      longDescription="Recoder PM is the project management layer of the Recoder ecosystem. Track tasks, manage sprints, and coordinate work across AI agents and human team members. Integrates with all other Recoder services for unified project visibility."
      features={[
        'Task and sprint management',
        'Cross-platform project tracking',
        'AI agent task assignment',
        'Team collaboration tools',
        'Integration with all Recoder services',
        'Project analytics and reporting',
        'Workflow automation',
        'Real-time notifications',
      ]}
      useCases={[
        'Manage AI-assisted development projects from planning to deployment',
        'Coordinate tasks between human developers and AI agents',
        'Track project progress across multiple Recoder platforms',
        'Automate project workflows with AI triggers',
      ]}
    />
  );
}
