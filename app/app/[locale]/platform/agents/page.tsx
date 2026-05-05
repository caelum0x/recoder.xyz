import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder Agents - External Agent Control Surface | Recoder.xyz',
  description: 'Recoder Agents is the connection and execution surface for external coding agents. Route Claude Code, Codex, and custom runtimes through task state, preview, artifacts, and handoff.',
  openGraph: {
    title: 'Recoder Agents - External Agent Control Surface | Recoder.xyz',
    description: 'Connect external coding agents to runtime, preview, artifacts, and human approvals.',
    url: 'https://recoder.xyz/platform/agents',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Agents - External Agent Control Surface',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Agents - External Agent Control Surface',
    description: 'Connect external coding agents to runtime, preview, artifacts, and human approvals.',
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
      longDescription="Recoder Agents is the external-agent connection and dispatch surface inside Recoder. It gives Claude Code, Codex, and custom runtimes a stable identity, execution context, and shared task loop across runtime, preview, artifacts, and handoff."
      features={[
        'External agent registration and identity',
        'Task routing and execution dispatch',
        'Sandboxed code execution',
        'Preview, logs, and artifact capture',
        'Human approval and handoff visibility',
        'Git integration and version control',
        'BYOK provider support',
        'Custom agent configurations',
      ]}
      useCases={[
        'Connect Claude Code or Codex to a shared software execution workflow',
        'Route bugs, features, and review work into one agent-controlled runtime lane',
        'Track preview, artifacts, and approvals for real delivery work',
        'Scale from one connected agent into multi-agent team workflows over time',
      ]}
    />
  );
}
