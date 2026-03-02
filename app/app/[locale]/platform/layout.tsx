import type { Metadata } from 'next';
import { AllPlatformServicesSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder Platform - AI Development Ecosystem Services | Recoder.xyz',
  description: 'Explore the 10 deployed services powering the Recoder AI development ecosystem. From autonomous coding agents and visual workflow designers to project management and API gateways, Recoder provides a complete AI-powered development platform.',
  openGraph: {
    title: 'Recoder Platform - AI Development Ecosystem Services | Recoder.xyz',
    description: '10 deployed services powering the Recoder AI development ecosystem including IDEs, agent orchestration, project management, and API gateway.',
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
    description: '10 deployed services powering the Recoder AI development ecosystem.',
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
