import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export const meta: MetaFunction = () => {
  const title = 'Automated Workflows - Event-Driven AI Agent Automation | Recoder.xyz';
  const description =
    'Automate development workflows with OpenClaw and the A2A protocol. CI/CD triggers, webhook-driven tasks, scheduled agent runs, and distributed trace propagation for full observability.';
  const url = 'https://web.recoder.xyz/use-cases/automated-workflows';

  return [
    { title },
    { name: 'description', content: description },

    // Open Graph
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:site_name', content: 'Recoder.xyz' },
    { property: 'og:type', content: 'article' },
    { property: 'og:image', content: 'https://recoder.xyz/og-image.png' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: 'Automated Workflows - Event-Driven AI Agent Automation' },

    // Twitter
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: 'https://recoder.xyz/og-image.png' },

    // Canonical
    { tagName: 'link', rel: 'canonical', href: url },
  ];
};

// ---------------------------------------------------------------------------
// Schema markup (JSON-LD)
// ---------------------------------------------------------------------------

function PageSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Automated Workflows: Event-Driven AI Agent Automation with OpenClaw and A2A',
    description:
      'How to build event-driven automation pipelines using OpenClaw as the ingress gateway and the A2A protocol for agent orchestration. Covers CI/CD triggers, webhook-driven tasks, and scheduled agent runs.',
    url: 'https://web.recoder.xyz/use-cases/automated-workflows',
    author: {
      '@type': 'Organization',
      name: 'Recoder.xyz',
      url: 'https://recoder.xyz',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Recoder.xyz',
      url: 'https://recoder.xyz',
    },
    datePublished: '2026-02-25',
    dateModified: '2026-02-25',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': 'https://web.recoder.xyz/use-cases/automated-workflows',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TRIGGER_TYPES = [
  {
    icon: 'i-ph:webhooks-logo',
    title: 'Webhook Events',
    description:
      'GitHub push events, PR opens, issue comments, and custom webhook payloads hit the OpenClaw ingress endpoint and are translated into canonical A2A task envelopes.',
    color: 'text-accent-400',
    borderColor: 'border-accent-500/20 bg-accent-500/[0.03]',
    examples: ['GitHub push', 'PR opened', 'Issue labeled', 'Custom POST payload'],
  },
  {
    icon: 'i-ph:git-merge',
    title: 'CI/CD Pipeline Triggers',
    description:
      'Trigger agent tasks from GitHub Actions, GitLab CI, or any CI system. Failed builds, deployment completions, and quality gates can all spawn agent workflows.',
    color: 'text-green-400',
    borderColor: 'border-green-500/20 bg-green-500/[0.03]',
    examples: ['Build failure', 'Deploy complete', 'Quality gate fail', 'Release candidate ready'],
  },
  {
    icon: 'i-ph:clock',
    title: 'Scheduled Runs',
    description:
      'Cron-based schedules trigger agent tasks at fixed intervals. Use them for dependency audits, security scans, documentation updates, and health checks.',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/20 bg-purple-500/[0.03]',
    examples: ['Daily dep audit', 'Weekly security scan', 'Nightly test suite', 'Hourly health check'],
  },
];

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'External event',
    description:
      'A webhook, CI callback, or cron timer fires. The payload carries context about what happened: which repo, branch, commit, or issue is involved.',
    color: 'text-accent-400',
    icon: 'i-ph:lightning',
  },
  {
    step: '02',
    title: 'OpenClaw ingress',
    description:
      'OpenClaw validates the event (HMAC signature, schema, rate limits), assigns a trace ID, and translates it into a canonical A2A task envelope.',
    color: 'text-green-400',
    icon: 'i-ph:shield-check',
  },
  {
    step: '03',
    title: 'A2A dispatch',
    description:
      'The task envelope hits the A2A control plane. The task-orchestrator identifies the right agent(s), checks policy, and dispatches the work.',
    color: 'text-purple-400',
    icon: 'i-ph:arrows-split',
  },
  {
    step: '04',
    title: 'Agent execution',
    description:
      'One or more agents execute in lane-based parallel. The Codex or Claude connector streams updates. Sub-tasks can fan out to specialized agents.',
    color: 'text-blue-400',
    icon: 'i-ph:cpu',
  },
  {
    step: '05',
    title: 'Result & callback',
    description:
      'Results flow back through the trace. OpenClaw can call back to the original source (update PR status, post Slack message, trigger next CI step).',
    color: 'text-amber-400',
    icon: 'i-ph:arrow-bend-up-right',
  },
  {
    step: '06',
    title: 'Audit sealed',
    description:
      'Every state transition from ingress to completion is recorded in the tamper-evident audit log, linked by the original trace ID.',
    color: 'text-red-400',
    icon: 'i-ph:scroll',
  },
];

