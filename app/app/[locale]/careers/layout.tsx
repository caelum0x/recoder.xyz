import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers at Recoder - Join Our AI Development Team | Recoder.xyz',
  description: 'Join the Recoder team and help revolutionize software development with AI. We offer remote-first roles in engineering, AI research, design, and more with competitive compensation, equity, and comprehensive benefits.',
  openGraph: {
    title: 'Careers at Recoder - Join Our AI Development Team | Recoder.xyz',
    description: 'Remote-first roles in engineering, AI research, design, and more. Competitive compensation, equity, and comprehensive benefits.',
    url: 'https://recoder.xyz/careers',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Careers at Recoder - Join Our AI Development Team',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Careers at Recoder - Join Our AI Development Team',
    description: 'Remote-first roles in engineering, AI research, design, and more. Help build the future of AI-powered development.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/careers',
  },
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
