import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder Agents - Autonomous AI Development Environment | Recoder.xyz',
  description: 'Recoder Agents is a full-featured autonomous AI coding environment with browser automation, sandboxed execution, and multi-model support. Build, debug, and deploy code with AI agents that handle complex development workflows end-to-end.',
  openGraph: {
    title: 'Recoder Agents - Autonomous AI Development Environment | Recoder.xyz',
    description: 'Autonomous AI coding agents with browser automation, sandboxed execution, and multi-model support including Claude, GPT-4, and Gemini.',
    url: 'https://recoder.xyz/platform/agents',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Agents - Autonomous AI Development Environment',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Agents - Autonomous AI Development Environment',
    description: 'Autonomous AI coding agents with browser automation, sandboxed execution, and multi-model support.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/agents',
  },
};

export default function AgentsPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="agents"
      longDescription="Recoder Agents is a full-featured autonomous AI development environment. It provides AI agents that can write, debug, and deploy code independently. With browser automation, file management, and sandboxed execution, it handles complex development workflows end-to-end."
      features={[
        'Autonomous AI coding agents',
        'Browser automation and web scraping',
        'File system management and editing',
        'Sandboxed code execution',
        'Real-time collaboration',
        'Git integration and version control',
        'Multi-model support (Claude, GPT-4, Gemini)',
        'Custom agent configurations',
      ]}
      useCases={[
        'Build full-stack applications with AI agents doing the heavy lifting',
        'Automate repetitive development tasks like testing and refactoring',
        'Prototype new features rapidly with autonomous coding assistance',
        'Debug complex issues with AI-powered code analysis',
      ]}
    />
  );
}
