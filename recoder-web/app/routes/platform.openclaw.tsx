import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export const meta: MetaFunction = () => {
  const title = 'OpenClaw - External Assistant Gateway | Recoder.xyz';
  const description =
    'OpenClaw is the open-source gateway for external AI automation. Event-driven task ingress, distributed trace propagation, lane-based parallel execution, CLI workflow management, and a plugin system for extending the Recoder ecosystem.';
  const url = 'https://web.recoder.xyz/platform/openclaw';

  return [
    { title },
    { name: 'description', content: description },

    // Open Graph
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:site_name', content: 'Recoder.xyz' },
    { property: 'og:type', content: 'website' },
    { property: 'og:image', content: 'https://recoder.xyz/og-image.png' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: 'OpenClaw - External Assistant Gateway' },

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

function OpenClawSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'OpenClaw',
    description:
      'Open-source external assistant gateway with event-driven task ingress, trace propagation, lane-based parallel execution, CLI workflow management, and a plugin extension system for AI automation.',
    url: 'https://web.recoder.xyz/platform/openclaw',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux, Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Open-source, free to use',
    },
    isPartOf: {
      '@type': 'SoftwareApplication',
      name: 'Recoder.xyz',
      url: 'https://recoder.xyz',
    },
    license: 'https://opensource.org/licenses/MIT',
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

const FEATURES = [
  {
    icon: 'i-ph:webhooks-logo',
    title: 'External Automation Ingress',
    description:
      'Accept tasks from webhooks, cron schedules, CI pipelines, and third-party services through a secure, rate-limited ingress layer.',
  },
  {
    icon: 'i-ph:lightning',
    title: 'Event-Driven Tasks',
    description:
      'Tasks are submitted as structured events that flow through the A2A control plane, triggering the right agent with the right context.',
  },
  {
    icon: 'i-ph:chart-line-up',
    title: 'Trace Propagation',
    description:
      'Every request carries a distributed trace ID through the full execution pipeline. Correlate ingress events to agent actions to audit logs.',
  },
  {
    icon: 'i-ph:shield-checkered',
    title: 'Secure Ingress',
    description:
      'HMAC-signed webhooks, API key authentication, IP allowlisting, and automatic rate limiting protect the gateway from abuse.',
  },
  {
    icon: 'i-ph:rows',
    title: 'Lane-Based Parallel Execution',
    description:
      'Concurrent task lanes let multiple agents work in parallel with isolated resource pools and back-pressure controls.',
  },
  {
    icon: 'i-ph:puzzle-piece',
    title: 'Plugin & Extension System',
    description:
      'Extend OpenClaw with custom plugins for new event sources, output sinks, policy hooks, and connector adapters.',
  },
  {
    icon: 'i-ph:terminal-window',
    title: 'CLI Workflow Management',
    description:
      'Manage workflows, check system health, run diagnostics, and monitor status from the command line with the OpenClaw CLI.',
  },
  {
    icon: 'i-ph:stethoscope',
    title: 'Diagnostics & Doctor',
    description:
      'Built-in doctor commands detect misconfiguration, stale locks, orphan processes, and connectivity issues across the agent fleet.',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Event arrives',
    description: 'A webhook, cron timer, or API call hits the OpenClaw ingress endpoint with a structured task payload.',
    color: 'text-accent-400',
  },
  {
    step: '02',
    title: 'Auth & validation',
    description: 'The gateway verifies HMAC signatures, validates the schema, applies rate limits, and attaches a trace ID.',
    color: 'text-green-400',
  },
  {
    step: '03',
    title: 'Task routed to A2A',
    description: 'The validated event is translated into a canonical A2A task envelope and dispatched to the control plane.',
    color: 'text-purple-400',
  },
  {
    step: '04',
    title: 'Agent executes',
    description: 'The control plane selects the best connector (Codex, Claude, or custom) and streams task updates back through the trace.',
    color: 'text-blue-400',
  },
  {
    step: '05',
    title: 'Result & audit',
    description: 'Execution results are returned to the caller. Every state transition is recorded in the tamper-evident audit log.',
    color: 'text-red-400',
  },
];

const INTEGRATIONS = [
  { name: 'GitHub Actions', icon: 'i-ph:github-logo' },
  { name: 'Webhooks', icon: 'i-ph:webhooks-logo' },
  { name: 'Cron / Schedulers', icon: 'i-ph:clock' },
  { name: 'CI/CD Pipelines', icon: 'i-ph:git-merge' },
  { name: 'Slack', icon: 'i-ph:chat-circle-dots' },
  { name: 'REST APIs', icon: 'i-ph:arrow-square-out' },
];

const CLI_COMMANDS = [
  { cmd: 'openclaw status', desc: 'Show system health and running tasks' },
  { cmd: 'openclaw doctor', desc: 'Diagnose configuration and connectivity' },
  { cmd: 'openclaw workflows list', desc: 'List all registered workflows' },
  { cmd: 'openclaw workflows run <id>', desc: 'Trigger a workflow manually' },
  { cmd: 'openclaw logs --trace <id>', desc: 'Stream logs for a trace ID' },
  { cmd: 'openclaw plugins install <pkg>', desc: 'Install a community plugin' },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PlatformOpenClawPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <OpenClawSchema />

      {/* ── Navigation ── */}
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
            <a href="https://recoder.xyz/agents" className="hover:text-white transition-colors">Agents</a>
            <a href="https://recoder.xyz/platform" className="hover:text-white transition-colors">Platform</a>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-accent-500/30 bg-accent-500/10 text-accent-300 text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            Open-Source Gateway
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            The external assistant{' '}
            <span className="bg-gradient-to-r from-accent-400 to-green-400 bg-clip-text text-transparent">
              gateway
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            OpenClaw is the open-source ingress layer that turns external
            events&mdash;webhooks, schedules, CI triggers&mdash;into A2A tasks
            executed by your connected AI agents.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://openclaw.recoder.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-accent-500 to-green-500 font-medium text-white hover:opacity-90 transition-opacity"
            >
              <div className="i-ph:globe w-5 h-5" />
              Launch OpenClaw
            </a>
            <a
              href="https://github.com/nicepkg/recoder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              <div className="i-ph:github-logo w-5 h-5" />
              View Source
            </a>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Everything you need for AI automation</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            From secure ingress to distributed tracing, OpenClaw handles the
            infrastructure so you can focus on agent logic.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:border-accent-500/30 hover:bg-accent-500/[0.03] transition-all"
            >
              <div className={`${f.icon} w-7 h-7 text-accent-400 mb-3`} />
              <h3 className="text-base font-semibold mb-1.5">{f.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Integration Workflow ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">How it works</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Five steps from external event to audited agent execution.
            Every step carries a trace ID for end-to-end observability.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-accent-500/40 via-purple-500/40 to-red-400/40" />

            <div className="space-y-8">
              {WORKFLOW_STEPS.map((s) => (
                <div key={s.step} className="relative flex gap-6">
                  {/* Step number */}
                  <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full border border-white/10 bg-gray-900 flex items-center justify-center">
                    <span className={`text-sm font-bold ${s.color}`}>{s.step}</span>
                  </div>

                  <div className="pt-2">
                    <h3 className="text-lg font-semibold mb-1">{s.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Connects to your stack</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Accept events from anywhere. Extend with plugins for custom
            sources.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
          {INTEGRATIONS.map((i) => (
            <div
              key={i.name}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/10 transition-colors"
            >
              <div className={`${i.icon} w-8 h-8 text-gray-400`} />
              <span className="text-xs text-gray-500 text-center">{i.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CLI section ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="grid gap-12 lg:grid-cols-2 items-start">
          <div>
            <h2 className="text-3xl font-bold mb-3">Powerful CLI</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Manage every aspect of OpenClaw from the terminal. Check health,
              diagnose issues, trigger workflows, stream logs, and install
              plugins&mdash;all without leaving your shell.
            </p>
            <div className="text-sm text-gray-500">
              <p className="mb-2">Install globally:</p>
              <div className="px-4 py-3 rounded-lg bg-gray-900 border border-white/10 font-mono text-gray-300">
                npm install -g @recoder/openclaw
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-gray-900">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-2 text-xs text-gray-500 font-mono">terminal</span>
            </div>
            <div className="p-4 font-mono text-sm space-y-3">
              {CLI_COMMANDS.map((c) => (
                <div key={c.cmd}>
                  <div className="text-gray-300">
                    <span className="text-green-400">$</span> {c.cmd}
                  </div>
                  <div className="text-gray-600 text-xs ml-4"># {c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Automate with open-source confidence
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            OpenClaw is free, open-source, and built to integrate with the
            Recoder A2A control plane. Start automating your agent workflows
            today.
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
              href="https://github.com/nicepkg/recoder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              <div className="i-ph:github-logo w-5 h-5" />
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>&copy; {new Date().getFullYear()} Recoder.xyz. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a href="https://recoder.xyz/platform" className="hover:text-gray-400 transition-colors">Platform</a>
            <Link to="/platform/a2a" className="hover:text-gray-400 transition-colors">A2A Protocol</Link>
            <a href="https://recoder.xyz/docs" className="hover:text-gray-400 transition-colors">Docs</a>
            <a href="https://github.com/nicepkg/recoder" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
