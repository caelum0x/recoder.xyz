import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import UTMCapture from '@/components/UTMCapture';
import { roobert, roobertMono } from './fonts/roobert';
import { MobileAppBanner } from '@/app/components/MobileAppBanner';
import { resolveGaMeasurementId, resolveSiteVerification } from '@/lib/analytics/ga';

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Recoder.xyz - N Agents in Parallel. One Trusted Merge.',
  description: 'Recoder is a self-hosted desktop workspace that runs Claude Code, Codex, and any coding agent in parallel isolated git worktrees — then helps you review and merge the best result. BYOK.',
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
    'coding agents',
    'BYOK AI',
    'Claude Code',
    'Codex CLI',
    'opencode',
    'parallel coding agents',
    'git worktrees',
    'agent orchestration',
    'diff review',
    'terminal AI coding',
    'self-hosted AI coding',
    'free AI developer tools',
    'bring your own API key'
  ],
  authors: [{ name: 'Recoder Team' }],
  category: 'Technology',
  openGraph: {
    title: 'Recoder.xyz - N Agents in Parallel. One Trusted Merge.',
    description: 'Run your coding agents in parallel isolated git worktrees, compare their diffs, and merge the best result. Self-hosted desktop app. BYOK.',
    url: 'https://recoder.xyz',
    siteName: 'Recoder.xyz',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder.xyz - Parallel Coding Agent Workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz - N Agents in Parallel. One Trusted Merge.',
    description: 'Run coding agents in parallel git worktrees, review the diffs, merge the best. Self-hosted. BYOK.',
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
  // Site-ownership verification tokens resolve from env (owner-provided). Empty
  // ⇒ omitted, so no empty <meta> tags ship. See @/lib/analytics/ga.
  // - NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION (Google Search Console)
  // - NEXT_PUBLIC_BING_SITE_VERIFICATION   (Bing Webmaster Tools)
  verification: resolveSiteVerification(),
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps) {
  // GA4 measurement id resolves from NEXT_PUBLIC_GA_ID (fallback = current prod
  // id) so nothing breaks in prod and the owner can rotate it via env. This is
  // the in-code event layer only; Cloudflare Web Analytics covers pageviews at
  // the edge — do NOT add a second pageview beacon here.
  const gaMeasurementId = resolveGaMeasurementId();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Analytics */}
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}');
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
