import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Recoder.xyz - AI-Powered Development Platform',
  description: 'Real, production-ready code generation with Claude, Groq, Gemini, and more AI providers. 10x your development speed.',
  keywords: ['AI coding', 'code generation', 'Claude', 'development tools', 'AI assistant'],
  authors: [{ name: 'Recoder Team' }],
  creator: 'Recoder.xyz',
  publisher: 'Recoder.xyz',
  openGraph: {
    title: 'Recoder.xyz - AI-Powered Development Platform',
    description: 'Real, production-ready code generation with multiple AI providers',
    url: 'https://recoder-web.netlify.app',
    siteName: 'Recoder.xyz',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recoder.xyz - AI-Powered Development',
    description: 'Real, production-ready code generation with AI',
  },
  robots: {
    index: true,
    follow: true,
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-primary">Recoder.xyz</h1>
                  <span className="text-sm text-muted-foreground">AI-Powered Development</span>
                </div>
                <nav className="hidden md:flex items-center space-x-6">
                  <a href="/collaborate" className="text-sm font-medium hover:text-primary transition-colors">
                    Collaborate
                  </a>
                  <a href="https://github.com/recoder-xyz" className="text-sm font-medium hover:text-primary transition-colors">
                    GitHub
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t bg-background">
            <div className="container mx-auto px-4 py-8">
              <div className="text-center text-sm text-muted-foreground">
                © 2024 Recoder.xyz. AI-powered development platform for production-ready code.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}