const WORKFLOW_EXAMPLES = [
  {
    title: 'Auto-fix failed builds',
    trigger: 'CI build failure webhook',
    flow: 'OpenClaw receives the failure event, extracts the error log, and dispatches a fix-task to the coding agent. The review agent validates the fix. If tests pass, a PR is auto-created.',
    icon: 'i-ph:wrench',
    color: 'text-red-400',
  },
  {
    title: 'PR auto-review pipeline',
    trigger: 'GitHub PR opened webhook',
    flow: 'On PR open, OpenClaw triggers a review pipeline: the review agent analyzes the diff, the testing agent runs coverage checks, and results are posted as PR comments with pass/fail status.',
    icon: 'i-ph:git-pull-request',
    color: 'text-green-400',
  },
  {
    title: 'Scheduled dependency audit',
    trigger: 'Daily cron schedule',
    flow: 'Every day at 2 AM, OpenClaw triggers a dependency audit agent. It scans package.json, Cargo.toml, or go.mod for outdated or vulnerable packages and opens issues for critical findings.',
    icon: 'i-ph:package',
    color: 'text-amber-400',
  },
  {
    title: 'Deploy-and-verify workflow',
    trigger: 'Deployment completion webhook',
    flow: 'After a successful deploy, OpenClaw triggers a verification agent that runs smoke tests against the live environment, checks health endpoints, and alerts the team if anything fails.',
    icon: 'i-ph:cloud-check',
    color: 'text-blue-400',
  },
];

