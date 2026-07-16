import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'Pricing - Recoder.xyz | AI Coding Platform Plans',
  description: 'Choose the right Recoder plan for you. Free tier with BYOK, weekly and monthly plans with all AI models included, Pro for power users, and Enterprise for teams.',
  keywords: [
    'recoder pricing',
    'AI coding pricing',
    'recoder plans',
    'AI IDE pricing',
    'Claude GPT-4 Gemini pricing',
    'BYOK free tier',
    'AI coding tool plans',
    'recoder free',
    'recoder pro',
    'recoder enterprise',
  ],
  openGraph: {
    title: 'Pricing - Recoder.xyz | AI Coding Platform Plans',
    description: 'Free tier with BYOK, paid plans with all AI models included. Find the right plan for your AI-powered development workflow.',
    url: 'https://recoder.xyz/pricing',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Pricing - AI Coding Platform Plans',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Pricing - AI Coding Platform Plans',
    description: 'Free tier with BYOK. Paid plans include all AI models. From $10/week to Enterprise.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/pricing',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://recoder.xyz' },
          { name: 'Pricing', url: 'https://recoder.xyz/pricing' },
        ]}
      />
      {children}
    </>
  );
}
