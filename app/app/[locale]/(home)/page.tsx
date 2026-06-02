'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  ClipboardList,
  Copy,
  LayoutDashboard,
  Network,
  Shield,
  Terminal,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { LeadCaptureForm } from '@/components/LeadCaptureForm';
import { useSession } from '@/lib/session-provider';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';

const loopSteps = [
  {
    step: '01',
    title: 'Connect an external agent',
    text: 'Bring Claude Code, Codex, or your own runtime through MCP and A2A instead of changing how your team already works.',
  },
  {
    step: '02',
    title: 'Assign real software work',
    text: 'Start with an issue, bug, feature, or review task and route it into one canonical execution lane.',
  },
  {
    step: '03',
    title: 'Execute in the runtime lane',
    text: 'The agent edits code, runs commands, and uses the browser runtime with preview and logs attached to the run.',
  },
  {
    step: '04',
    title: 'Capture proof, not vibes',
    text: 'Preview URLs, artifacts, run history, and task state stay aligned with what the agent actually did.',
  },
  {
    step: '05',
    title: 'Review and approve',
    text: 'Humans keep control over approvals, handoff, and delivery instead of trusting hidden background automation.',
  },
  {
    step: '06',
    title: 'Repeat across more agents',
    text: 'As the team grows, Recoder becomes the shared operating layer for more tasks, more agents, and stricter controls.',
  },
] as const;

const platformLanes = [
  {
    title: 'App',
    subtitle: 'Identity and billing authority',
    text: 'Shared account, workspace, auth, and billing boundaries for the rest of the system.',
    icon: Shield,
    border: 'border-orange-500/20',
    bg: 'bg-orange-500/5',
    textColor: 'text-orange-400',
  },
  {
    title: 'Agents',
    subtitle: 'Connection and dispatch',
    text: 'Register external agents, route work, inspect live runs, and keep agent identity stable.',
    icon: Bot,
    border: 'border-cyan-500/20',
    bg: 'bg-cyan-500/5',
    textColor: 'text-cyan-400',
  },
  {
    title: 'Runtime Lane',
    subtitle: 'Code, preview, logs',
    text: 'The execution lane for software work with runtime, file mutation, terminal access, and preview attached to the run instead of hidden behind a separate surface.',
    icon: Terminal,
    border: 'border-violet-500/20',
    bg: 'bg-violet-500/5',
    textColor: 'text-violet-400',
  },
  {
    title: 'PM',
    subtitle: 'Task state and approvals',
    text: 'Status, artifacts, assignment, and approvals wrap around the execution loop instead of living elsewhere.',
    icon: LayoutDashboard,
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
    textColor: 'text-blue-400',
  },
  {
    title: 'Agency',
    subtitle: 'Optional delivery wrapper',
    text: 'Useful when outputs need packaging for clients, but intentionally downstream from the core loop.',
    icon: Workflow,
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    textColor: 'text-emerald-400',
  },
] as const;

const reliabilityPoints = [
  'Runtime lane correctness is part of the product, not a hidden implementation detail.',
  'File mutation, preview availability, and deploy stability matter more than adding more surface area.',
  'Legacy fallback behavior should never create a false sense that work succeeded when it did not.',
  'Artifacts, previews, and task status should reflect the actual execution truth of the run.',
] as const;

