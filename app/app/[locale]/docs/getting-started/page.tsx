'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle, FolderOpen, Key, Network, Shield, Terminal } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const steps = [
  {
    number: '1',
    title: 'Create your workspace account',
    body: 'Sign in with GitHub or Google so Recoder can act as the shared workspace and billing authority around the rest of the agent workflow.',
    accent: 'bg-orange-500/20 text-orange-400',
    extra: [
      'No credit-card gate for the initial setup path',
      'One account across agent, runtime, and PM surfaces',
      'Fastest route into a real proof loop',
    ],
    action: { href: '/auth/signup', label: 'Create account' },
  },
  {
    number: '2',
    title: 'Connect your provider keys',
    body: 'Recoder is BYOK-first. Add OpenRouter, OpenAI, Anthropic, or Google so your team keeps cost visibility and vendor flexibility.',
    accent: 'bg-cyan-500/20 text-cyan-300',
    extra: [
      'Provider spend stays under your own account',
      'No token subsidy dependency',
      'Same key setup across connected agents and runtime surfaces',
    ],
    note: 'You should pay Recoder for workflow control, not for marked-up model access.',
  },
  {
    number: '3',
    title: 'Connect an external coding agent',
    body: 'Bring Claude Code, Codex, or your own runtime through MCP and A2A so it can receive software tasks inside the shared control plane.',
    accent: 'bg-violet-500/20 text-violet-300',
    extra: [
      'Stable agent identity and connection state',
      'Shared queue for task assignment',
      'Works with existing terminal-first agent workflows',
    ],
    action: { href: '/docs/a2a/mcp-setup', label: 'Read MCP setup' },
  },
  {
    number: '4',
    title: 'Run the flagship software loop',
    body: 'Assign a real task, let the agent execute in the runtime lane, and confirm preview, logs, artifacts, and PM state all match the actual work performed.',
    accent: 'bg-emerald-500/20 text-emerald-300',
    extra: [
      'Code changes and terminal output in one place',
      'Preview URLs attached to the run',
      'Artifacts and handoff context visible for review',
    ],
    action: { href: '/projects', label: 'Open projects' },
  },
  {
    number: '5',
    title: 'Add approvals and repeatability',
    body: 'Once the first run works cleanly, expand into team use with approvals, artifacts, run history, and connected-agent capacity.',
    accent: 'bg-white/10 text-white',
    extra: [
      'Use PM for assignment and approvals',
      'Use Agency only when delivery packaging matters',
      'Scale by repeating the same proven loop',
    ],
    action: { href: '/platform', label: 'See platform map' },
  },
] as const;

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <div className="px-6 pb-20 pt-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <div className="mb-6 inline-flex items-center space-x-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2">
              <Network className="h-4 w-4 text-green-400" />
              <span className="text-sm text-green-400">Getting Started Guide</span>
            </div>
            <h1 className="mb-4 text-5xl font-bold md:text-6xl">
              Connect an agent and prove
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-white to-cyan-300 bg-clip-text text-transparent">
                the software execution loop
              </span>
            </h1>
            <p className="mx-auto max-w-3xl text-xl text-gray-400">
              The goal is not to browse features. The goal is to make one external coding agent complete a real task across code, preview, task state, and handoff.
            </p>
          </div>

          <div className="space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-8">
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold ${step.accent}`}>
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <h2 className="mb-3 text-2xl font-bold">{step.title}</h2>
                    <p className="mb-5 text-gray-400">{step.body}</p>

                    <div className="mb-5 grid gap-3 md:grid-cols-3">
                      {step.extra.map((item) => (
                        <div key={item} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-gray-300">
                          {item}
                        </div>
                      ))}
                    </div>

                    {'note' in step && step.note ? (
                      <div className="mb-5 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-gray-300">
                        <span className="font-semibold text-white">BYOK principle:</span> {step.note}
                      </div>
                    ) : null}

                    {'action' in step && step.action ? (
                      <Link
                        href={step.action.href}
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-black transition-colors hover:bg-gray-200"
                      >
                        <span>{step.action.label}</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="my-16 rounded-[2rem] border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-cyan-500/10 p-8">
            <h2 className="mb-6 text-3xl font-bold">What “success” looks like</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  icon: Bot,
                  title: 'Agent connection is visible',
                  text: 'You can see which agent is connected, what task it owns, and whether it is actually running.',
                },
                {
                  icon: Terminal,
                  title: 'Runtime work is real',
                  text: 'Code changes, command output, and file mutations show up in the same execution record.',
                },
                {
                  icon: FolderOpen,
                  title: 'Preview and artifacts align',
                  text: 'Preview URLs, artifacts, and task status all describe the same underlying run.',
                },
                {
                  icon: Shield,
                  title: 'A human can approve handoff',
                  text: 'The result is reviewable before it gets handed off or shipped, which is the whole point of the control plane.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <Icon className="mb-3 h-6 w-6 text-green-300" />
                    <h3 className="mb-2 font-semibold">{item.title}</h3>
                    <p className="text-sm text-gray-400">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
            <h2 className="mb-4 text-3xl font-bold">Helpful next reads</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Link href="/docs/a2a" className="rounded-2xl border border-white/10 bg-black/30 p-5 hover:border-white/20">
                <Bot className="mb-3 h-6 w-6 text-orange-400" />
                <div className="font-semibold">A2A overview</div>
                <div className="mt-2 text-sm text-gray-400">Understand the bridge and agent lifecycle.</div>
              </Link>
              <Link href="/docs/byok" className="rounded-2xl border border-white/10 bg-black/30 p-5 hover:border-white/20">
                <Key className="mb-3 h-6 w-6 text-cyan-300" />
                <div className="font-semibold">BYOK setup</div>
                <div className="mt-2 text-sm text-gray-400">Configure provider keys without changing who pays for tokens.</div>
              </Link>
              <Link href="/customers" className="rounded-2xl border border-white/10 bg-black/30 p-5 hover:border-white/20">
                <CheckCircle className="mb-3 h-6 w-6 text-green-300" />
                <div className="font-semibold">Customer workflows</div>
                <div className="mt-2 text-sm text-gray-400">See how the product is used as execution infrastructure.</div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
