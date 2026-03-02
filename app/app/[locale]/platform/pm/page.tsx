import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder PM - AI-Powered Project Management | Recoder.xyz',
  description: 'Track tasks, manage sprints, and coordinate work across AI agents and human team members. Recoder PM integrates with all Recoder services for unified project visibility, analytics, and workflow automation.',
  openGraph: {
    title: 'Recoder PM - AI-Powered Project Management | Recoder.xyz',
    description: 'AI-powered project management with task tracking, sprint management, and cross-platform coordination between AI agents and human teams.',
    url: 'https://recoder.xyz/platform/pm',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder PM - AI-Powered Project Management',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder PM - AI-Powered Project Management',
    description: 'Project management with AI agent task assignment, sprint tracking, and cross-platform coordination.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/pm',
  },
};

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
