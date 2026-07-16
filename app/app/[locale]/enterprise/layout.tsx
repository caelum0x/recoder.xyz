import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recoder Enterprise - Secure AI Development Platform for Teams | Recoder.xyz',
  description:
    'Enterprise-grade AI development platform with SSO, SAML, self-hosted deployment, SOC 2 & GDPR compliance, dedicated support, custom AI models, and 99.99% uptime SLA. Built for teams of any size.',
  openGraph: {
    title: 'Recoder Enterprise - Secure AI Development Platform for Teams | Recoder.xyz',
    description:
      'Enterprise-grade AI development with SSO, self-hosted deployment, SOC 2 compliance, dedicated support, and 99.99% uptime SLA.',
    url: 'https://recoder.xyz/enterprise',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Enterprise - Secure AI Development Platform',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Enterprise - Secure AI Development Platform for Teams',
    description:
      'SSO, self-hosted deployment, SOC 2 & GDPR compliance, dedicated support, 40+ AI models, and 99.99% uptime SLA.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/enterprise',
  },
};

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
