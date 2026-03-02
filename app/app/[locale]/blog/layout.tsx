import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Blog - Engineering & Product Updates | Recoder.xyz',
    template: '%s | Recoder.xyz Blog',
  },
  description:
    'Engineering insights, product updates, and deep dives from the Recoder team. Learn about AI-powered development, BYOK architecture, and building the future of coding tools.',
  openGraph: {
    title: 'Blog - Engineering & Product Updates | Recoder.xyz',
    description:
      'Engineering insights, product updates, and deep dives from the Recoder team.',
    url: 'https://recoder.xyz/blog',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder.xyz Blog',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog - Engineering & Product Updates | Recoder.xyz',
    description:
      'Engineering insights, product updates, and deep dives from the Recoder team.',
    creator: '@recoderxyz',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/blog',
  },
};

function BreadcrumbSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://recoder.xyz',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://recoder.xyz/blog',
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface BlogLayoutProps {
  children: React.ReactNode;
}

export default function BlogLayout({ children }: BlogLayoutProps) {
  return (
    <>
      <BreadcrumbSchema />
      {children}
    </>
  );
}
