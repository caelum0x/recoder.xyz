'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Terminal, Copy, Check, GitBranch, GitMerge, Download, Sparkles,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const AGENT_INSTALLS = [
  {
    title: 'Claude Code',
    code: 'npm install -g @anthropic-ai/claude-code',
    description: "Anthropic's terminal coding agent",
  },
  {
    title: 'Codex',
    code: 'npm install -g @openai/codex',
    description: "OpenAI's terminal coding agent",
  },
  {
    title: 'opencode',
    code: 'npm install -g opencode-ai',
    description: 'Open-source terminal coding agent',
  },
];

const LOOP_STEPS = [
  {
    icon: Terminal,
    title: 'Bring your agent CLIs',
    description:
      'Recoder drives the coding agents you already use — Claude Code, Codex, opencode, Cursor CLI, and any other terminal agent.',
  },
  {
    icon: GitBranch,
    title: 'Launch N attempts in parallel',
    description:
      'Describe the task once and run it on several agents at the same time. Each attempt gets its own isolated git worktree.',
  },
  {
    icon: GitMerge,
    title: 'Review and merge the best',
    description:
      'Compare the divergent diffs side by side, merge the strongest attempt, and discard the rest — with an evidence record.',
  },
];

export default function CLIPage() {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = async (text: string, stepIndex: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepIndex);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch {
      // Clipboard unavailable — ignore.
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border-2 border-green-500/20 bg-green-500/10">
              <Sparkles className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400 font-semibold">Your agents. Your keys. Your machine.</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              Any Agent CLI.
              <br />
              <span className="text-white">One Workspace.</span>
            </h1>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Recoder is a <span className="text-white font-semibold">desktop app</span> that
              runs your coding agents in parallel isolated git worktrees, then
              helps you review and merge the best result.
            </p>

            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-2xl mx-auto">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-white">BYOK (Bring Your Own Key):</span>{' '}
                Your agents keep using the provider subscriptions and API keys
                they already have. Recoder orchestrates — no proxying, no markup.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-4 pt-8">
              <a
                href="/download"
                className="group px-8 py-4 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Download className="w-5 h-5" />
                <span>Download the Desktop App</span>
              </a>
              <Link
                href="/docs/getting-started"
                className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
              >
                Getting Started Guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The convergence loop */}
      <section className="py-20 px-6 border-t border-white/10 bg-gradient-to-b from-transparent to-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">N Agents in Parallel. One Trusted Merge.</h2>
            <p className="text-gray-400">Fan-out is easy; convergence is the hard part.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {LOOP_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="relative p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-white/30 transition-all"
                >
                  <div className="absolute -top-3 left-6 w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-black">
                    {index + 1}
                  </div>
                  <Icon className="w-10 h-10 text-white mb-4 mt-2" />
                  <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Install the agents you want to run */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Install the Agents You Want to Run</h2>
            <p className="text-gray-400">
              Recoder does not ship its own CLI — it runs the ones you already
              trust. If it runs in a terminal, Recoder can run it.
            </p>
          </div>

          <div className="space-y-6">
            {AGENT_INSTALLS.map((step, index) => (
              <div
                key={step.title}
                className="relative p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent hover:border-white/30 transition-all"
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center text-black font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">{step.title}</h3>
                    <p className="text-gray-400">{step.description}</p>
                    <div className="flex items-center space-x-2 p-4 bg-black border border-white/10 rounded-lg font-mono text-sm">
                      <code className="flex-1 text-green-400">{step.code}</code>
                      <button
                        onClick={() => copyToClipboard(step.code, index)}
                        aria-label={`Copy ${step.title} install command`}
                        className="p-2 hover:bg-white/5 rounded transition-colors"
                      >
                        {copiedStep === index ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <a
              href="/download"
              className="inline-flex items-center space-x-2 px-8 py-4 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Then Download Recoder</span>
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
