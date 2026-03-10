'use client';

import Link from 'next/link';
import { ArrowRight, Bot, Workflow, Code2, Terminal, Sparkles, Globe } from 'lucide-react';
import { getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const agentPlatforms = [
  {
    id: 'agents',
    name: 'Recoder Agents',
    description: 'Autonomous AI agents that write, debug, and deploy code. Full IDE with agent-powered workflows, file management, and browser automation.',
    icon: Bot,
    color: 'from-blue-500 to-cyan-500',
    features: ['Autonomous coding agents', 'Browser automation', 'File management', 'Sandbox execution'],
  },
  {
    id: 'agency',
    name: 'Recoder Agency',
    description: 'Multi-agent orchestration platform. Build, deploy, and manage AI agent workflows that collaborate on complex tasks.',
    icon: Workflow,
    color: 'from-purple-500 to-pink-500',
    features: ['Multi-agent workflows', 'Agent orchestration', 'Task delegation', 'Custom triggers'],
  },
  {
    id: 'web',
    name: 'Recoder Web IDE',
    description: 'Browser-based AI development environment. Build full-stack applications with AI assistance, real-time preview, and instant deployment.',
    icon: Code2,
    color: 'from-orange-500 to-yellow-500',
    features: ['In-browser development', 'Real-time preview', 'Full-stack support', 'Instant deploy'],
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'Open-source AI tools and agent framework. Build custom agents, manage workflows, and extend the ecosystem with plugins.',
    icon: Terminal,
    color: 'from-green-500 to-emerald-500',
    features: ['Open-source agents', 'Plugin system', 'CLI tools', 'Workflow automation'],
  },
  {
    id: 'studio',
    name: 'Recoder Studio',
    description: 'Visual workflow designer for AI agents. Drag-and-drop interface to build complex agent pipelines without code.',
    icon: Sparkles,
    color: 'from-indigo-500 to-violet-500',
    features: ['Visual designer', 'Drag-and-drop', 'Pipeline builder', 'No-code agent creation'],
  },
];

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Hero */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-8">
            <Bot className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">AI Agent Ecosystem</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
              AI Agents
            </span>
            {' '}for Every Task
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12">
            Five specialized platforms for building, deploying, and managing AI agents.
            From autonomous coding to visual workflow design.
          </p>
        </div>
      </section>

      {/* Agent Platforms Grid */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {agentPlatforms.map((platform) => {
              const Icon = platform.icon;
              const url = getServiceUrlClient(platform.id);
              return (
                <div
                  key={platform.id}
                  className="group relative bg-zinc-900 border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{platform.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 leading-relaxed">{platform.description}</p>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {platform.features.map((feature) => (
                      <span key={feature} className="text-xs px-2 py-1 bg-white/5 border border-white/10 rounded-md text-gray-400">
                        {feature}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center space-x-4">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r ${platform.color} rounded-lg text-sm font-medium hover:opacity-90 transition-opacity`}
                    >
                      <Globe className="w-4 h-4" />
                      <span>Launch</span>
                    </a>
                    <Link
                      href={`/platform/${platform.id}`}
                      className="text-sm text-gray-400 hover:text-white transition-colors flex items-center space-x-1"
                    >
                      <span>Details</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to build with AI agents?</h2>
          <p className="text-gray-400 mb-8">Start for free with BYOK. No credit card required.</p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/auth/signup"
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Get Started Free
            </Link>
            <Link
              href="/plan"
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors"
            >
              View Plans
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
