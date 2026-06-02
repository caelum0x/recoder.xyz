import type { Metadata } from 'next';
import { OrganizationSchema, WebApplicationSchema, FAQPageSchema, WebSiteSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder.xyz | Control Plane for External Coding Agents',
  description:
    'Connect Claude Code, Codex, or your own agent to Recoder and execute software work across runtime, preview, task state, and handoff.',
  openGraph: {
    title: 'Recoder.xyz | Control Plane for External Coding Agents',
    description:
      'BYOK workflow control for external coding agents across runtime, preview, task state, and delivery.',
    url: 'https://recoder.xyz',
    siteName: 'Recoder',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder — Your AI Agent Platform' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz | Control Plane for External Coding Agents',
    description:
      'BYOK workflow control for external coding agents across runtime, preview, task state, and delivery.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz',
  },
};

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OrganizationSchema />
      <WebSiteSchema />
      <WebApplicationSchema />
      <FAQPageSchema />
      {children}
    </>
  );
}
