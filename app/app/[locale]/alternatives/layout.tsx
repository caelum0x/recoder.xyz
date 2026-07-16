import type { Metadata } from 'next';

const BASE_URL = 'https://recoder.xyz';

export const metadata: Metadata = {
  title:
    'Recoder vs Cursor vs Replit vs GitHub Copilot - AI Coding Platform Comparison | Recoder.xyz',
  description:
    'Compare Recoder with Cursor, Replit, GitHub Copilot, and Windsurf. See why developers choose Recoder for 40+ AI models, BYOK freedom, multi-agent workflows, self-hosting, and an all-in-one development platform.',
  openGraph: {
    title:
      'Recoder vs Cursor vs Replit vs GitHub Copilot - AI Coding Platform Comparison',
    description:
      'Side-by-side comparison of AI coding platforms. 40+ models, BYOK, Web IDE, CLI, multi-agent workflows, self-hosting, and more.',
    url: `${BASE_URL}/alternatives`,
    siteName: 'Recoder.xyz',
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Recoder vs Cursor vs Replit vs GitHub Copilot - AI Platform Comparison',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title:
      'Recoder vs Cursor vs Replit vs GitHub Copilot - AI Coding Platform Comparison',
    description:
      '40+ AI models, BYOK, multi-agent workflows, self-hosting. See how Recoder compares.',
    images: [`${BASE_URL}/og-image.png`],
  },
  alternates: {
    canonical: `${BASE_URL}/alternatives`,
  },
};

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Recoder vs Cursor vs Replit vs GitHub Copilot - AI Coding Platform Comparison',
  description:
    'Compare Recoder with Cursor, Replit, GitHub Copilot, and Windsurf. Side-by-side feature comparison of AI coding platforms.',
  url: `${BASE_URL}/alternatives`,
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'Recoder',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web, macOS, Linux, Windows',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier with BYOK (Bring Your Own Key)',
    },
    featureList: [
      '40+ AI models',
      'Bring Your Own Key (BYOK)',
      'Web IDE',
      'CLI Tool',
      'Multi-agent workflows',
      'Self-hostable',
      'Project management',
    ],
  },
  isPartOf: {
    '@type': 'WebSite',
    name: 'Recoder.xyz',
    url: BASE_URL,
  },
};

export default function AlternativesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
