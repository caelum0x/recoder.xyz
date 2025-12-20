import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

// Force all pages to be rendered dynamically
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Recoder.xyz - FREE AI Coding Platform | Web IDE + CLI with 40+ Models',
  description: 'The only platform with seamless Web IDE + Terminal CLI sync. 100% FREE beta with BYOK (Bring Your Own Key). Access Claude, GPT-4, Gemini & 40+ AI models. Start in browser, continue in terminal.',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' }
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon.png',
    other: [
      { rel: 'android-chrome', url: '/android-chrome-192x192.png', sizes: '192x192' }
    ]
  },
  keywords: [
    'AI coding platform',
    'free AI development',
    'BYOK AI',
    'Claude Code alternative',
    'Bolt.new alternative',
    'web IDE CLI sync',
    'AI code generator',
    'multi-AI platform',
    'GPT-4 coding',
    'Claude 3.5 Sonnet',
    'OpenRouter',
    'terminal AI coding',
    'browser coding IDE',
    'free AI developer tools',
    'bring your own API key'
  ],
  authors: [{ name: 'Recoder Team' }],
  category: 'Technology',
  openGraph: {
    title: 'Recoder.xyz - FREE AI Coding Platform | Web IDE + CLI Sync',
    description: 'The only platform with seamless Web IDE + Terminal CLI sync. 100% FREE beta with BYOK. Access 40+ AI models including Claude, GPT-4, Gemini.',
    url: 'https://recoder.xyz',
    siteName: 'Recoder.xyz',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder.xyz - Web IDE + CLI Sync Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz - FREE AI Coding Platform',
    description: 'Seamless Web IDE + CLI sync. 100% FREE beta with BYOK. 40+ AI models.',
    creator: '@recoderxyz',
    images: ['https://recoder.xyz/twitter-card.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://recoder.xyz',
  },
  verification: {
    google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // other: 'your-other-verification-code',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}