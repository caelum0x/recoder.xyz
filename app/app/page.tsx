import Link from 'next/link';
import { Terminal, Globe, ArrowRight, Github, Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Minimal Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          
          <nav className="flex items-center space-x-8">
            <Link href="/docs" className="text-sm text-gray-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
              Pricing
            </Link>
            <Link 
              href="/auth/signin" 
              className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section - Minimal & Bold */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-orange-500/20 bg-orange-500/5">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-500">Production-Ready AI Development</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              Build Real
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
                Software Faster
              </span>
            </h1>
            
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Two powerful tools. One mission: Transform how you build software with AI.
            </p>

            <div className="flex items-center justify-center space-x-4 pt-8">
              <Link
                href="/cli"
                className="group px-8 py-4 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="https://github.com/recoder-xyz"
                className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <Github className="w-4 h-4" />
                <span>GitHub</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Products - Focused */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center mb-16">
            Our Products
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Recoder Code (CLI) */}
            <Link href="/cli" className="group">
              <div className="relative h-full p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/5 to-transparent hover:border-orange-500/30 transition-all duration-300">
                <div className="absolute top-8 right-8">
                  <Terminal className="w-12 h-12 text-orange-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                </div>
                
                <div className="space-y-4">
                  <div className="inline-flex px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <span className="text-xs font-medium text-orange-500">CLI</span>
                  </div>
                  
                  <h3 className="text-3xl font-bold">recoder-code</h3>
                  
                  <p className="text-gray-400 text-lg">
                    Terminal-first AI development. Generate production-ready code from your command line.
                  </p>
                  
                  <div className="space-y-2 pt-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Multi-AI integration (Claude, GPT, Gemini)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Real code generation, not mock</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span>Instant deployment ready</span>
                    </div>
                  </div>

                  <div className="pt-6">
                    <div className="inline-flex items-center space-x-2 text-orange-500 group-hover:text-orange-400 transition-colors">
                      <span className="font-medium">Install CLI</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Recoder Web */}
            <Link href="/platform/web" className="group">
              <div className="relative h-full p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/5 to-transparent hover:border-purple-500/30 transition-all duration-300">
                <div className="absolute top-8 right-8">
                  <Globe className="w-12 h-12 text-purple-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                </div>
                
                <div className="space-y-4">
                  <div className="inline-flex px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
                    <span className="text-xs font-medium text-purple-500">WEB</span>
                  </div>
                  
                  <h3 className="text-3xl font-bold">recoder-web</h3>
                  
                  <p className="text-gray-400 text-lg">
                    Visual AI development platform. Build, collaborate, and ship from your browser.
                  </p>
                  
                  <div className="space-y-2 pt-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>Real-time collaboration</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>AI code assistant built-in</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span>Zero setup required</span>
                    </div>
                  </div>

                  <div className="pt-6">
                    <div className="inline-flex items-center space-x-2 text-purple-500 group-hover:text-purple-400 transition-colors">
                      <span className="font-medium">Launch Platform</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats - Minimal */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-orange-500">10K+</div>
              <div className="text-sm text-gray-500">Active Developers</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-purple-500">1M+</div>
              <div className="text-sm text-gray-500">Lines Generated</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-orange-500">25K+</div>
              <div className="text-sm text-gray-500">Projects</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-purple-500">15+</div>
              <div className="text-sm text-gray-500">AI Models</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Clean */}
      <section className="py-32 px-6">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-5xl font-bold">
            Ready to build the future?
          </h2>
          <p className="text-xl text-gray-400">
            Start shipping production-ready code with AI today.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
            >
              Start Free Trial
            </Link>
            <Link
              href="/docs"
              className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
            >
              View Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
              <span className="font-bold">recoder</span>
            </div>
            
            <div className="flex items-center space-x-8 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              <Link href="https://github.com/recoder-xyz" className="hover:text-white transition-colors">GitHub</Link>
            </div>
            
            <div className="text-sm text-gray-500">
              © 2024 Recoder.xyz
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
