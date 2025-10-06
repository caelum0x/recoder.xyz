import Link from 'next/link';
import { Terminal, Copy, CheckCircle, ArrowRight, Zap, Shield, Globe, Sparkles, Code2, Rocket, Download } from 'lucide-react';

export default function CLIPage() {
  const installSteps = [
    {
      title: "Install Recoder CLI",
      code: "npm install -g @recoder/cli",
      description: "Install the CLI in seconds"
    },
    {
      title: "Authenticate",
      code: "recoder auth login",
      description: "Connect to your Recoder.xyz account"
    },
    {
      title: "Start Building",
      code: 'recoder "create a Next.js app with auth"',
      description: "Generate production-ready code instantly"
    }
  ];

  const features = [
    {
      icon: Zap,
      title: "Multi-AI Intelligence",
      description: "Automatically routes to the best AI model (Claude, GPT-4, Gemini)"
    },
    {
      icon: Shield,
      title: "Production Ready",
      description: "Real code that works, not mock implementations"
    },
    {
      icon: Rocket,
      title: "Deploy Instantly",
      description: "From idea to production in minutes"
    }
  ];

  const examples = [
    {
      prompt: 'recoder "build a REST API with auth"',
      description: "Full backend with authentication"
    },
    {
      prompt: 'recoder "create a dashboard with charts"',
      description: "React dashboard with real data"
    },
    {
      prompt: 'recoder "add Stripe payments to my app"',
      description: "Complete payment integration"
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
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

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-orange-500/20 bg-orange-500/5">
              <Terminal className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-500">Terminal-First Development</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              CLI That
              <br />
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Actually Codes
              </span>
            </h1>
            
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Generate production-ready code from your terminal. Multi-AI powered, instantly deployable.
            </p>

            <div className="flex items-center justify-center space-x-4 pt-8">
              <Link
                href="/auth/signup"
                className="group px-8 py-4 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Download className="w-5 h-5" />
                <span>Install Now</span>
              </Link>
              <Link
                href="/docs"
                className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
              >
                View Docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Installation */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Install in 60 Seconds</h2>
            <p className="text-gray-400">Three commands to start building with AI</p>
          </div>

          <div className="space-y-6">
            {installSteps.map((step, index) => (
              <div
                key={index}
                className="relative p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/5 to-transparent hover:border-orange-500/30 transition-all"
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">{step.title}</h3>
                    <p className="text-gray-400">{step.description}</p>
                    <div className="flex items-center space-x-2 p-4 bg-black border border-white/10 rounded-lg font-mono text-sm">
                      <code className="flex-1 text-orange-500">{step.code}</code>
                      <button className="p-2 hover:bg-white/5 rounded transition-colors">
                        <Copy className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center mb-16">Why Recoder CLI?</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="p-8 rounded-2xl border border-white/10 bg-black/50 hover:border-orange-500/30 transition-all"
                >
                  <Icon className="w-12 h-12 text-orange-500 mb-4" />
                  <h3 className="text-2xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">See It In Action</h2>
            <p className="text-gray-400">Real commands, real results</p>
          </div>

          <div className="space-y-6">
            {examples.map((example, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-purple-500/30 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 p-4 bg-black border border-white/10 rounded-lg font-mono text-sm">
                    <Terminal className="w-4 h-4 text-orange-500" />
                    <code className="flex-1 text-green-400">{example.prompt}</code>
                  </div>
                  <p className="text-gray-400 text-sm pl-4">→ {example.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-5xl font-bold">
            Ready to 10x your development speed?
          </h2>
          <p className="text-xl text-gray-400">
            Install the CLI and start building production code in minutes.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <Download className="w-5 h-5" />
              <span>Install Recoder CLI</span>
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
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
              <Link href="mailto:support@recoder.xyz" className="hover:text-white transition-colors">Support</Link>
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
