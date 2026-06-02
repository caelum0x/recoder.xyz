import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  Terminal, Globe, Cpu, Shield, Zap, Code2,
  GitBranch, Database, Cloud, Lock, Sparkles, ArrowRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Features - AI-Powered Development Tools | Recoder.xyz',
  description: 'Explore Recoder features: CLI tool, Spaces, 40+ AI models, BYOK support, real-time code generation, Git integration, multi-language support, database management, and cloud deployment to AWS, Vercel, Docker, and Kubernetes.',
  openGraph: {
    title: 'Features - AI-Powered Development Tools | Recoder.xyz',
    description: 'CLI tool, Spaces, 40+ AI models, BYOK support, production-ready code generation, Git integration, and cloud deployment.',
    url: 'https://recoder.xyz/features',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Features - AI-Powered Development Tools',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features - AI-Powered Development Tools',
    description: 'CLI, Spaces, 40+ AI models, BYOK, real-time code generation, Git integration, and cloud deployment.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/features',
  },
};

export default function FeaturesPage() {
  const features = [
    {
      icon: Terminal,
      title: 'CLI Tool',
      description: 'Powerful terminal-based development with AI assistance. Generate, refactor, and deploy code directly from your terminal.',
      color: 'from-orange-500 to-red-600'
    },
    {
      icon: Globe,
      title: 'Spaces',
      description: 'Full-featured browser-based code editor with AI integration. Code anywhere, anytime, on any device.',
      color: 'from-blue-500 to-cyan-600'
    },
    {
      icon: Cpu,
      title: '40+ AI Models',
      description: 'Access GPT-4, Claude, Gemini, Llama, and more. Choose the best model for each task automatically.',
      color: 'from-purple-500 to-pink-600'
    },
    {
      icon: Shield,
      title: 'Privacy First',
      description: 'Your code stays yours. Use local models with Ollama or cloud providers - you control your data.',
      color: 'from-green-500 to-emerald-600'
    },
    {
      icon: Zap,
      title: 'Real Code Generation',
      description: 'Generate production-ready code, not mockups. Working APIs, databases, and deployments.',
      color: 'from-yellow-500 to-orange-600'
    },
    {
      icon: Code2,
      title: 'Multi-Language Support',
      description: 'TypeScript, Python, Rust, Go, Solidity, and more. Full-stack development in any language.',
      color: 'from-indigo-500 to-purple-600'
    },
    {
      icon: GitBranch,
      title: 'Git Integration',
      description: 'Seamless version control integration. Commit, push, and manage branches with AI assistance.',
      color: 'from-gray-500 to-gray-700'
    },
    {
      icon: Database,
      title: 'Database Support',
      description: 'PostgreSQL, MongoDB, Redis, and more. Generate schemas, migrations, and queries.',
      color: 'from-teal-500 to-cyan-600'
    },
    {
      icon: Cloud,
      title: 'Cloud Deployment',
      description: 'Deploy to AWS, Vercel, Docker, Kubernetes. Infrastructure as code generation.',
      color: 'from-sky-500 to-blue-600'
    },
    {
      icon: Lock,
      title: 'Bring Your Own Key',
      description: '100% free platform. Use your own API keys and pay providers directly with no markup.',
      color: 'from-rose-500 to-red-600'
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-orange-500">Powerful Features</span>
          </div>
          <h1 className="text-5xl font-bold mb-6">Everything You Need to Build</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            AI-powered development tools that generate real, production-ready code.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map((feature, i) => (
            <div key={i} className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all group">
              <div className={`w-12 h-12 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