const FEATURES = [
  {
    icon: 'i-ph:chart-line-up',
    title: 'End-to-end tracing',
    description: 'Every event carries a W3C-compatible trace ID from ingress through execution to audit. Correlate webhook events to agent actions to final results.',
  },
  {
    icon: 'i-ph:shield-checkered',
    title: 'Secure ingress',
    description: 'HMAC-signed webhooks, API key authentication, IP allowlisting, and automatic rate limiting protect the gateway from abuse.',
  },
  {
    icon: 'i-ph:rows',
    title: 'Lane-based parallelism',
    description: 'Concurrent task lanes let multiple agents work in parallel with isolated resource pools and back-pressure controls.',
  },
  {
    icon: 'i-ph:puzzle-piece',
    title: 'Plugin extensibility',
    description: 'Extend OpenClaw with custom plugins for new event sources, output sinks, policy hooks, and connector adapters.',
  },
  {
    icon: 'i-ph:arrows-clockwise',
    title: 'Retry & error handling',
    description: 'Failed tasks follow a deterministic error taxonomy with configurable retry policies and dead-letter queues for persistent failures.',
  },
  {
    icon: 'i-ph:terminal-window',
    title: 'CLI management',
    description: 'Manage workflows, check health, stream logs, and trigger runs from the command line with the OpenClaw CLI.',
  },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AutomatedWorkflowsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PageSchema />

      {/* -- Navigation -- */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center text-sm font-bold">
              R
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">IDE</Link>
            <Link to="/platform/a2a" className="hover:text-white transition-colors">A2A Protocol</Link>
            <Link to="/platform/openclaw" className="hover:text-white transition-colors">OpenClaw</Link>
            <a href="https://recoder.xyz/platform" className="hover:text-white transition-colors">Platform</a>
          </nav>
        </div>
      </header>

      {/* -- Hero -- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/2 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-accent-500/30 bg-accent-500/10 text-accent-300 text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            Use Case
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            Event-driven{' '}
            <span className="bg-gradient-to-r from-accent-400 to-green-400 bg-clip-text text-transparent">
              agent automation
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Connect webhooks, CI/CD pipelines, and cron schedules to AI agents
            through OpenClaw. Every event becomes a traced, policy-gated task
            executed by the right agent at the right time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-accent-500 to-green-500 font-medium text-white hover:opacity-90 transition-opacity"
            >
              <div className="i-ph:rocket-launch w-5 h-5" />
              Get Started Free
            </a>
            <Link
              to="/platform/openclaw"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              <div className="i-ph:globe w-5 h-5" />
              OpenClaw Gateway
            </Link>
          </div>
        </div>
      </section>

      {/* -- Trigger Types -- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Three ways to trigger agent workflows</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            OpenClaw accepts events from any source and translates them into
            canonical A2A tasks with full trace context.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {TRIGGER_TYPES.map((trigger) => (
            <div
              key={trigger.title}
              className={`p-6 rounded-xl border ${trigger.borderColor} transition-all`}
            >
              <div className={`${trigger.icon} w-10 h-10 ${trigger.color} mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{trigger.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">{trigger.description}</p>
              <div className="flex flex-wrap gap-2">
                {trigger.examples.map((ex) => (
                  <span
                    key={ex}
                    className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-500 font-mono"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -- Pipeline Flow Diagram -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">From event to execution</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Six steps from external trigger to audited result. Every step
            carries a trace ID for end-to-end observability.
          </p>
        </div>

        {/* Horizontal flow on large screens, vertical on small */}
        <div className="hidden lg:block max-w-5xl mx-auto">
          <div className="grid grid-cols-6 gap-4">
            {PIPELINE_STEPS.map((s, idx) => (
              <div key={s.step} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className={`w-14 h-14 rounded-2xl border border-white/10 bg-gray-900 flex items-center justify-center mb-3`}>
                    <div className={`${s.icon} w-6 h-6 ${s.color}`} />
                  </div>
                  <span className={`text-xs font-bold ${s.color} mb-1`}>{s.step}</span>
                  <h3 className="text-sm font-semibold mb-1">{s.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.description}</p>
                </div>
                {idx < PIPELINE_STEPS.length - 1 && (
                  <div className="absolute top-7 -right-2 text-gray-700">
                    <div className="i-ph:arrow-right w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Vertical flow on small screens */}
        <div className="lg:hidden max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-accent-500/40 via-purple-500/40 to-red-400/40" />
            <div className="space-y-8">
              {PIPELINE_STEPS.map((s) => (
                <div key={s.step} className="relative flex gap-6">
                  <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full border border-white/10 bg-gray-900 flex items-center justify-center">
                    <div className={`${s.icon} w-5 h-5 ${s.color}`} />
                  </div>
                  <div className="pt-1">
                    <span className={`text-xs font-bold ${s.color}`}>{s.step}</span>
                    <h3 className="text-lg font-semibold mb-1">{s.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Flow summary */}
        <div className="flex justify-center mt-10">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.02] text-xs text-gray-500 font-mono">
            <span className="text-accent-400">event</span>
            <span>&rarr;</span>
            <span className="text-green-400">ingress</span>
            <span>&rarr;</span>
            <span className="text-purple-400">dispatch</span>
            <span>&rarr;</span>
            <span className="text-blue-400">execute</span>
            <span>&rarr;</span>
            <span className="text-amber-400">callback</span>
            <span>&rarr;</span>
            <span className="text-red-400">audit</span>
          </div>
        </div>
      </section>

      {/* -- Workflow Examples -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Real-world automation patterns</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            These patterns show how teams use OpenClaw + A2A to automate
            repetitive development tasks end-to-end.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {WORKFLOW_EXAMPLES.map((ex) => (
            <div
              key={ex.title}
              className="p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/10 transition-all"
            >
              <div className="flex items-start gap-4 mb-3">
                <div className={`${ex.icon} w-8 h-8 ${ex.color} flex-shrink-0`} />
                <div>
                  <h3 className="text-lg font-semibold">{ex.title}</h3>
                  <div className="text-xs text-gray-600 font-mono mt-0.5">{ex.trigger}</div>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{ex.flow}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Architecture Integration -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="grid gap-12 lg:grid-cols-2 items-start">
          <div>
            <h2 className="text-3xl font-bold mb-3">OpenClaw + A2A: better together</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              OpenClaw is the ingress layer. A2A is the orchestration layer.
              Together they form a complete event-driven automation pipeline
              where every external signal becomes a traced, policy-gated,
              audited agent task.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>HMAC-signed webhook verification</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>Automatic rate limiting and IP allowlisting</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>W3C trace context propagation across the full pipeline</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>Plugin system for custom event sources and output sinks</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>Lane-based parallel execution with back-pressure controls</span>
              </div>
            </div>
          </div>

          {/* Visual: integration diagram */}
          <div className="rounded-xl border border-white/10 bg-gray-900/60 p-6">
            <div className="text-xs text-gray-500 mb-4 font-mono">// Event-driven architecture</div>
            <div className="space-y-3">
              {/* Event sources */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-accent-500/5 border border-accent-500/20 text-center">
                  <div className="i-ph:webhooks-logo w-5 h-5 text-accent-400 mx-auto mb-1" />
                  <div className="text-xs text-accent-400">Webhooks</div>
                </div>
                <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/20 text-center">
                  <div className="i-ph:git-merge w-5 h-5 text-green-400 mx-auto mb-1" />
                  <div className="text-xs text-green-400">CI/CD</div>
                </div>
                <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/20 text-center">
                  <div className="i-ph:clock w-5 h-5 text-purple-400 mx-auto mb-1" />
                  <div className="text-xs text-purple-400">Cron</div>
                </div>
              </div>
              {/* Arrow */}
              <div className="flex justify-center text-gray-600">
                <div className="i-ph:arrow-down w-5 h-5" />
              </div>
              {/* OpenClaw */}
              <div className="p-3 rounded-lg bg-accent-500/5 border border-accent-500/20">
                <div className="text-xs text-accent-400 font-medium mb-1">OpenClaw Ingress</div>
                <div className="text-xs text-gray-500">auth + validation + trace ID + rate limit</div>
              </div>
              {/* Arrow */}
              <div className="flex justify-center text-gray-600">
                <div className="i-ph:arrow-down w-5 h-5" />
              </div>
              {/* A2A Control Plane */}
              <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <div className="text-xs text-purple-400 font-medium mb-1">A2A Control Plane</div>
                <div className="text-xs text-gray-500">task-orchestrator + policy-engine</div>
              </div>
              {/* Arrow */}
              <div className="flex justify-center text-gray-600">
                <div className="i-ph:arrow-down w-5 h-5" />
              </div>
              {/* Agents */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                  <div className="text-xs text-blue-400 font-medium">Codex Connector</div>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                  <div className="text-xs text-blue-400 font-medium">Claude Connector</div>
                </div>
              </div>
              {/* Arrow */}
              <div className="flex justify-center text-gray-600">
                <div className="i-ph:arrow-down w-5 h-5" />
              </div>
              {/* Results */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-center">
                  <div className="text-xs text-amber-400">Callback / PR</div>
                </div>
                <div className="p-2 rounded-lg bg-red-400/5 border border-red-400/20 text-center">
                  <div className="text-xs text-red-400">Audit Trail</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Features Grid -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Built for production automation</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Every feature is designed for reliability, observability, and
            extensibility in real production environments.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:border-accent-500/30 hover:bg-accent-500/[0.03] transition-all"
            >
              <div className={`${f.icon} w-8 h-8 text-accent-400 mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -- CTA -- */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Automate your development pipeline
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Connect your webhooks, CI/CD pipelines, and schedules to AI agents.
            Let OpenClaw and the A2A protocol handle the orchestration, tracing,
            and audit.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-gradient-to-r from-accent-500 to-green-500 font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <div className="i-ph:rocket-launch w-5 h-5" />
              Get Started Free
            </a>
            <a
              href="https://recoder.xyz/docs/openclaw"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              <div className="i-ph:book-open-text w-5 h-5" />
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* -- Related pages -- */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="text-center mb-10">
          <h3 className="text-xl font-semibold text-gray-300">Explore more use cases</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/use-cases/multi-agent-development"
            className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all group"
          >
            <h4 className="text-lg font-semibold mb-1 group-hover:text-blue-400 transition-colors">
              Multi-Agent Development
            </h4>
            <p className="text-sm text-gray-400">
              How coding, review, and testing agents collaborate on a single codebase through the A2A protocol.
            </p>
          </Link>
          <Link
            to="/use-cases/enterprise-orchestration"
            className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:border-amber-500/30 hover:bg-amber-500/[0.03] transition-all group"
          >
            <h4 className="text-lg font-semibold mb-1 group-hover:text-amber-400 transition-colors">
              Enterprise Orchestration
            </h4>
            <p className="text-sm text-gray-400">
              Policy controls, approval workflows, and audit trails for enterprise-grade agent management.
            </p>
          </Link>
        </div>
      </section>

      {/* -- Footer -- */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>&copy; {new Date().getFullYear()} Recoder.xyz. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link to="/platform/a2a" className="hover:text-gray-400 transition-colors">A2A Protocol</Link>
            <Link to="/platform/openclaw" className="hover:text-gray-400 transition-colors">OpenClaw</Link>
            <a href="https://recoder.xyz/docs" className="hover:text-gray-400 transition-colors">Docs</a>
            <a href="https://github.com/nicepkg/recoder" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
