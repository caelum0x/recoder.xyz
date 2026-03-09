import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import UTMCapture from '@/components/UTMCapture';
import { roobert, roobertMono } from './fonts/roobert';
import { MobileAppBanner } from '@/app/components/MobileAppBanner';

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Recoder.xyz - FREE AI Coding Platform | Web IDE + CLI with 40+ Models',
  description: 'The only platform with seamless Web IDE + Terminal CLI sync. 100% FREE beta with BYOK (Bring Your Own Key). Access Claude, GPT-4, Gemini & 40+ AI models. Start in browser, continue in terminal.',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  keywords: [
    'AI coding platform',
    'free AI development',
    'BYOK AI',
    'Claude Code alternative',
    'AI coding alternative',
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
    google: '', // Set in Google Search Console -> Settings -> Ownership verification
    // yandex: 'your-yandex-verification-code',
    // other: 'your-other-verification-code',
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-V0G79DP41C"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-V0G79DP41C');
            `,
          }}
        />
      </head>
      <body className={`${roobert.variable} ${roobertMono.variable} font-sans`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-orange-500 focus:text-white focus:rounded-lg">Skip to main content</a>
        <UTMCapture />
        <Providers><main id="main-content">{children}</main></Providers>
        <MobileAppBanner />
      </body>
    </html>
  );
}
