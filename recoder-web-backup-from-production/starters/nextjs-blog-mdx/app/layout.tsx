import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'My Blog',
    template: '%s | My Blog',
  },
  description: 'A blog about web development, coding, and technology',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://yourblog.com',
    siteName: 'My Blog',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@yourusername',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="bg-gray-900 text-white py-8 mt-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <p>&copy; {new Date().getFullYear()} My Blog. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
