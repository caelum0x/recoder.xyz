import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Recoder.xyz - AI-Powered Development Platform',
  description: 'Build real software with AI power. Complete development ecosystem from CLI tools to web platforms.',
  keywords: ['AI development', 'code generation', 'CLI tools', 'web platform', 'chat assistant', 'VS Code extension'],
  authors: [{ name: 'Recoder Team' }],
  openGraph: {
    title: 'Recoder.xyz - AI-Powered Development Platform',
    description: 'Build real software with AI power. Complete development ecosystem from CLI tools to web platforms.',
    url: 'https://recoder.xyz',
    siteName: 'Recoder.xyz',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz - AI-Powered Development Platform',
    description: 'Build real software with AI power. Complete development ecosystem from CLI tools to web platforms.',
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