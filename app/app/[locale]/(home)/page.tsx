'use client';

import Link from 'next/link';
import {
  Terminal,
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
  Network,
  ArrowUpRight,
} from 'lucide-react';
import { useState } from 'react';
import { getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { useSession } from '@/lib/session-provider';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';

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

  const trackCta = (ctaLabel: string, destination: string, location: string) => {
    trackEvent(AnalyticsEvents.CTA_CLICKED, {
      ctaLabel,
      destination,
      location,
      source: 'homepage',
    });
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
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:32px_32px]" />

        <div className="relative container mx-auto max-w-5xl text-center space-y-8">
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[1.1]">
            Build with AI.
            <br />
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
              Keep control.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Recoder gives you agents, a Web IDE, CLI, PM, and agency workflows in one system.
            Bring your own model keys, move quickly, and avoid procurement drag from day one.
          </p>

          {/* Value pills */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
            {['BYOK first', '40+ AI models', 'A2A / MCP ready', 'No credit card to start'].map((v) => (
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
                <Link
                  href="/dashboard"
                  onClick={() => trackCta('Go to Dashboard', '/dashboard', 'hero')}
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Go to Dashboard <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/projects"
                  onClick={() => trackCta('View Projects', '/projects', 'hero')}
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  View Projects
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  onClick={() => trackCta('Get Started', '/auth/signup', 'hero')}
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Get Started <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/docs/getting-started"
                  onClick={() => trackCta('Documentation', '/docs/getting-started', 'hero')}
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  Documentation
                </Link>
              </>
            )}
          </div>

          <p className="text-xs text-gray-600">
            Start with your own keys, invite your team later, and keep provider-level cost visibility.
          </p>

          <div className="mx-auto max-w-5xl pt-10">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_1.25fr] text-left">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8 backdrop-blur-sm">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
                  Activation path
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3">From signup to first shipped output, without tool churn</h2>
                <p className="text-sm md:text-base text-gray-400 mb-6">
                  Recoder is designed for a clean first run: sign in, connect a provider, start in the right surface, and keep moving as the work grows.
                </p>
                <div className="space-y-4">
                  {[
                    ['01', 'Sign in with GitHub or Google', 'No payment gate. Start with your own provider keys.'],
                    ['02', 'Connect OpenRouter, OpenAI, Anthropic, or Google', 'BYOK keeps model choice and cost control in your hands.'],
                    ['03', 'Start in Agents, CLI, Web IDE, PM, or Agency', 'Use one system across coding, planning, and delivery.'],
                  ].map(([step, title, text]) => (
                    <div key={step} className="flex items-start gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                        {step}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white mb-1">{title}</h3>
                        <p className="text-sm text-gray-400">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 md:p-6 backdrop-blur-sm shadow-2xl shadow-purple-500/10">
                <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-400/80" />
                    <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
                    <span className="h-3 w-3 rounded-full bg-green-400/80" />
                  </div>
                  <span className="text-xs text-gray-500">demo workflow</span>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-2xl border border-purple-500/20 bg-black/50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-purple-400">
                      <Code className="w-4 h-4" />
                      Web IDE / Agents preview
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#0a0a0f] p-4 font-mono text-xs text-gray-300 space-y-2">
                      <div><span className="text-orange-400">$</span> build a landing page with BYOK onboarding</div>
                      <div className="text-gray-500">scaffold app → connect provider → preview ready</div>
                      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-cyan-300">
                        Preview URL ready
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="h-16 rounded-lg bg-orange-500/10 border border-orange-500/20" />
                        <div className="h-16 rounded-lg bg-purple-500/10 border border-purple-500/20" />
                        <div className="h-16 rounded-lg bg-cyan-500/10 border border-cyan-500/20" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm text-orange-400">
                        <Bot className="w-4 h-4" />
                        Agents
                      </div>
                      <p className="text-sm text-gray-400">Multi-turn work, tool execution, preview-ready outputs.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm text-purple-400">
                        <Terminal className="w-4 h-4" />
                        CLI
                      </div>
                      <p className="text-sm text-gray-400">Keep your editor, terminal flow, and model choice intact.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm text-cyan-400">
                        <LayoutDashboard className="w-4 h-4" />
                        PM + Agency
                      </div>
                      <p className="text-sm text-gray-400">Turn coding momentum into planning and delivery without leaving the system.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                */}
      {/* ============================================================ */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-14 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">The shortest path from signup to shipped work</h2>
            <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto">
              Recoder is built to get developers and teams into a real workflow quickly, without waiting on pricing approvals or locked-in model access.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Add your model keys',
                text: 'Connect OpenRouter, Anthropic, OpenAI, or Google and keep your model choices under your control.',
              },
              {
                step: '02',
                title: 'Pick the right surface',
                text: 'Use Agents for multi-turn work, Web IDE for live builds, CLI for terminal flow, and PM or Agency when the work expands.',
              },
              {
                step: '03',
                title: 'Ship with one system',
                text: 'Move across products without rethinking your setup every time the work changes from coding to planning to delivery.',
              },
            ].map((item) => (
              <div key={item.step} className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="text-sm font-mono text-orange-500 mb-4">{item.step}</div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRODUCTS — 6 cards                                          */}
      {/* ============================================================ */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">One system, five working surfaces</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Start with the surface that matches the job right now, then move between them as the work changes.
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
                  Bring your own keys, keep your workflow
                </h2>

                <p className="text-gray-400 max-w-xl mx-auto">
                  Install the CLI, connect your providers, and work across browser and terminal without giving up model choice or cost control.
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
              { value: '5', label: 'Working surfaces', color: 'text-orange-500' },
              { value: '40+', label: 'AI Models', color: 'text-purple-500' },
              { value: '17', label: 'MCP Servers', color: 'text-cyan-400' },
              { value: 'BYOK', label: 'Default model policy', color: 'text-green-400' },
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
      {/*  BYOK VALUE                                                  */}
      {/* ============================================================ */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">Why teams start here</h2>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              The product is designed to remove the usual blockers that slow evaluation and rollout.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'BYOK first',
                text: 'Bring OpenRouter, Anthropic, OpenAI, or Google keys and start immediately.',
              },
              {
                title: 'No sales gate',
                text: 'Developers and operators can start using the product before internal buying processes catch up.',
              },
              {
                title: 'Real cost control',
                text: 'Your model spend stays visible at the provider, instead of being hidden behind markup.',
              },
              {
                title: 'Faster activation',
                text: 'The shortest path is sign up, connect keys, launch the right surface, and start shipping work.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]"
              >
                <h3 className="text-lg font-bold mb-3">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 text-sm text-gray-500">
            Recoder can grow into paid/team motions later. The public site should optimize for activation first.
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
                  onClick={() => trackCta('Go to Dashboard', '/dashboard', 'final_cta')}
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Go to Dashboard <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/projects"
                  onClick={() => trackCta('View Projects', '/projects', 'final_cta')}
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all"
                >
                  View Projects
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  onClick={() => trackCta('Get Started Free', '/auth/signup', 'final_cta')}
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                >
                  Get Started Free <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/docs"
                  onClick={() => trackCta('Read the Docs', '/docs', 'final_cta')}
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
