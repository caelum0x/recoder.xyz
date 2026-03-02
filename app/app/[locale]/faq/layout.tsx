import type { Metadata } from 'next';
import { BreadcrumbSchema, FAQPageSchema } from '@/app/components/StructuredData';

export const metadata: Metadata = {
  title: 'FAQ - Recoder.xyz | Frequently Asked Questions',
  description: 'Answers to common questions about Recoder.xyz. Learn about BYOK, supported AI models, pricing, privacy, and how to get started.',
  openGraph: {
    title: 'FAQ - Recoder.xyz | Frequently Asked Questions',
    description: 'Answers to common questions about Recoder.xyz. Learn about BYOK, supported AI models, pricing, and privacy.',
    url: 'https://recoder.xyz/faq',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder FAQ',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ - Recoder.xyz',
    description: 'Frequently asked questions about Recoder.xyz — BYOK, AI models, pricing, privacy, and more.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/faq',
  },
};

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FAQPageSchema />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://recoder.xyz' },
          { name: 'FAQ', url: 'https://recoder.xyz/faq' },
        ]}
      />
      {children}
    </>
  );
}
