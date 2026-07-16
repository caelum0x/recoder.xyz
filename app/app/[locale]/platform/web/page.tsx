import type { Metadata } from 'next';
import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export const metadata: Metadata = {
  title: 'Recoder Web - Browser-Based AI Development Environment | Recoder.xyz',
  description: 'Write, run, and deploy code directly in your browser with AI assistance. Recoder Web supports 40+ AI models via BYOK, real-time preview, integrated terminal, and instant deployment with WebContainer-based execution.',
  openGraph: {
    title: 'Recoder Web - Browser-Based AI Development Environment | Recoder.xyz',
    description: 'Full-stack development in your browser with 40+ AI models, real-time preview, integrated terminal, and instant deployment.',
    url: 'https://recoder.xyz/platform/web',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Web - Browser-Based AI Development Environment',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Web - Browser-Based AI Development Environment',
    description: 'In-browser full-stack development with 40+ AI models, real-time preview, and instant deployment.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/web',
  },
};

export default function WebPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="web"
      longDescription="Recoder Web is a browser-based AI development environment. Write, run, and deploy code directly in your browser with AI assistance. Supports 40+ AI models via BYOK (Bring Your Own Key) and provides real-time preview, terminal access, and instant deployment."
      features={[
        'In-browser full-stack development',
        'Real-time preview and hot reload',
        'Integrated terminal',
        '40+ AI models via BYOK',
        'WebContainer-based execution',
        'Instant deployment',
        'File system with drag-and-drop',
        'Multi-file editing with AI context',
      ]}
      useCases={[
        'Quick prototyping without local setup',
        'Build and deploy web apps entirely in the browser',
        'Learn to code with AI-powered guidance',
        'Collaborate on projects from any device',
      ]}
    />
  );
}
