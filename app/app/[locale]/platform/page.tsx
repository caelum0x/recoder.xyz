'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle2, Code2, Globe, LayoutDashboard, Workflow } from 'lucide-react';
import { getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const surfaces = [
  {
    id: 'app',
    label: 'App',
    role: 'Account, workspace, and billing authority',
    description: 'The canonical workspace layer that owns auth, identity, and commercial boundaries for every connected agent.',
    icon: Globe,
    color: 'from-orange-500 to-red-500',
    status: 'Core',
  },
  {
    id: 'agents',
    label: 'Agents',
    role: 'External-agent connection and dispatch',
    description: 'Where Claude Code, Codex, and custom runtimes connect, register identity, and receive execution work.',
    icon: Bot,
    color: 'from-cyan-500 to-sky-500',
    status: 'Core',
  },
  {
    id: 'web',
    label: 'Web Runtime',
    role: 'Code, terminal, preview, and logs',
    description: 'The main execution lane for software work. It is where runtime reliability, file mutation, and preview truth have to hold.',
    icon: Code2,
    color: 'from-violet-500 to-fuchsia-500',
    status: 'Core',
  },
  {
    id: 'pm',
    label: 'PM',
    role: 'Task state, approvals, and artifacts',
    description: 'Status, assignment, run history, and approvals wrapped around the flagship execution loop.',
    icon: LayoutDashboard,
    color: 'from-blue-500 to-indigo-500',
    status: 'Support',
  },
  {
    id: 'agency',
    label: 'Agency',
    role: 'Optional delivery packaging',
    description: 'A downstream client-facing wrapper for teams that need delivery packaging after the work is already proven in the core loop.',
    icon: Workflow,
    color: 'from-emerald-500 to-teal-500',
    status: 'Support',
  },
] as const;

const loop = [
  'Connect an external coding agent.',
  'Assign a real software task.',
  'Execute in the coding/runtime lane.',
  'Capture preview, logs, artifacts, and task state.',
  'Review, approve, and hand off the result.',
  'Repeat with more work and more agents.',
] as const;

export default function PlatformPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      <section className="px-6 py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
              <Globe className="h-4 w-4" />
              Recoder Platform Map
            </div>
            <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
              One control plane,
              <span className="bg-gradient-to-r from-orange-400 to-cyan-300 bg-clip-text text-transparent"> several execution lanes</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-xl leading-relaxed text-gray-400">
              Recoder should read as a single operating system for external coding agents. The platform gets clearer when every surface maps back to the same software execution loop.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-3xl font-bold md:text-4xl">Canonical loop</h2>
              <p className="mt-3 max-w-3xl text-lg text-gray-400">
                Product decisions should reinforce this sequence instead of introducing parallel stories.
              </p>
            </div>
            <Link href="/docs/getting-started" className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-orange-300">
              Read the workflow <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loop.map((item, index) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mb-3 text-sm font-mono text-orange-400">{String(index + 1).padStart(2, '0')}</div>
                <p className="text-base text-gray-200">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent px-6 py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-10">
            <h2 className="text-3xl font-bold md:text-4xl">Surface roles</h2>
            <p className="mt-3 max-w-3xl text-lg text-gray-400">
              The wedge is not “many products.” The wedge is “external agents doing real software work,” with supporting surfaces around that work.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            {surfaces.map((surface) => {
              const Icon = surface.icon;
              const href = surface.id === 'app' ? 'https://recoder.xyz' : getServiceUrlClient(surface.id);
              return (
                <div key={surface.id} className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className={`inline-flex rounded-2xl bg-gradient-to-br ${surface.color} p-3`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${surface.status === 'Core' ? 'bg-orange-500/10 text-orange-300' : 'bg-white/10 text-gray-300'}`}>
                      {surface.status}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold">{surface.label}</h3>
                  <div className="mt-2 text-sm text-white/80">{surface.role}</div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-400">{surface.description}</p>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-orange-300"
                  >
                    Open surface <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-20">
        <div className="container mx-auto max-w-5xl">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-8 md:p-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
              <CheckCircle2 className="h-4 w-4" />
              Strategic guardrails
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                'Compete on workflow, control, and execution truth instead of subsidized tokens.',
                'Do not expand the story until the flagship runtime loop works repeatedly without manual rescue.',
                'Treat PM and Agency as supporting layers, not co-equal homepage narratives.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm leading-relaxed text-gray-300">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
