'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle2, Network, Shield, Terminal, Workflow } from 'lucide-react';
import { getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const connectors = [
  {
    name: 'Claude Code',
    description: 'Connect Claude Code through MCP and route real coding tasks into Recoder with preview, artifacts, and approvals attached.',
  },
  {
    name: 'Codex',
    description: 'Use Codex as an external execution worker while Recoder owns the shared task, runtime, and delivery state.',
  },
  {
    name: 'Custom agent',
    description: 'Bring your own runtime and capabilities as long as it can speak the bridge and operate inside the control plane.',
  },
] as const;

const capturePoints = [
  'Agent identity and session health',
  'Task assignment and state transitions',
  'Runtime logs, code changes, and previews',
  'Artifacts, approvals, and handoff context',
] as const;

export default function AgentsPage() {
  const agentsUrl = getServiceUrlClient('agents');

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      <section className="px-6 py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-sm text-purple-300">
                <Bot className="h-4 w-4" />
                External Agents
              </div>
              <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
                Connect the coding agents your team already trusts.
              </h1>
              <p className="mt-6 max-w-2xl text-xl leading-relaxed text-gray-400">
                Recoder is not another isolated chat box. It is the control plane where external agents connect,
                take on software work, run through the runtime lane, and hand results back with proof.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a
                  href={agentsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-purple-600 px-7 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Open Agents Surface <ArrowRight className="h-5 w-5" />
                </a>
                <Link
                  href="/docs/a2a/mcp-setup"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 px-7 py-4 text-lg font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.04]"
                >
                  Read MCP Setup
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-400/80" />
                  <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
                  <span className="h-3 w-3 rounded-full bg-green-400/80" />
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-gray-500">control plane</span>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Connect</div>
                  <div className="font-semibold">Register external agents with stable identity</div>
                </div>
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-300">Execute</div>
                  <div className="font-semibold">Run software work across code, terminal, preview, and runtime logs</div>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-300">Review</div>
                  <div className="font-semibold">Keep artifacts, approvals, and handoff visible to humans</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-10">
            <h2 className="text-3xl font-bold md:text-4xl">Supported connection patterns</h2>
            <p className="mt-3 max-w-3xl text-lg text-gray-400">
              The wedge starts narrow: external coding agents doing real software work for AI-native dev teams.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {connectors.map((connector) => (
              <div key={connector.name} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="mb-3 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gray-500">
                  Connector
                </div>
                <h3 className="text-2xl font-semibold">{connector.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">{connector.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent px-6 py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
                <Network className="h-4 w-4" />
                What Recoder captures
              </div>
              <h2 className="text-3xl font-bold md:text-4xl">The value is in the orchestration and control layer</h2>
              <p className="mt-4 text-lg text-gray-400">
                Buyers should understand that Recoder is not selling “access to a model.” It is selling the workflow system around execution.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {capturePoints.map((item) => (
                <div key={item} className="flex gap-4 rounded-2xl border border-white/10 bg-black/30 p-5">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-400" />
                  <p className="text-sm leading-relaxed text-gray-300">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-20">
        <div className="container mx-auto max-w-5xl">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Shield,
                title: 'BYOK first',
                text: 'Your team keeps provider choice and budget control. Recoder should win on workflow, not token arbitrage.',
              },
              {
                icon: Terminal,
                title: 'Runtime truth',
                text: 'If code changes, previews, or deployments are unreliable, the product promise breaks. Reliability is part of the agents story.',
              },
              {
                icon: Workflow,
                title: 'Human approvals',
                text: 'Agents can execute, but teams still need review and delivery control before work is handed off or shipped.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                  <div className="mb-4 inline-flex rounded-2xl border border-white/10 bg-black/30 p-3">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-400">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 pt-6">
        <div className="container mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-gradient-to-r from-orange-500/10 via-white/[0.04] to-cyan-500/10 p-10 text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Run one flagship proof loop in production</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">
            Connect an agent, assign a real software task, verify preview and artifacts, and prove the loop works repeatedly without manual rescue.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/docs/getting-started" className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-3 text-base font-semibold text-black hover:bg-gray-200">
              Read getting started
            </Link>
            <a
              href={agentsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-7 py-3 text-base font-semibold text-white hover:border-white/35 hover:bg-white/[0.04]"
            >
              Open agents surface
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
