import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  Terminal,
  GitBranch,
  GitMerge,
  ShieldCheck,
  ClipboardCheck,
  Brain,
  KeyRound,
  Plug,
  Boxes,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Features — Run Every Agent in Parallel, Merge the Right One | Recoder.xyz',
  description:
    'Recoder is the self-hosted convergence layer for coding agents. Run Claude Code, Codex, Cursor, opencode, or pi in parallel isolated git worktrees, review where they diverge, and merge the one trusted result — with verification evidence, governance approvals, and shared memory. Your keys, your infra.',
  openGraph: {
    title: 'Features — Run Every Agent in Parallel, Merge the Right One | Recoder.xyz',
    description:
      'Self-hosted convergence layer for coding agents: parallel isolated worktrees, review the divergence, merge one trusted result with verification evidence and governance. Bring your own agent and your own keys.',
    url: 'https://recoder.xyz/features',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Features — the convergence layer for coding agents',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features — Run Every Agent in Parallel, Merge the Right One',
    description:
      'Self-hosted convergence layer: parallel isolated worktrees, review the divergence, merge one trusted result with evidence and governance.',
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
      title: 'Bring your own agent',
      description:
        'Run Claude Code, Codex, Cursor, opencode, or pi from one terminal — no lock-in. Each runtime is a swappable execution surface; the control plane stays the same.',
      color: 'from-orange-500 to-red-600',
    },
    {
      icon: GitBranch,
      title: 'Parallel isolated worktrees',
      description:
        'Every agent run gets its own git worktree and branch, so they work in parallel without ever colliding. Launch several attempts at the same task at once.',
      color: 'from-blue-500 to-cyan-600',
    },
    {
      icon: GitMerge,
      title: 'Converge to one merge',
      description:
        'Review where the parallel runs diverge side by side, compare their diffs, and merge the single result you trust. Divergence in, one trusted change out.',
      color: 'from-purple-500 to-pink-600',
    },
    {
      icon: ClipboardCheck,
      title: 'Verification before merge',
      description:
        'Each run ends with verification output and captured artifacts — not a claimed success. Health, approval, and check status stay truthful, backed by evidence.',
      color: 'from-yellow-500 to-orange-600',
    },
    {
      icon: ShieldCheck,
      title: 'Governance & approvals',
      description:
        'Policy gates, work locks, and approval waits guard risky actions — secret access, branch pushes, deploys. Deterministic decisions enforced below the model.',
      color: 'from-green-500 to-emerald-600',
    },
    {
      icon: Brain,
      title: 'Shared agent memory',
      description:
        'A cross-agent issue graph recalls relevant context on launch and harvests evidence-backed candidates on completion, so the next run starts where the last left off.',
      color: 'from-indigo-500 to-purple-600',
    },
    {
      icon: Plug,
      title: 'Governed MCP tool spine',
      description:
        'Agents reach memory, retrieval, browser, and code-intel through a governed MCP host — the same capabilities behind one auditable gate, not scattered side channels.',
      color: 'from-teal-500 to-cyan-600',
    },
    {
      icon: KeyRound,
      title: 'Bring your own keys',
      description:
        'Use your own model provider keys and pay providers directly — no markup. Inference flows through a gateway you control, or falls back to your BYOK keys, honestly.',
      color: 'from-rose-500 to-red-600',
    },
    {
      icon: Boxes,
      title: 'Self-hosted by design',
      description:
        'Run it on your own infrastructure with your own Postgres and vector store. Your code, your runs, and your audit trail stay on hardware you own.',
      color: 'from-sky-500 to-blue-600',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Fan out',
      description:
        'Hand the same task to one agent or several. Each launches in its own isolated worktree and runs in parallel.',
    },
    {
      step: '02',
      title: 'Review the divergence',
      description:
        'Watch the runs stream in, compare their diffs and verification output, and see exactly where they disagree.',
    },
    {
      step: '03',
      title: 'Merge with evidence',
      description:
        'Approve the run you trust — gated by policy, backed by artifacts — and converge it into one clean change.',
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-neutral-800/50 border border-neutral-700 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-neutral-300" />
            <span className="text-sm text-neutral-300">The convergence layer</span>
          </div>
          <h1 className="text-5xl font-bold mb-6">Run every agent in parallel. Merge the one that&apos;s right.</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Recoder turns many divergent parallel-agent runs into one trusted merge — self-hosted,
            evidence-backed, and governed. Bring your own agent and your own keys.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {features.map((feature, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all group"
            >
              <div
                className={`w-12 h-12 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
              >
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center mb-3">How convergence works</h2>
          <p className="text-center text-gray-400 mb-12 max-w-2xl mx-auto">
            The same task, tried in parallel, reviewed where it diverges, merged once with evidence.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.step} className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="text-sm font-mono text-neutral-500 mb-3">{s.step}</div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-400">{s.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center space-x-2 px-8 py-4 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-colors"
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
