import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import React from 'react';
import ProductionEngineBanner, { ProductionEngineFeatureSection } from './components/ProductionEngineBanner';
import { 
  Terminal, 
  Globe, 
  MessageSquare, 
  Code2, 
  Puzzle, 
  Zap,
  Shield,
  Users,
  ArrowRight,
  Github,
  Download
} from 'lucide-react';

export default function HomePage() {
  const products = [
    {
      name: 'Recoder CLI',
      description: 'Powerful AI-powered command-line interface for developers',
      icon: Terminal,
      href: '/cli',
      status: 'Available',
      features: ['Multi-AI Integration', 'Real Code Generation', 'Production Ready'],
      buttonText: 'Install CLI'
    },
    {
      name: 'Recoder Web',
      description: 'Web-based AI development platform with real-time collaboration',
      icon: Globe,
      href: '/platform/web',
      status: 'Available',
      features: ['Real-time Collaboration', 'AI Code Assistant', 'Template Gallery'],
      buttonText: 'Launch Platform'
    },
    {
      name: 'Recoder Chat',
      description: 'Intelligent chat interface for code discussions and AI assistance',
      icon: MessageSquare,
      href: '/platform/chat',
      status: 'Available',
      features: ['Code Context Aware', 'Multi-Model Support', 'Artifact Generation'],
      buttonText: 'Open Chat'
    },
    {
      name: 'Recoder Extension',
      description: 'VS Code extension bringing AI coding superpowers to your editor',
      icon: Code2,
      href: '/extension',
      status: 'Available',
      features: ['VS Code Integration', 'Context Awareness', 'Multi-Language Support']
    },
    {
      name: 'Recoder Router',
      description: 'Smart routing and orchestration for AI model selection',
      icon: Puzzle,
      href: '/router',
      status: 'Available',
      features: ['Smart Model Selection', 'Load Balancing', 'Cost Optimization']
    },
    {
      name: 'Recoder App Builder',
      description: 'No-code/low-code platform for rapid application development',
      icon: Zap,
      href: '/app-builder',
      status: 'Coming Soon',
      features: ['Visual Development', 'AI-Powered', 'One-Click Deploy']
    }
  ];

  const stats = [
    { label: 'Active Developers', value: '10K+' },
    { label: 'Code Generated', value: '1M+ Lines' },
    { label: 'Projects Created', value: '25K+' },
    { label: 'AI Models Supported', value: '15+' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Recoder.xyz
                </span>
              </div>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <Link href="/docs" className="text-sm font-medium hover:text-blue-600 transition-colors">
                Documentation
              </Link>
              <Link href="/pricing" className="text-sm font-medium hover:text-blue-600 transition-colors">
                Pricing
              </Link>
              <Link href="/about" className="text-sm font-medium hover:text-blue-600 transition-colors">
                About
              </Link>
              <Button asChild>
                <Link href="/auth/signin">Get Started</Link>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Production Engine Banner */}
      <ProductionEngineBanner />

      {/* Hero Section - Completely Redesigned */}
      <section className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900">
        {/* Advanced Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-purple-400/15 to-pink-400/15 rounded-full blur-3xl animate-pulse" style={{'animationDelay': '2s'} as React.CSSProperties}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-300/10 to-purple-300/10 rounded-full blur-3xl animate-spin" style={{'animationDuration': '20s'} as React.CSSProperties}></div>
        </div>
        
        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 opacity-10 dark:opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59,130,246,0.3) 1px, transparent 0)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>
        
        <div className="container mx-auto text-center relative z-10 max-w-6xl">
          {/* Premium Badge */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-blue-200/50 dark:border-slate-700/50 rounded-full px-6 py-3 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Live & Ready for Production</span>
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-bold">ENTERPRISE</div>
            </div>
          </div>
          
          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-8 tracking-tight">
            <span className="block bg-gradient-to-r from-slate-900 via-blue-800 to-slate-900 dark:from-white dark:via-blue-400 dark:to-white bg-clip-text text-transparent">
              The Future of
            </span>
            <span className="block mt-2 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent animate-gradient bg-300% relative">
              AI Development
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-2xl opacity-50 -z-10"></div>
            </span>
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 mb-12 max-w-4xl mx-auto leading-relaxed font-light">
            Generate <strong className="text-slate-900 dark:text-white">production-ready applications</strong> with our unified AI ecosystem.
            <br className="hidden md:block" />
            From CLI to web platforms – everything works together seamlessly.
          </p>
          {/* CTA Buttons - Redesigned */}
          <div className="flex flex-col lg:flex-row gap-6 justify-center items-center mb-16">
            <Button size="lg" asChild className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 px-8 py-4 text-lg font-semibold rounded-2xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300">
              <Link href="/platform/web" className="flex items-center space-x-3 relative z-10">
                <div className="p-2 bg-white/20 rounded-full">
                  <Globe className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold">Launch Recoder Web</div>
                  <div className="text-sm text-blue-100">Start building apps</div>
                </div>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Link>
            </Button>
            
            <Button size="lg" variant="outline" asChild className="group relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 px-8 py-4 text-lg font-semibold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <Link href="/platform/chat" className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                  <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-slate-900 dark:text-white">Open Recoder Chat</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">AI assistant</div>
                </div>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform text-slate-600 dark:text-slate-400" />
              </Link>
            </Button>
          </div>
          
          {/* CLI Installation */}
          <div className="bg-slate-900 dark:bg-slate-800 rounded-2xl p-6 max-w-2xl mx-auto mb-16 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-green-400" />
                <span className="text-white font-medium">Quick Start</span>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
            </div>
            <div className="bg-slate-800 dark:bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <div className="text-green-400">$ npm install -g @recoder/cli</div>
              <div className="text-blue-400 mt-2">$ recoder "build me a React todo app"</div>
              <div className="text-slate-400 mt-2">✓ Generated production-ready application</div>
            </div>
          </div>

          {/* Enhanced Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="text-center stats-animate card-premium p-6" style={{'--delay': `${index * 0.2}s`} as React.CSSProperties}>
                <div className="text-3xl md:text-4xl font-black mb-2">
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {stat.value}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Grid - Redesigned */}
      <section className="section-premium bg-slate-50/50 dark:bg-slate-900/50">
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 badge-premium mb-6">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span>Unified Development Ecosystem</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 text-balance font-display">
              <span className="bg-gradient-to-r from-slate-900 via-blue-800 to-slate-900 dark:from-white dark:via-blue-400 dark:to-white bg-clip-text text-transparent">
                Everything You Need
              </span>
            </h2>
            <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed font-light">
              From CLI tools to web platforms – all working together in perfect harmony.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {products.map((product, index) => {
              const Icon = product.icon;
              const delay = index * 0.1;
              return (
                <div key={index} className="card-premium hover-lift group p-8" style={{'--delay': `${delay}s`} as React.CSSProperties}>
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <Badge 
                      variant={product.status === 'Available' ? 'default' : 'secondary'} 
                      className="px-3 py-1 text-xs font-semibold rounded-full"
                    >
                      {product.status}
                    </Badge>
                  </div>
                  
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold mb-3 group-hover:text-blue-600 transition-colors duration-300">
                      {product.name}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {product.description}
                    </p>
                  </div>
                  
                  <div className="mb-8">
                    <ul className="space-y-3">
                      {product.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                          <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mr-3 flex-shrink-0" />
                          <span className="font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <Button 
                    asChild 
                    className="w-full h-12 rounded-xl font-semibold text-base group-hover:shadow-lg transition-all duration-300"
                    disabled={product.status === 'Coming Soon'}
                  >
                    <Link href={product.href} className="flex items-center justify-center gap-2">
                      <span>{product.status === 'Coming Soon' ? 'Coming Soon' : (product.buttonText || 'Learn More')}</span>
                      {product.status !== 'Coming Soon' && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Production Engine Features Section */}
      <ProductionEngineFeatureSection />

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose Recoder.xyz?
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              We're not just another AI coding tool. We're building the future of software development.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center animate-slide-up glass-effect p-6 rounded-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-float animate-glow">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 animate-pulse-scale">Production Ready</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Generate real, working code that you can deploy immediately. No more mockups or prototypes.
              </p>
            </div>

            <div className="text-center animate-slide-up glass-effect p-6 rounded-xl" style={{'--delay': '0.2'} as React.CSSProperties}>
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-float animate-glow" style={{'--delay': '2'} as React.CSSProperties}>
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 animate-pulse-scale">Multi-AI Intelligence</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Leverage the best of Claude, Groq, Gemini, and more. Smart routing picks the right model for each task.
              </p>
            </div>

            <div className="text-center animate-slide-up glass-effect p-6 rounded-xl" style={{'--delay': '0.4'} as React.CSSProperties}>
              <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-float animate-glow" style={{'--delay': '4'} as React.CSSProperties}>
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 animate-pulse-scale">Developer First</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Built by developers, for developers. Every tool is designed to enhance your existing workflow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600 animate-gradient overflow-hidden">
        {/* Floating Background Elements */}
        <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full animate-float floating-element" style={{'--delay': '1'} as React.CSSProperties}></div>
        <div className="absolute bottom-10 right-10 w-16 h-16 bg-white/10 rounded-full animate-float floating-element" style={{'--delay': '3'} as React.CSSProperties}></div>
        
        <div className="container mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 animate-slide-up animate-pulse-scale">
            Ready to Transform Your Development?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto animate-slide-up">
            Join thousands of developers already building the future with Recoder.xyz
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
            <Button size="lg" variant="secondary" asChild className="glass-card animate-glow">
              <Link href="/auth/signin" className="flex items-center space-x-2">
                <span>Start Building Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white hover:text-blue-600 glass-card animate-hologram" asChild>
              <Link href="https://github.com/recoderxyz" className="flex items-center space-x-2">
                <Github className="w-4 h-4" />
                <span>View on GitHub</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">Recoder.xyz</span>
              </div>
              <p className="text-slate-300">
                Building the future of AI-powered software development.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-slate-300">
                <li><Link href="/cli" className="hover:text-white transition-colors">Recoder CLI</Link></li>
                <li><Link href="/web" className="hover:text-white transition-colors">Recoder Web</Link></li>
                <li><Link href="/chat" className="hover:text-white transition-colors">Recoder Chat</Link></li>
                <li><Link href="/extension" className="hover:text-white transition-colors">VS Code Extension</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-slate-300">
                <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
                <li><Link href="/tutorials" className="hover:text-white transition-colors">Tutorials</Link></li>
                <li><Link href="/api" className="hover:text-white transition-colors">API Reference</Link></li>
                <li><Link href="/community" className="hover:text-white transition-colors">Community</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-slate-300">
                <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link href="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-700 mt-8 pt-8 text-center text-slate-300">
            <p>&copy; 2024 Recoder.xyz. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}