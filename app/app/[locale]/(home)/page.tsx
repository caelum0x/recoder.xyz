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
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { TiltCard } from '@/components/TiltCard';
import { useSession } from '@/lib/session-provider';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';
import { HeroCube } from '@/app/components/HeroCube';

/* ------------------------------------------------------------------ */
/*  Shared interaction tokens                                          */
/* ------------------------------------------------------------------ */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

const PRIMARY_CTA =
  `inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold rounded-xl text-white ` +
  `bg-orange-500 hover:bg-orange-400 ` +
  `transition-all hover:-translate-y-0.5 shadow-lg shadow-orange-500/20 ${FOCUS_RING}`;

const SECONDARY_CTA =
  `inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold rounded-xl ` +
  `text-gray-200 border border-white/15 hover:border-white/35 hover:bg-white/[0.03] transition-all ${FOCUS_RING}`;

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
    icon: Terminal,
    features: ['npx recoder-a2a', '40+ models', 'MCP servers', 'Sandbox mode'],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Product surface — ONE neutral scheme + a single orange accent.     */
/*  Products differ by icon + label + monospace tagline, not by hue,   */
/*  matching the cube's restraint (dark faces, one warm accent).       */
/* ------------------------------------------------------------------ */
const PRODUCT_SURFACE = {
  border: 'border-white/10',
  bg: 'bg-white/[0.02]',
  text: 'text-orange-400',
  glow: 'hover:border-white/25 hover:shadow-black/40',
  dot: 'bg-orange-500/70',
} as const;

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
    href: '/plan',
    highlighted: false,
  },
  {
    name: 'Monthly',
    price: '$20',
    period: 'month',
    description: 'Best for individuals',
    features: ['15 sessions / day', 'All AI models included', 'API access', 'Team (5 members)'],
    cta: 'Subscribe',
    href: '/plan',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$100',
    period: 'month',
    description: 'For power users & teams',
    features: ['20 sessions / day', 'Beta model access', 'Custom AI models', 'Team (10 members)'],
    cta: 'Subscribe',
    href: '/plan',
    highlighted: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Section eyebrow — terminal-adjacent, echoes the cube mark          */
/* ------------------------------------------------------------------ */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-gray-500">
      <span className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-orange-500" aria-hidden="true" />
      {children}
    </span>
  );
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

  const SPECS = ['5 products', '40+ AI models', 'A2A / MCP ready', 'Open-source core'];

  return (
    <div className="min-h-screen bg-black text-white antialiased">
      <SiteHeader />

      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden pt-20 pb-24 md:pt-24 md:pb-28">
        {/* Engineered blueprint grid + focal glow — decorative */}
        <div
          aria-hidden="true"
          className="rec-grid absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_38%,black,transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[34%] h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.10),transparent_68%)] blur-2xl"
        />
        {/* Mobile/tablet brand cube — the identity survives below lg.
            Absolutely positioned behind the copy, so it adds zero layout shift. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-4 flex justify-center lg:hidden"
        >
          <HeroCube size={200} parallaxStrength={0} className="opacity-[0.16]" />
        </div>

        <div className="relative container mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            {/* Copy column */}
            <div className="rec-rise text-center lg:text-left">
              <div className="mb-6 flex justify-center lg:justify-start">
                <Eyebrow>Agent control plane</Eyebrow>
              </div>

              <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl xl:text-7xl">
                Ship with AI agents,
                <br />
                <span className="text-orange-400">end to end.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-400 lg:mx-0">
                Build, deploy, and orchestrate AI agents across code, projects,
                and clients — one platform, from prompt to production.
              </p>

              {/* Spec strip — monospace, engineered */}
              <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 font-mono text-xs text-gray-400 lg:justify-start">
                {SPECS.map((v) => (
                  <li key={v} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    {v}
                  </li>
                ))}
              </ul>

              {/* CTAs */}
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
                {session?.user ? (
                  <>
                    <LaunchWebIDEButton className={PRIMARY_CTA}>
                      Launch Web IDE <ArrowRight className="h-5 w-5" />
                    </LaunchWebIDEButton>
                    <Link href="/dashboard" className={SECONDARY_CTA}>
                      Dashboard
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/auth/signup" className={PRIMARY_CTA}>
                      Get Started <ArrowRight className="h-5 w-5" />
                    </Link>
                    <Link href="/docs/getting-started" className={SECONDARY_CTA}>
                      Documentation
                    </Link>
                  </>
                )}
              </div>

              <p className="mt-5 font-mono text-xs text-gray-500">
                No credit card required · Free tier forever
              </p>
            </div>

            {/* Cube column — subtle brand mark; reserves its own square (zero CLS). */}
            <div className="hidden items-center justify-center lg:flex">
              <HeroCube size={360} parallaxStrength={0.05} className="opacity-70" />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRODUCTS                                                    */}
      {/* ============================================================ */}
      <section className="border-t border-white/5 px-6 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-14 max-w-2xl space-y-4">
            <Eyebrow>The platform</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Five products, one control plane
            </h2>
            <p className="text-lg text-gray-400">
              Purpose-built surfaces that work together — or independently.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCTS.map((product) => {
              const c = PRODUCT_SURFACE;
              const Icon = product.icon;
              const href = product.href();
              const isExternal = product.external;

              const card = (
                <div
                  className={`group relative flex h-full flex-col rounded-2xl border ${c.border} ${c.bg} ${c.glow} p-6 transition-all duration-300 hover:shadow-lg`}
                >
                  <div className="mb-5 flex items-start justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.bg} border ${c.border}`}>
                      <Icon className={`h-5 w-5 ${c.text}`} />
                    </div>
                    {isExternal && (
                      <ArrowUpRight className="h-4 w-4 text-gray-600 transition-colors group-hover:text-gray-300" />
                    )}
                  </div>

                  <h3 className="text-xl font-bold tracking-tight">{product.name}</h3>
                  <p className={`mt-1 font-mono text-xs uppercase tracking-wider ${c.text}`}>
                    {product.tagline}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-gray-400">
                    {product.description}
                  </p>

                  <ul className="mt-5 space-y-2 border-t border-white/5 pt-5">
                    {product.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-xs text-gray-400">
                        <span className={`h-1 w-1 rounded-full ${c.dot}`} aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );

              const tilted = <TiltCard>{card}</TiltCard>;

              return isExternal ? (
                <a
                  key={product.id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-2xl ${FOCUS_RING}`}
                >
                  {tilted}
                </a>
              ) : (
                <Link key={product.id} href={href} className={`rounded-2xl ${FOCUS_RING}`}>
                  {tilted}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  A2A / MCP                                                   */}
      {/* ============================================================ */}
      <section className="border-t border-white/5 bg-gradient-to-b from-transparent via-orange-500/[0.02] to-transparent px-6 py-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-14 max-w-2xl space-y-4">
            <Eyebrow>Agent-to-agent protocol</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Connect everything with A2A
            </h2>
            <p className="text-lg text-gray-400">
              Let Claude Code, Codex, Cursor, and any MCP-compatible tool talk to
              your Recoder agents directly.
            </p>
          </div>

          {/* Quick-start command */}
          <div className="mb-14 max-w-xl">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-sm">
              <Terminal className="h-5 w-5 shrink-0 text-orange-400" aria-hidden="true" />
              <code className="flex-1 font-mono text-base text-white md:text-lg">npx recoder-a2a</code>
              <button
                type="button"
                onClick={() => copy('npx recoder-a2a', setCopiedA2a)}
                aria-label="Copy npx recoder-a2a to clipboard"
                className={`shrink-0 rounded-xl bg-orange-500 p-2.5 transition-colors hover:bg-orange-400 ${FOCUS_RING}`}
              >
                {copiedA2a ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 h-5 text-sm text-gray-400" role="status" aria-live="polite">
              {copiedA2a ? 'Copied to clipboard' : ''}
            </p>
          </div>

          {/* Architecture diagram (text-based) */}
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] p-8 font-mono text-sm">
            <div className="min-w-[500px] space-y-4 text-gray-400">
              <div className="mb-6 text-center text-xs uppercase tracking-[0.25em] text-gray-500">
                Architecture
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6">
                <span className="rounded border border-gray-700 px-3 py-1.5 text-gray-200">Claude Code</span>
                <span className="rounded border border-gray-700 px-3 py-1.5 text-gray-200">Codex</span>
                <span className="rounded border border-gray-700 px-3 py-1.5 text-gray-200">Cursor</span>
                <span className="rounded border border-gray-700 px-3 py-1.5 text-gray-200">Any MCP Client</span>
              </div>

              <div className="flex justify-center">
                <div className="flex flex-col items-center text-gray-500">
                  <span aria-hidden="true">|</span>
                  <span>MCP / A2A</span>
                  <span aria-hidden="true">v</span>
                </div>
              </div>

              <div className="flex justify-center">
                <span className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-6 py-2 font-semibold text-orange-300">
                  recoder-a2a gateway
                </span>
              </div>

              <div className="flex justify-center">
                <div className="flex flex-col items-center text-gray-500">
                  <span aria-hidden="true">|</span>
                  <span aria-hidden="true">v</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <span className="rounded border border-white/10 px-3 py-1.5 text-gray-300">Agents</span>
                <span className="rounded border border-white/10 px-3 py-1.5 text-gray-300">Web IDE</span>
                <span className="rounded border border-white/10 px-3 py-1.5 text-gray-300">PM</span>
                <span className="rounded border border-white/10 px-3 py-1.5 text-gray-300">Agency</span>
              </div>
            </div>
          </div>

          {/* A2A capabilities */}
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <Bot className="mb-3 h-5 w-5 text-orange-400" aria-hidden="true" />
              <h3 className="mb-1.5 font-semibold">Agent Discovery</h3>
              <p className="text-sm leading-relaxed text-gray-400">
                Agents publish their capabilities. Any A2A client can discover and invoke them.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <Shield className="mb-3 h-5 w-5 text-orange-400" aria-hidden="true" />
              <h3 className="mb-1.5 font-semibold">Secure Handoff</h3>
              <p className="text-sm leading-relaxed text-gray-400">
                Token-based auth, scoped permissions, and audit logging for every cross-agent call.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <Zap className="mb-3 h-5 w-5 text-orange-400" aria-hidden="true" />
              <h3 className="mb-1.5 font-semibold">Real-time Streaming</h3>
              <p className="text-sm leading-relaxed text-gray-400">
                SSE and WebSocket support for streaming agent responses back to your editor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CLI quick-start                                             */}
      {/* ============================================================ */}
      <section className="border-t border-white/5 px-6 py-24">
        <div className="container mx-auto max-w-4xl">
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.08),transparent_70%)] blur-3xl"
            />

            <div className="relative rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.04] to-transparent p-10 backdrop-blur-sm md:p-14">
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <Eyebrow>recoder-code CLI</Eyebrow>
                </div>

                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Get started in seconds
                </h2>

                <p className="mx-auto max-w-xl text-gray-400">
                  Install the CLI, add your API key, and start building with
                  Claude, GPT-4, Gemini, DeepSeek, and 35+ more models.
                </p>

                <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-black/50 p-4">
                  <code className="flex-1 text-left font-mono text-base text-white md:text-lg">
                    npm install -g recoder-code
                  </code>
                  <button
                    type="button"
                    onClick={() => copy('npm install -g recoder-code', setCopiedCli)}
                    aria-label="Copy npm install command to clipboard"
                    className={`shrink-0 rounded-xl bg-orange-500 p-2.5 transition-colors hover:bg-orange-400 ${FOCUS_RING}`}
                  >
                    {copiedCli ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="h-5 text-sm text-orange-300" role="status" aria-live="polite">
                  {copiedCli ? 'Copied to clipboard' : ''}
                </p>

                <div className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-4">
                  {[
                    { icon: Cpu, label: '40+ Models' },
                    { icon: Code, label: 'Code Gen' },
                    { icon: Zap, label: 'Tool Calling' },
                    { icon: Shield, label: 'Sandbox' },
                  ].map(({ icon: I, label }) => (
                    <div key={label} className="space-y-2 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                        <I className="h-5 w-5 text-orange-400" />
                      </div>
                      <span className="text-xs font-medium text-gray-300">{label}</span>
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
      <section className="border-t border-white/5 px-6 py-16">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: '5', label: 'Products' },
              { value: '40+', label: 'AI Models' },
              { value: '17', label: 'MCP Servers' },
              { value: '$0', label: 'To Start' },
            ].map(({ value, label }) => (
              <div key={label} className="space-y-1 text-center">
                <div className="text-4xl font-bold tracking-tight text-white">{value}</div>
                <div className="font-mono text-xs uppercase tracking-wider text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRICING                                                     */}
      {/* ============================================================ */}
      <section className="border-t border-white/5 px-6 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-14 max-w-2xl space-y-4">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Simple, honest pricing</h2>
            <p className="text-lg text-gray-400">
              Start free with your own API key, or let us handle everything.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                  tier.highlighted
                    ? 'border-orange-500/40 bg-gradient-to-b from-orange-500/[0.07] to-transparent shadow-lg shadow-orange-500/5'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-0.5 text-xs font-semibold text-white">
                    Popular
                  </div>
                )}

                <h3 className="text-lg font-bold">{tier.name}</h3>
                <p className="mt-1 text-xs text-gray-400">{tier.description}</p>

                <div className="mt-5 mb-6">
                  <span className="text-3xl font-bold tracking-tight">{tier.price}</span>
                  <span className="ml-1 text-sm text-gray-400">/{tier.period}</span>
                </div>

                <ul className="mb-8 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={`mt-auto block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-all ${FOCUS_RING} ${
                    tier.highlighted
                      ? 'bg-orange-500 text-white hover:bg-orange-400'
                      : 'border border-white/15 text-white hover:border-white/30'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/plan"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-400 transition-colors hover:text-white ${FOCUS_RING}`}
            >
              View full pricing details <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Final CTA                                                   */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden border-t border-white/5 px-6 py-28">
        <div
          aria-hidden="true"
          className="rec-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_50%_60%_at_50%_50%,black,transparent)]"
        />
        <div className="relative container mx-auto max-w-3xl space-y-8 text-center">
          <div className="flex justify-center">
            <Eyebrow>Start building</Eyebrow>
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Ready to build with AI?
          </h2>
          <p className="text-lg text-gray-400">
            Join thousands of developers building with Recoder.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
            {session?.user ? (
              <>
                <Link href="/dashboard" className={PRIMARY_CTA}>
                  Go to Dashboard <ArrowRight className="h-5 w-5" />
                </Link>
                <LaunchWebIDEButton className={SECONDARY_CTA}>
                  Launch Web IDE <ArrowRight className="h-5 w-5" />
                </LaunchWebIDEButton>
              </>
            ) : (
              <>
                <Link href="/auth/signup" className={PRIMARY_CTA}>
                  Get Started Free <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/docs" className={SECONDARY_CTA}>
                  Read the Docs
                </Link>
              </>
            )}
          </div>

          <p className="font-mono text-xs text-gray-500">
            No credit card required · Free tier forever
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
