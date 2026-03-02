import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recoder Chat - AI Conversation Interface for Coding | Recoder.xyz',
  description: 'Intelligent AI conversation interface for coding assistance. Recoder Chat supports multi-AI model conversations, code context awareness, artifact generation, and cross-platform session synchronization.',
  openGraph: {
    title: 'Recoder Chat - AI Conversation Interface for Coding | Recoder.xyz',
    description: 'Multi-AI conversation interface with code context awareness, artifact generation, and cross-platform session sync.',
    url: 'https://recoder.xyz/platform/chat',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Chat - AI Conversation Interface for Coding',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder Chat - AI Conversation Interface for Coding',
    description: 'Multi-AI conversations with code context awareness, artifact generation, and cross-platform sync.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/platform/chat',
  },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
