'use client';

import Link from 'next/link';
import {
  Terminal,
  Globe,
  ArrowRight,
  Copy,
  Check,
  Code,
  Zap,
  Shield,
  Cpu,
  Bot,
  Briefcase,
  LayoutDashboard,
  Phone,
  Network,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { useSession } from '@/lib/session-provider';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';

/* ------------------------------------------------------------------ */
/*  Product definitions                                                */
/* ------------------------------------------------------------------ */
const PRODUCTS = [
  {
    id: 'agents',
    name: 'Agents',
    tagline: 'AI agent dashboard',
    description:
      'Multi-turn conversations with 40+ models. Configure, deploy, and monitor AI agents with full observability.',
    href: () => getServiceUrlClient('agents'),
    external: true,
    color: 'orange',
    icon: Bot,
    features: ['40+ AI models', 'Thread management', 'Agent config & snapshots', 'Real-time monitoring'],
  },
  {
    id: 'web',
    name: 'Web IDE',
    tagline: 'AI-powered code generation',
    description:
      'Full browser IDE with live preview, AI chat, terminal, and deployment. Build complete apps from natural language.',
    href: () => getServiceUrlClient('web'),
    external: true,
    color: 'purple',
    icon: Code,
    features: ['Live preview', 'Built-in terminal', 'AI code generation', 'One-click deploy'],
  },
  {
    id: 'pm',
    name: 'PM',
    tagline: 'AI-first project management',
    description:
      'Project management with AI insights, PRD generation, sprint planning, and automated status tracking.',
    href: () => getServiceUrlClient('pm'),
    external: true,
    color: 'blue',
    icon: LayoutDashboard,
    features: ['AI-generated PRDs', 'Sprint automation', 'Team collaboration', 'Progress insights'],
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Client delivery platform',
    description:
      'AI-powered agency workflows. Manage clients, projects, quotes, and deliverables in one place.',
    href: () => getServiceUrlClient('agency'),
    external: true,
    color: 'emerald',
    icon: Briefcase,
    features: ['Client portal', 'Quote generation', 'Deliverable tracking', 'Template library'],
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    tagline: 'Voice + WhatsApp AI gateway',
    description:
      'Open-source voice and messaging gateway. Connect AI agents to phone calls, WhatsApp, and more.',
    href: () => 'https://openclaw.recoder.xyz',
    external: true,
    color: 'cyan',
    icon: Phone,
    features: ['Voice AI', 'WhatsApp integration', 'Open source', 'Multi-channel'],
  },
  {
    id: 'cli',
    name: 'recoder-code',
    tagline: 'CLI for developers',
    description:
      'Terminal-first AI development. Chat, generate code, manage files, create agents, and sync with the Web IDE.',
    href: () => '/cli',
    external: false,
    color: 'orange',
    icon: Terminal,
    features: ['npx recoder-a2a', '40+ models', 'MCP servers', 'Sandbox mode'],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Color utility                                                      */
/* ------------------------------------------------------------------ */
function colorClasses(color: string) {
  const map: Record<string, { border: string; bg: string; text: string; glow: string; dot: string }> = {
    orange: {
      border: 'border-orange-500/20',
      bg: 'bg-orange-500/5',
      text: 'text-orange-500',
      glow: 'hover:border-orange-500/40 hover:shadow-orange-500/10',
      dot: 'bg-orange-500',
    },
    purple: {
      border: 'border-purple-500/20',
      bg: 'bg-purple-500/5',
      text: 'text-purple-500',
      glow: 'hover:border-purple-500/40 hover:shadow-purple-500/10',
      dot: 'bg-purple-500',
    },
    blue: {
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/5',
      text: 'text-blue-500',
      glow: 'hover:border-blue-500/40 hover:shadow-blue-500/10',
      dot: 'bg-blue-500',
    },
    emerald: {
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      text: 'text-emerald-500',
      glow: 'hover:border-emerald-500/40 hover:shadow-emerald-500/10',
      dot: 'bg-emerald-500',
    },
    cyan: {
      border: 'border-cyan-500/20',
      bg: 'bg-cyan-500/5',
      text: 'text-cyan-500',
      glow: 'hover:border-cyan-500/40 hover:shadow-cyan-500/10',
      dot: 'bg-cyan-500',
    },
  };
  return map[color] ?? map.orange;
}

/* ------------------------------------------------------------------ */
/*  Pricing tiers (summary for landing)                                */
/* ------------------------------------------------------------------ */
const PRICING_TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Bring your own API key',
    features: ['6 sessions / day', 'CLI + Web access', 'Free models unlimited', 'Community support'],
    cta: 'Get Started',
    href: '/auth/signup',
    highlighted: false,
  },
  {
    name: 'Weekly',
    price: '$10',
    period: 'week',
    description: 'Short-term projects',
    features: ['10 sessions / day', 'All AI models included', 'No API key needed', 'Priority support'],
    cta: 'Subscribe',
    href: '/pricing',
    highlighted: false,
  },
  {
    name: 'Monthly',
    price: '$20',
    period: 'month',
    description: 'Best for individuals',
    features: ['15 sessions / day', 'All AI models included', 'API access', 'Team (5 members)'],
    cta: 'Subscribe',
    href: '/pricing',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$100',
    period: 'month',
    description: 'For power users & teams',
    features: ['20 sessions / day', 'Beta model access', 'Custom AI models', 'Team (10 members)'],
    cta: 'Subscribe',
    href: '/pricing',
    highlighted: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedA2a, setCopiedA2a] = useState(false);
  const { data: session } = useSession();

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative pt-24 pb-32 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-to-br from-orange-500/8 via-purple-500/8 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative container mx-auto max-w-5xl text-center space-y-8">
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[1.1]">
            Your AI Agent
            <br />
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
              Platform
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Build, deploy, and orchestrate AI agents across code, projects,
            clients, and voice — all from one platform.
          </p>

          {/* Value pills */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
            {['6 products', '40+ AI models', 'A2A / MCP ready', 'Open source core'].map((v) => (
              <span key={v} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {v}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            {session?.user ? (
              <>
                <LaunchWebIDEButton className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center space-x-2 shadow-lg shadow-orange-500/25">
                  Launch Web IDE <ArrowRight className="w-5 h-5 ml-2" />
                </LaunchWebIDEButton>
                <Link
                  href="/dashboard"
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Get Started <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/docs/getting-started"
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  Documentation
                </Link>
              </>
            )}
          </div>

          <p className="text-xs text-gray-600">
            No credit card required. Free tier available forever.
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRODUCTS — 6 cards                                          */}
      {/* ============================================================ */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">The Platform</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Six purpose-built products that work together — or independently.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCTS.map((product) => {
              const c = colorClasses(product.color);
              const Icon = product.icon;
              const href = product.href();
              const isExternal = product.external;

              const card = (
                <div
                  className={`group relative h-full p-6 rounded-2xl border ${c.border} ${c.bg} ${c.glow} transition-all duration-300 hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${c.text}`} />
                    </div>
                    {isExternal && (
                      <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                    )}
                  </div>

                  <h3 className="text-xl font-bold mb-1">{product.name}</h3>
                  <p className={`text-sm ${c.text} mb-3`}>{product.tagline}</p>
                  <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                    {product.description}
                  </p>

                  <ul className="space-y-2">
                    {product.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-500">
                        <span className={`w-1 h-1 rounded-full ${c.dot}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );

              return isExternal ? (
                <a key={product.id} href={href} target="_blank" rel="noopener noreferrer">
                  {card}
                </a>
              ) : (
                <Link key={product.id} href={href}>
                  {card}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  A2A / MCP Section                                           */}
      {/* ============================================================ */}
      <section className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-transparent via-purple-500/[0.03] to-transparent">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/20 bg-purple-500/5">
              <Network className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-purple-400 font-medium">Agent-to-Agent Protocol</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold">
              Connect Everything with A2A
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Let Claude Code, Codex, Cursor, and any MCP-compatible tool
              talk to your Recoder agents directly.
            </p>
          </div>

          {/* Quick-start command */}
          <div className="max-w-xl mx-auto mb-16">
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-purple-500/20 bg-black/60 backdrop-blur-sm">
              <Terminal className="w-5 h-5 text-purple-400 shrink-0" />
              <code className="text-base md:text-lg font-mono text-white flex-1">
                npx recoder-a2a
              </code>
              <button
                onClick={() => copy('npx recoder-a2a', setCopiedA2a)}
                className="p-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 transition-all shrink-0"
              >
                {copiedA2a ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {copiedA2a && (
              <p className="mt-2 text-sm text-purple-400 text-center">Copied to clipboard</p>
            )}
          </div>

          {/* Architecture diagram (text-based) */}
          <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] font-mono text-sm overflow-x-auto">
            <div className="min-w-[500px] space-y-4 text-gray-400">
              <div className="text-center text-gray-600 mb-6">-- Architecture --</div>

              {/* Row: clients */}
              <div className="flex items-center justify-center gap-6 flex-wrap">
                <span className="px-3 py-1.5 rounded border border-gray-700 text-gray-300">Claude Code</span>
                <span className="px-3 py-1.5 rounded border border-gray-700 text-gray-300">Codex</span>
                <span className="px-3 py-1.5 rounded border border-gray-700 text-gray-300">Cursor</span>
                <span className="px-3 py-1.5 rounded border border-gray-700 text-gray-300">Any MCP Client</span>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="flex flex-col items-center text-gray-600">
                  <span>|</span>
                  <span>MCP / A2A</span>
                  <span>v</span>
                </div>
              </div>

              {/* Gateway */}
              <div className="flex justify-center">
                <span className="px-6 py-2 rounded-lg border border-orange-500/30 bg-orange-500/5 text-orange-400 font-semibold">
                  recoder-a2a gateway
                </span>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="flex flex-col items-center text-gray-600">
                  <span>|</span>
                  <span>v</span>
                </div>
              </div>

              {/* Services */}
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <span className="px-3 py-1.5 rounded border border-orange-500/20 text-orange-400">Agents</span>
                <span className="px-3 py-1.5 rounded border border-purple-500/20 text-purple-400">Web IDE</span>
                <span className="px-3 py-1.5 rounded border border-blue-500/20 text-blue-400">PM</span>
                <span className="px-3 py-1.5 rounded border border-emerald-500/20 text-emerald-400">Agency</span>
                <span className="px-3 py-1.5 rounded border border-cyan-500/20 text-cyan-400">OpenClaw</span>
              </div>
            </div>
          </div>

          {/* A2A capabilities */}
          <div className="grid sm:grid-cols-3 gap-6 mt-12">
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
              <Bot className="w-5 h-5 text-orange-400 mb-3" />
              <h4 className="font-semibold mb-1">Agent Discovery</h4>
              <p className="text-sm text-gray-500">
                Agents publish their capabilities. Any A2A client can discover and invoke them.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
              <Shield className="w-5 h-5 text-purple-400 mb-3" />
              <h4 className="font-semibold mb-1">Secure Handoff</h4>
              <p className="text-sm text-gray-500">
                Token-based auth, scoped permissions, and audit logging for every cross-agent call.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
              <Zap className="w-5 h-5 text-cyan-400 mb-3" />
              <h4 className="font-semibold mb-1">Real-time Streaming</h4>
              <p className="text-sm text-gray-500">
                SSE and WebSocket support for streaming agent responses back to your editor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CLI quick-start                                             */}
      {/* ============================================================ */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-4xl">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-purple-500/10 to-orange-500/10 blur-3xl pointer-events-none" />

            <div className="relative p-10 md:p-14 rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.03] via-purple-500/[0.03] to-transparent backdrop-blur-sm">
              <div className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20">
                  <Terminal className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium text-orange-500">recoder-code CLI</span>
                </div>

                <h2 className="text-3xl md:text-4xl font-bold">
                  Get Started in Seconds
                </h2>

                <p className="text-gray-400 max-w-xl mx-auto">
                  Install the CLI, add your API key, and start building with
                  Claude, GPT-4, Gemini, DeepSeek, and 35+ more models.
                </p>

                <div className="flex items-center gap-3 max-w-md mx-auto p-4 rounded-2xl border border-white/15 bg-black/50">
                  <code className="text-base md:text-lg font-mono text-white flex-1 text-left">
                    npm install -g recoder-code
                  </code>
                  <button
                    onClick={() => copy('npm install -g recoder-code', setCopiedCli)}
                    className="p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 transition-all shrink-0"
                  >
                    {copiedCli ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {copiedCli && (
                  <p className="text-sm text-orange-400">Copied to clipboard</p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                  {[
                    { icon: Cpu, label: '40+ Models', color: 'orange' },
                    { icon: Code, label: 'Code Gen', color: 'purple' },
                    { icon: Zap, label: 'Tool Calling', color: 'orange' },
                    { icon: Shield, label: 'Sandbox', color: 'purple' },
                  ].map(({ icon: I, label, color }) => (
                    <div key={label} className="text-center space-y-2">
                      <div
                        className={`w-10 h-10 mx-auto rounded-xl ${
                          color === 'orange' ? 'bg-orange-500/10 border-orange-500/20' : 'bg-purple-500/10 border-purple-500/20'
                        } border flex items-center justify-center`}
                      >
                        <I className={`w-5 h-5 ${color === 'orange' ? 'text-orange-500' : 'text-purple-500'}`} />
                      </div>
                      <span className="text-xs font-medium text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Stats bar                                                   */}
      {/* ============================================================ */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '6', label: 'Products', color: 'text-orange-500' },
              { value: '40+', label: 'AI Models', color: 'text-purple-500' },
              { value: '17', label: 'MCP Servers', color: 'text-cyan-400' },
              { value: '$0', label: 'To Start', color: 'text-green-400' },
            ].map(({ value, label, color }) => (
              <div key={label} className="text-center space-y-1">
                <div className={`text-4xl font-bold ${color}`}>{value}</div>
                <div className="text-sm text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRICING                                                     */}
      {/* ============================================================ */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">Simple Pricing</h2>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              Start free with your own API key, or let us handle everything.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative p-6 rounded-2xl border transition-all ${
                  tier.highlighted
                    ? 'border-orange-500/40 bg-gradient-to-b from-orange-500/[0.06] to-transparent shadow-lg shadow-orange-500/5'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-orange-500 text-xs font-semibold text-white">
                    Popular
                  </div>
                )}

                <h3 className="text-lg font-bold mb-1">{tier.name}</h3>
                <p className="text-xs text-gray-500 mb-4">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  <span className="text-sm text-gray-500 ml-1">/{tier.period}</span>
                </div>

                <ul className="space-y-2.5 mb-8">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-400">
                      <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={`block w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    tier.highlighted
                      ? 'bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white'
                      : 'border border-white/15 hover:border-white/30 text-white'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-white transition-colors"
            >
              View full pricing details <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Final CTA                                                   */}
      {/* ============================================================ */}
      <section className="py-32 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-3xl text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold">
            Ready to build with AI?
          </h2>
          <p className="text-lg text-gray-400">
            Join thousands of developers building with Recoder.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            {session?.user ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Go to Dashboard <ArrowRight className="w-5 h-5" />
                </Link>
                <LaunchWebIDEButton className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all flex items-center gap-2">
                  Launch Web IDE <ArrowRight className="w-5 h-5" />
                </LaunchWebIDEButton>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Get Started Free <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/docs"
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  Read the Docs
                </Link>
              </>
            )}
          </div>

          <p className="text-xs text-gray-600">
            No credit card required. Free tier available forever.
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <SiteFooter />
    </div>
  );
}
