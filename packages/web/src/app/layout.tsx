import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Recoder.xyz - AI-Powered Development CLI',
    template: '%s | Recoder.xyz'
  },
  description: 'Superior AI-powered development platform that generates REAL, production-ready code - not mock implementations. Multi-AI intelligence with specialized agents.',
  keywords: ['AI', 'development', 'CLI', 'code generation', 'blockchain', 'web development', 'production-ready', 'multi-AI', 'automation'],
  authors: [{ name: 'Recoder Team' }],
  creator: 'Recoder Team',
  publisher: 'Recoder.xyz',
  metadataBase: new URL('https://recoder.xyz'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://recoder.xyz',
    siteName: 'Recoder.xyz',
    title: 'Recoder.xyz - AI-Powered Development CLI',
    description: 'Generate REAL, production-ready code with multi-AI intelligence. Unlike other tools, we create working applications, not mock implementations.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder.xyz - AI-Powered Development CLI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz - AI-Powered Development CLI',
    description: 'Generate REAL, production-ready code with multi-AI intelligence',
    images: ['/og-image.png'],
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
  verification: {
    google: 'your-google-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} antialiased bg-gray-50 text-gray-900`}>
        {children}
      </body>
    </html>
  )
}