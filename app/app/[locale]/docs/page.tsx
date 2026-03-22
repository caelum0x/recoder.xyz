import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BookOpen,
  Terminal,
  Globe,
  MessageSquare,
  Code2,
  Rocket,
  ArrowRight,
  FileText,
  Video,
  Github,
  Sparkles,
  Network,
  Boxes
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Documentation - Recoder.xyz',
  description: 'Comprehensive documentation for Recoder.xyz. Guides for the CLI, Web IDE, AI providers, API reference, and more.',
  openGraph: {
    title: 'Documentation - Recoder.xyz',
    description: 'Comprehensive documentation for Recoder.xyz. Guides for the CLI, Web IDE, AI providers, API reference, and more.',
    url: 'https://recoder.xyz/docs',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder Documentation' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Documentation - Recoder.xyz',
    description: 'Comprehensive documentation for Recoder.xyz. Guides for the CLI, Web IDE, AI providers, and API reference.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/docs',
  },
};

export default function DocsPage() {
  const docSections = [
    {
      title: 'Getting Started',
      description: 'Quick setup guides and first steps with Recoder',
      icon: Rocket,
      articles: [
        { title: 'Installation Guide', href: '/docs/installation', status: 'available' },
        { title: 'First Project', href: '/docs/first-project', status: 'available' },
        { title: 'Authentication Setup', href: '/docs/auth-setup', status: 'available' },
        { title: 'API Keys Configuration', href: '/docs/api-keys', status: 'available' }
      ]
    },
    {
      title: 'CLI Documentation',
      description: 'Complete reference for the Recoder CLI',
      icon: Terminal,
      articles: [
        { title: 'CLI Commands Reference', href: '/docs/cli/commands', status: 'available' },
        { title: 'Natural Language Interface', href: '/docs/cli/natural-language', status: 'available' },
        { title: 'Multi-AI Integration', href: '/docs/cli/multi-ai', status: 'available' },
        { title: 'Project Templates', href: '/docs/cli/templates', status: 'coming-soon' }
      ]
    },
    {
      title: 'Web Platform',
      description: 'Using the web-based development environment',
      icon: Globe,
      articles: [
        { title: 'Platform Overview', href: '/docs/web/overview', status: 'available' },
        { title: 'Code Generation', href: '/docs/web/code-generation', status: 'available' },
        { title: 'Real-time Collaboration', href: '/docs/web/collaboration', status: 'available' },
        { title: 'Deployment Pipeline', href: '/docs/web/deployment', status: 'coming-soon' }
      ]
    },
    {
      title: 'Chat Platform',
      description: 'AI-powered chat interface for development',
      icon: MessageSquare,
      articles: [
        { title: 'Chat Interface Guide', href: '/docs/chat/interface', status: 'available' },
        { title: 'Artifact Generation', href: '/docs/chat/artifacts', status: 'available' },
        { title: 'Context Management', href: '/docs/chat/context', status: 'available' },
        { title: 'Custom Prompts', href: '/docs/chat/prompts', status: 'coming-soon' }
      ]
    },
    {
      title: 'AI Providers',
      description: 'Working with different AI models and providers',
      icon: Code2,
      articles: [
        { title: 'Supported Providers', href: '/docs/ai/providers', status: 'available' },
        { title: 'Model Selection', href: '/docs/ai/model-selection', status: 'available' },
        { title: 'Custom Models', href: '/docs/ai/custom-models', status: 'available' },
        { title: 'Local AI Setup (Ollama)', href: '/docs/ai/local-setup', status: 'available' }
      ]
    },
    {
      title: 'API Reference',
      description: 'Complete API documentation for developers',
      icon: FileText,
      articles: [
        { title: 'REST API Overview', href: '/docs/api/rest', status: 'available' },
        { title: 'Authentication', href: '/docs/api/auth', status: 'available' },
        { title: 'WebSocket Events', href: '/docs/api/websocket', status: 'available' },
        { title: 'Rate Limits', href: '/docs/api/rate-limits', status: 'available' }
      ]
    },
    {
      title: 'A2A (Agent-to-Agent)',
      description: 'Connect AI tools through the A2A protocol',
      icon: Network,
      articles: [
        { title: 'A2A Overview', href: '/docs/a2a', status: 'available' },
        { title: 'Claude Code MCP Setup', href: '/docs/a2a/mcp-setup', status: 'available' },
        { title: 'SDK Reference', href: '/docs/a2a/sdk', status: 'available' },
        { title: 'Cross-App Workflows', href: '/docs/a2a/workflows', status: 'available' }
      ]
    },
    {
      title: 'Platform Integration',
      description: 'Connect agents, PM, agency, and social channels',
      icon: Boxes,
      articles: [
        { title: 'Agents Platform', href: '/docs/platform/agents', status: 'available' },
        { title: 'Project Management', href: '/docs/platform/pm', status: 'available' },
        { title: 'Agency Workflows', href: '/docs/platform/agency', status: 'available' },
        { title: 'OpenClaw Channels', href: '/docs/platform/openclaw', status: 'available' }
      ]
    }
  ];

  const quickLinks = [
    { title: 'Getting Started', href: '/docs/getting-started', icon: Rocket, description: 'Set up your account in 5 minutes' },
    { title: 'FAQ', href: '/docs/faq', icon: BookOpen, description: 'Frequently asked questions' },
    { title: 'Install CLI', href: '/cli', icon: Terminal, description: 'Get started with the command line' },
    { title: 'Open Web Platform', href: '/platform/web', icon: Globe, description: 'Launch the web interface' }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-orange-500/20 bg-orange-500/5 mb-6">
            <BookOpen className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-orange-500">Documentation</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
              Learn Recoder
            </span>
          </h1>
          <p className="text-xl text-gray-400 mb-12">
            Everything you need to build production-ready applications with AI
          </p>

          {/* Quick Links */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {quickLinks.map((link, index) => {
              const Icon = link.icon;
              return (
                <Link 
                  key={index} 
                  href={link.href}
                  className="p-4 rounded-lg border border-white/10 bg-white/5 hover:border-orange-500/30 hover:bg-white/10 transition-all flex flex-col items-center text-center space-y-2"
                >
                  <Icon className="w-6 h-6 text-orange-500" />
                  <span className="font-medium">{link.title}</span>
                  <span className="text-xs text-gray-400">{link.description}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <div
                  key={index}
                  className="p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold">{section.title}</h3>
                  </div>
                  <p className="text-gray-400 text-sm mb-6">{section.description}</p>
                  
                  <div className="space-y-2">
                    {section.articles.map((article, articleIndex) => (
                      <div key={articleIndex} className="flex items-center justify-between py-2 border-b border-white/5">
                        <Link 
                          href={article.href}
                          className="flex items-center space-x-2 text-sm hover:text-orange-500 transition-colors group"
                        >
                          <span>{article.title}</span>
                          <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </Link>
                        <span className={`text-xs px-2 py-1 rounded ${
                          article.status === 'available' 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-gray-500/10 text-gray-500'
                        }`}>
                          {article.status === 'available' ? 'Live' : 'Soon'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Additional Resources */}
          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center mb-12">Additional Resources</h2>
            <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl border border-white/10 bg-black/50 text-center space-y-4">
                <Video className="w-12 h-12 mx-auto text-red-500" />
                <h3 className="text-xl font-bold">Video Tutorials</h3>
                <p className="text-sm text-gray-400">
                  Step-by-step video guides for common workflows
                </p>
                <Link 
                  href="/docs/videos" 
                  className="inline-block px-6 py-2 border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                >
                  Watch Tutorials
                </Link>
              </div>

              <div className="p-6 rounded-2xl border border-white/10 bg-black/50 text-center space-y-4">
                <Github className="w-12 h-12 mx-auto text-gray-400" />
                <h3 className="text-xl font-bold">GitHub</h3>
                <p className="text-sm text-gray-400">
                  Follow our development and contribute
                </p>
                <a
                  href="https://github.com/recoderxyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-2 border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                >
                  View GitHub
                </a>
              </div>

              <div className="p-6 rounded-2xl border border-white/10 bg-black/50 text-center space-y-4">
                <MessageSquare className="w-12 h-12 mx-auto text-purple-500" />
                <h3 className="text-xl font-bold">Get in Touch</h3>
                <p className="text-sm text-gray-400">
                  Email us or message on Twitter
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="mailto:recoderxyz@gmail.com"
                    className="inline-block px-6 py-2 border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                  >
                    Email Us
                  </a>
                  <a
                    href="https://twitter.com/recoderxyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-6 py-2 border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                  >
                    Twitter
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}