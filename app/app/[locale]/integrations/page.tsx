'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { Puzzle, ArrowRight, Key, GitBranch, Cloud, Database, Bot } from 'lucide-react';

export default function IntegrationsPage() {
  const integrations = [
    {
      icon: Key,
      name: 'BYOK — 40+ AI Models',
      description:
        'Bring your own API keys for OpenAI, Anthropic, Google, Meta, Mistral, and more. No markup — you pay providers directly.',
      status: 'Live',
    },
    {
      icon: GitBranch,
      name: 'GitHub',
      description:
        'Connect your repositories for AI-powered code analysis, push/pull, and collaboration workflows.',
      status: 'Live',
    },
    {
      icon: Cloud,
      name: 'Vercel',
      description:
        'Deploy projects to Vercel with one click, including framework detection and deployment history.',
      status: 'Live',
    },
    {
      icon: Database,
      name: 'Supabase',
      description:
        'Connect Supabase projects for database management, edge functions, and real-time features.',
      status: 'Live',
    },
    {
      icon: Database,
      name: 'Neon PostgreSQL',
      description:
        'Serverless Postgres with branch-based database snapshots and point-in-time restore.',
      status: 'Live',
    },
    {
      icon: Bot,
      name: 'MCP (Model Context Protocol)',
      description:
        'Extend AI capabilities with custom MCP servers for tool use and context integration.',
      status: 'Live',
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Puzzle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Integrations</h1>
          <p className="text-xl text-gray-400">
            Connect Recoder with the tools and services you already use.
          </p>
        </div>

        <div className="space-y-6 mb-16">
          {integrations.map((item) => (
            <div
              key={item.name}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 flex items-start space-x-4"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-1">
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 font-medium">
                    {item.status}
                  </span>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Coming Soon */}
        <div className="mb-16 p-8 rounded-2xl border border-white/10 bg-white/5 text-center">
          <h2 className="text-xl font-semibold mb-3">More Integrations Coming</h2>
          <p className="text-gray-400 mb-6">
            We&apos;re actively building more integrations. If there&apos;s a tool you&apos;d like
            to see connected to Recoder, let us know.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center space-x-2 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <span>Request an integration</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try Recoder Free
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
