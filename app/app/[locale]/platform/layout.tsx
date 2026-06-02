import type { Metadata } from 'next';
import { AllPlatformServicesSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Recoder Platform - External Agent Control Plane | Recoder.xyz',
  description: 'Explore the Recoder control plane for external coding agents across identity, runtime, preview, task state, approvals, and delivery.',
  openGraph: {
    title: 'Recoder Platform - External Agent Control Plane | Recoder.xyz',
    description: 'Platform surfaces for external coding agents, runtime execution, PM approvals, and delivery packaging.',
    url: 'https://recoder.xyz/platform',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Platform - External Agent Control Plane',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Platform - External Agent Control Plane',
    description: 'Platform surfaces for external coding agents, runtime execution, PM approvals, and delivery packaging.',
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
