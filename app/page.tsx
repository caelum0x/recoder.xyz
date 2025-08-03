import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
      features: ['Multi-AI Integration', 'Real Code Generation', 'Production Ready']
    },
    {
      name: 'Recoder Web',
      description: 'Web-based AI development platform with real-time collaboration',
      icon: Globe,
      href: '/web',
      status: 'Available',
      features: ['Real-time Collaboration', 'AI Code Assistant', 'Template Gallery']
    },
    {
      name: 'Recoder Chat',
      description: 'Intelligent chat interface for code discussions and AI assistance',
      icon: MessageSquare,
      href: '/chat',
      status: 'Available',
      features: ['Code Context Aware', 'Multi-Model Support', 'Artifact Generation']
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

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <Badge variant="secondary" className="mb-4">
            🚀 Next-Generation AI Development Platform
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
            Build Real Software
            <br />
            with AI Power
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            Recoder.xyz is the ultimate AI-powered development ecosystem. From CLI tools to web platforms, 
            we provide everything you need to build production-ready applications with AI assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" asChild>
              <Link href="/web" className="flex items-center space-x-2">
                <Globe className="w-5 h-5" />
                <span>Try Recoder Web</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/cli" className="flex items-center space-x-2">
                <Terminal className="w-5 h-5" />
                <span>Install CLI</span>
                <Download className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-2xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {stat.value}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-20 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Complete Development Ecosystem
          </h2>
          <p className="text-xl text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            Choose the right tool for your workflow. All Recoder products work seamlessly together.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product, index) => {
              const Icon = product.icon;
              return (
                <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <Badge variant={product.status === 'Available' ? 'default' : 'secondary'}>
                        {product.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                      {product.name}
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-300">
                      {product.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 mb-6">
                      {product.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button 
                      asChild 
                      className="w-full group-hover:bg-blue-600 transition-colors"
                      disabled={product.status === 'Coming Soon'}
                    >
                      <Link href={product.href}>
                        {product.status === 'Coming Soon' ? 'Coming Soon' : 'Learn More'}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

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
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Production Ready</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Generate real, working code that you can deploy immediately. No more mockups or prototypes.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Multi-AI Intelligence</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Leverage the best of Claude, Groq, Gemini, and more. Smart routing picks the right model for each task.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Developer First</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Built by developers, for developers. Every tool is designed to enhance your existing workflow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Development?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of developers already building the future with Recoder.xyz
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/auth/signin" className="flex items-center space-x-2">
                <span>Start Building Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white hover:text-blue-600" asChild>
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