import type { Metadata } from 'next';
import { OrganizationSchema, WebApplicationSchema, FAQPageSchema, WebSiteSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder.xyz | Build with AI and keep control',
  description:
    'Use Recoder across agents, browser coding, CLI, PM, and agency workflows with your own provider keys and a cleaner activation path.',
  openGraph: {
    title: 'Recoder.xyz | Build with AI and keep control',
    description:
      'BYOK-first AI development across agents, browser coding, CLI, PM, and agency workflows.',
    url: 'https://recoder.xyz',
    siteName: 'Recoder',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder — Your AI Agent Platform' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz | Build with AI and keep control',
    description:
      'BYOK-first AI development across agents, browser coding, CLI, PM, and agency workflows.',
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
