import type { Metadata } from 'next';
import { AllPlatformServicesSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder Platform - AI Development Ecosystem Services | Recoder.xyz',
  description: 'Explore the services powering the Recoder AI development ecosystem. From AI agents and a browser-based IDE to project management and agency workflows, Recoder provides a complete AI-powered development platform.',
  openGraph: {
    title: 'Recoder Platform - AI Development Ecosystem Services | Recoder.xyz',
    description: 'Services powering the Recoder AI development ecosystem including AI agents, browser IDE, project management, and agency workflows.',
    url: 'https://recoder.xyz/platform',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Platform - AI Development Ecosystem Services',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Platform - AI Development Ecosystem Services',
    description: 'Services powering the Recoder AI development ecosystem.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform',
  },
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AllPlatformServicesSchema />
      {children}
    </>
  );
}
