import type { Metadata } from 'next';
import { OrganizationSchema, WebApplicationSchema, FAQPageSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder — Your AI Agent Platform',
  description:
    'Build, deploy, and orchestrate AI agents across code, projects, clients, and voice. 5 products, 40+ AI models, A2A/MCP ready.',
  openGraph: {
    title: 'Recoder — Your AI Agent Platform',
    description:
      'Build, deploy, and orchestrate AI agents across code, projects, clients, and voice.',
    url: 'https://recoder.xyz',
    siteName: 'Recoder',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder — Your AI Agent Platform' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder — Your AI Agent Platform',
    description:
      'Build, deploy, and orchestrate AI agents across code, projects, clients, and voice.',
    images: ['https://recoder.xyz/og-image.png'],
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
      <WebApplicationSchema />
      <FAQPageSchema />
      {children}
    </>
  );
}