export default function HomePage() {
  const [copiedA2a, setCopiedA2a] = useState(false);
  const { data: session } = useSession();

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedA2a(true);
    setTimeout(() => setCopiedA2a(false), 2000);
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

      <section className="relative overflow-hidden px-6 pb-24 pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(34,211,238,0.16),transparent_28%),linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:32px_32px]" />

        <div className="relative container mx-auto max-w-6xl">
          <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
                <Bot className="h-4 w-4" />
                External Agent Control Plane
              </div>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
                  Connect your coding agent.
                  <br />
                  <span className="bg-gradient-to-r from-orange-400 via-white to-cyan-300 bg-clip-text text-transparent">
                    Keep the execution under control.
                  </span>
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-gray-300 md:text-xl">
                  Recoder is the operating system for external coding agents like Claude Code and Codex.
                  It gives them one place to execute real software work across runtime, preview, task state,
                  artifacts, approvals, and handoff.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                {['BYOK workflow pricing', 'Preview + logs attached to runs', 'Task and artifact history', 'Human approvals stay in the loop'].map((pill) => (
                  <span key={pill} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    {pill}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                {session?.user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => trackCta('Go to Dashboard', '/dashboard', 'hero')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-7 py-4 text-lg font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.01] hover:from-orange-400 hover:to-cyan-500"
                    >
                      Open Workspace <ArrowRight className="h-5 w-5" />
                    </Link>
                    <Link
                      href="/docs/getting-started"
                      onClick={() => trackCta('Read Getting Started', '/docs/getting-started', 'hero')}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 px-7 py-4 text-lg font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.04]"
                    >
                      Read the Loop
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth/signup"
                      onClick={() => trackCta('Get Started', '/auth/signup', 'hero')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-7 py-4 text-lg font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.01] hover:from-orange-400 hover:to-cyan-500"
                    >
                      Connect Your First Agent <ArrowRight className="h-5 w-5" />
                    </Link>
                    <Link
                      href="/docs/getting-started"
                      onClick={() => trackCta('Documentation', '/docs/getting-started', 'hero')}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 px-7 py-4 text-lg font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.04]"
                    >
                      See the Workflow
                    </Link>
                  </>
                )}
              </div>

              {!session?.user && (
                <LeadCaptureForm
                  source="homepage_hero_lead_capture"
                  title="Not ready to connect GitHub or Google?"
                  description="Leave your email and we’ll send product updates, launch notes, and early access to the parts of Recoder that are actually becoming reliable."
                  submitLabel="Join the list"
                />
              )}

              <p className="text-sm text-gray-500">
                Do not pay Recoder to subsidize models. Bring your own provider budget and pay the platform for control.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-sm">
              <div className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-400/80" />
                  <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
                  <span className="h-3 w-3 rounded-full bg-green-400/80" />
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-gray-500">flagship run</span>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-orange-300">Connect</div>
                  <div className="text-lg font-semibold">Claude Code joins the workspace</div>
                  <div className="mt-2 text-sm text-gray-400">Registered through MCP/A2A with its own identity, session, and capabilities.</div>
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Assign</div>
                  <div className="text-lg font-semibold">Ship the dashboard bugfix and deployment follow-up</div>
                  <div className="mt-2 text-sm text-gray-400">The task becomes the canonical unit of work across code, preview, logs, and handoff.</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-300">Execute</div>
                    <div className="text-sm text-gray-300">Runtime edits files, runs commands, and emits logs tied to the run.</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-300">Review</div>
                    <div className="text-sm text-gray-300">Preview URL, artifacts, PM state, and human approval are all visible before handoff.</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-gray-300">
                  <div className="mb-2 text-gray-500">$ recoder-a2a run</div>
                  <div className="space-y-1">
                    <div>agent connected → task accepted → files changed</div>
                    <div>preview ready → artifacts attached → approval requested</div>
                    <div className="text-green-400">handoff packaged with execution truth</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
              <Boxes className="h-4 w-4" />
              One Primary Loop
            </div>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Every surface should serve the same software execution workflow</h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-400">
              Recoder is not trying to be five unrelated products. It is one control plane with several lanes around a single repeatable job:
              external agents executing real software work.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {loopSteps.map((item) => (
              <div key={item.step} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="mb-4 text-sm font-mono text-orange-400">{item.step}</div>
                <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent px-6 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-14 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-4xl font-bold tracking-tight md:text-5xl">The platform map gets simpler</h2>
              <p className="mt-4 max-w-3xl text-lg text-gray-400">
                App, runtime, task state, and delivery should line up cleanly with the agent work loop instead of fighting for attention as separate product stories.
              </p>
            </div>
            <Link
              href="/platform"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-orange-300"
            >
              See platform architecture <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            {platformLanes.map((lane) => {
              const Icon = lane.icon;
              return (
                <div key={lane.title} className={`rounded-3xl border ${lane.border} ${lane.bg} p-5`}>
                  <div className={`mb-4 inline-flex rounded-2xl border ${lane.border} bg-black/30 p-3`}>
                    <Icon className={`h-5 w-5 ${lane.textColor}`} />
                  </div>
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-gray-500">{lane.subtitle}</div>
                  <h3 className="mb-3 text-xl font-semibold">{lane.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{lane.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                <Wrench className="h-4 w-4" />
                BYOK Economics
              </div>
              <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Better models should make Recoder more valuable, not more expensive</h2>
              <p className="text-lg text-gray-400">
                The business model is straightforward: teams keep their own model spend and pay Recoder for orchestration,
                reliability, approvals, artifacts, and execution control.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  title: 'Bring your own keys',
                  text: 'OpenAI, Anthropic, Google, OpenRouter, or your preferred stack stays under your budget and vendor policy.',
                },
                {
                  title: 'Pay for workflow control',
                  text: 'Workspace tiers should scale with active agent capacity, approvals, retention, and observability rather than subsidized tokens.',
                },
                {
                  title: 'Upgrade into controls',
                  text: 'Audit trails, artifact retention, deployment gates, and admin controls are the premium value surface.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                  <div className="mb-3 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gray-500">
                    Strategy
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-6 py-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-gray-300">
              <Shield className="h-4 w-4" />
              Reliability Is The Product
            </div>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Real software execution needs proof, not demos</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {reliabilityPoints.map((point) => (
              <div key={point} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mt-0.5">
                  <Check className="h-5 w-5 text-green-400" />
                </div>
                <p className="text-sm leading-relaxed text-gray-300">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-gradient-to-b from-cyan-500/[0.04] via-transparent to-transparent px-6 py-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
              <Network className="h-4 w-4" />
              A2A + MCP
            </div>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Connect the agents your team already uses</h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-400">
              Claude Code, Codex, and custom tools should not need a separate product worldview. Connect them, assign work,
              and let Recoder become the shared state layer around execution.
            </p>
          </div>

          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-black/50 p-6">
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <Terminal className="h-5 w-5 text-cyan-300" />
              <code className="flex-1 text-sm text-white md:text-base">npx recoder-a2a</code>
              <button
                onClick={() => copy('npx recoder-a2a')}
                className="rounded-xl bg-cyan-500 px-3 py-2 text-black transition-colors hover:bg-cyan-400"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {copiedA2a && <p className="mb-4 text-sm text-cyan-300">Copied to clipboard.</p>}

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  title: 'Discover agents',
                  text: 'Register agent identities and inspect which runtimes are alive, connected, and ready for work.',
                },
                {
                  title: 'Route tasks',
                  text: 'Send software work into one queue and keep execution state visible across the handoff chain.',
                },
                {
                  title: 'Share artifacts',
                  text: 'Preview URLs, logs, files, and PM state stay available to humans and other agents.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 font-semibold">{item.title}</div>
                  <p className="text-sm leading-relaxed text-gray-400">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 pt-8">
        <div className="container mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-gradient-to-r from-orange-500/10 via-white/[0.04] to-cyan-500/10 p-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-gray-200">
            <ClipboardList className="h-4 w-4" />
            Start with one repeated proof loop
          </div>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Connect an agent and run a real software task end to end</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">
            The first milestone is not “chatting with AI.” It is proving that an external agent can complete a real task across code,
            preview, task state, and handoff without manual rescue.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/signup"
              onClick={() => trackCta('Bottom CTA Signup', '/auth/signup', 'bottom_cta')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3 text-base font-semibold text-black transition-colors hover:bg-gray-200"
            >
              Start Free with BYOK
            </Link>
            <Link
              href="/docs/getting-started"
              onClick={() => trackCta('Bottom CTA Docs', '/docs/getting-started', 'bottom_cta')}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-7 py-3 text-base font-semibold text-white transition-colors hover:border-white/35 hover:bg-white/[0.04]"
            >
              Read Getting Started
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
