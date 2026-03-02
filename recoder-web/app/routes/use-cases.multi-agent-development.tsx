import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export const meta: MetaFunction = () => {
  const title = 'Multi-Agent Development - AI Agents Collaborating on Code | Recoder.xyz';
  const description =
    'Learn how multiple AI agents — code review, coding, and testing — collaborate on a single codebase through the Recoder A2A protocol. Unified task lifecycle, policy-driven approvals, and tamper-evident audit trails for every change.';
  const url = 'https://web.recoder.xyz/use-cases/multi-agent-development';

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
    { property: 'og:image:alt', content: 'Multi-Agent Development - AI Agents Collaborating on Code' },

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
    headline: 'Multi-Agent Development: How AI Agents Collaborate on a Single Codebase',
    description:
      'A deep-dive into multi-agent development workflows where code review, coding, and testing agents collaborate through the Recoder A2A protocol with unified task lifecycle, policy approvals, and audit trails.',
    url: 'https://web.recoder.xyz/use-cases/multi-agent-development',
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
      '@id': 'https://web.recoder.xyz/use-cases/multi-agent-development',
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

const AGENT_ROLES = [
  {
    icon: 'i-ph:code',
    title: 'Coding Agent',
    description:
      'Generates implementation code from task descriptions. Connected via the Codex or Claude connector, it receives canonical task envelopes and streams incremental updates back through the A2A control plane.',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/20 bg-blue-500/[0.03]',
  },
  {
    icon: 'i-ph:magnifying-glass',
    title: 'Review Agent',
    description:
      'Inspects diffs for correctness, security issues, and style violations. It reads the coding agent\'s output artifact, runs static analysis, and submits structured feedback as a linked audit event.',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/20 bg-purple-500/[0.03]',
  },
  {
    icon: 'i-ph:test-tube',
    title: 'Testing Agent',
    description:
      'Generates and executes test cases against the new code. It reports coverage metrics, regression results, and pass/fail status back to the task orchestrator for final approval gating.',
    color: 'text-green-400',
    borderColor: 'border-green-500/20 bg-green-500/[0.03]',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Task submitted',
    description:
      'A developer creates a task (e.g., "implement pagination for the users API"). The A2A control plane assigns a trace ID and routes it to the coding agent.',
    color: 'text-blue-400',
  },
  {
    step: '02',
    title: 'Coding agent implements',
    description:
      'The coding agent (Codex or Claude connector) receives the task envelope, generates code, and streams progress updates. On completion, the task transitions to "working" with an artifact attached.',
    color: 'text-blue-400',
  },
  {
    step: '03',
    title: 'Review agent analyzes',
    description:
      'The orchestrator delegates a review sub-task to the review agent. It inspects the diff, checks for security patterns, and emits structured feedback as audit events linked to the same trace.',
    color: 'text-purple-400',
  },
  {
    step: '04',
    title: 'Testing agent validates',
    description:
      'A testing sub-task is dispatched in parallel. The testing agent generates unit and integration tests, executes them in the sandbox, and reports coverage and pass/fail metrics.',
    color: 'text-green-400',
  },
  {
    step: '05',
    title: 'Policy gate & approval',
    description:
      'The approval-policy-engine evaluates all sub-task results. If review passes and tests are green, the task is promoted to "completed." If not, it returns to "input-required" with actionable feedback.',
    color: 'text-amber-400',
  },
  {
    step: '06',
    title: 'Audit trail sealed',
    description:
      'Every state transition, review comment, test result, and approval decision is recorded in the tamper-evident audit log with the original trace ID for end-to-end observability.',
    color: 'text-red-400',
  },
];

const BENEFITS = [
  {
    icon: 'i-ph:arrows-split',
    title: 'Parallel execution',
    description: 'Review and testing agents work concurrently through lane-based parallelism, cutting cycle time compared to sequential human review.',
  },
  {
    icon: 'i-ph:arrows-clockwise',
    title: 'Consistent quality',
    description: 'Every change goes through the same structured review and test pipeline. No shortcuts, no skipped steps, no forgotten edge cases.',
  },
  {
    icon: 'i-ph:shield-check',
    title: 'Policy enforcement',
    description: 'The policy plane ensures privileged actions (file writes, dependency changes, config modifications) require explicit approval before merging.',
  },
  {
    icon: 'i-ph:chart-line-up',
    title: 'Full traceability',
    description: 'A single trace ID connects the original task to every code change, review comment, test result, and approval decision across all participating agents.',
  },
  {
    icon: 'i-ph:plugs-connected',
    title: 'Connector flexibility',
    description: 'Swap between Codex, Claude, or future Tier-2 connectors without changing the workflow. The unified connector contract guarantees behavioral parity.',
  },
  {
    icon: 'i-ph:git-merge',
    title: 'Git-native output',
    description: 'Coding agent output flows through the file-git adapter, producing clean branches and commits that integrate with your existing PR and CI workflows.',
  },
];

const EXAMPLE_SCENARIO = {
  title: 'Real-world example: API endpoint implementation',
  steps: [
    { agent: 'Developer', action: 'Submits task: "Add GET /api/v2/users with pagination and filtering"' },
    { agent: 'Coding Agent (Codex)', action: 'Generates controller, service layer, Prisma query, and OpenAPI spec updates' },
    { agent: 'Review Agent (Claude)', action: 'Flags missing input validation on page_size parameter, suggests rate limit header' },
    { agent: 'Coding Agent (Codex)', action: 'Applies review feedback, adds validation and X-RateLimit headers' },
    { agent: 'Testing Agent', action: 'Generates 14 test cases covering pagination edge cases, runs them in sandbox (13/14 pass)' },
    { agent: 'Testing Agent', action: 'Reports: off-by-one on last page calculation. Coding agent auto-fixes.' },
    { agent: 'Policy Engine', action: 'All checks green. Task promoted to completed. Branch ready for human merge.' },
  ],
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function MultiAgentDevelopmentPage() {
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
          <div className="absolute top-0 left-1/3 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Use Case
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            Multiple AI agents,{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 bg-clip-text text-transparent">
              one codebase
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Code, review, and test in parallel. The A2A protocol orchestrates
            specialized agents that collaborate on every change &mdash; with
            policy gates, audit trails, and full traceability from task to merge.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-500 font-medium text-white hover:opacity-90 transition-opacity"
            >
              <div className="i-ph:rocket-launch w-5 h-5" />
              Get Started Free
            </a>
            <Link
              to="/platform/a2a"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              <div className="i-ph:book-open-text w-5 h-5" />
              A2A Architecture
            </Link>
          </div>
        </div>
      </section>

      {/* -- Agent Roles -- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Three agents, one workflow</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Each agent has a specialized role. The A2A control plane manages
            handoffs, parallelism, and policy enforcement between them.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {AGENT_ROLES.map((agent) => (
            <div
              key={agent.title}
              className={`p-6 rounded-xl border ${agent.borderColor} transition-all hover:scale-[1.02]`}
            >
              <div className={`${agent.icon} w-10 h-10 ${agent.color} mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{agent.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{agent.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Workflow Diagram (CSS-based flow) -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">End-to-end workflow</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            From task submission to audit-sealed completion, every step carries a
            trace ID for full observability.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-blue-500/40 via-purple-500/40 to-red-400/40" />

            <div className="space-y-8">
              {WORKFLOW_STEPS.map((s) => (
                <div key={s.step} className="relative flex gap-6">
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

        {/* Flow summary bar */}
        <div className="flex justify-center mt-10">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.02] text-xs text-gray-500 font-mono">
            <span className="text-blue-400">code</span>
            <span>&rarr;</span>
            <span className="text-purple-400">review</span>
            <span>&rarr;</span>
            <span className="text-green-400">test</span>
            <span>&rarr;</span>
            <span className="text-amber-400">approve</span>
            <span>&rarr;</span>
            <span className="text-red-400">audit</span>
          </div>
        </div>
      </section>

      {/* -- Example Scenario -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">{EXAMPLE_SCENARIO.title}</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            A concrete walkthrough showing how the three agents handle a typical
            feature request end-to-end.
          </p>
        </div>

        <div className="max-w-3xl mx-auto rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-gray-900">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="ml-2 text-xs text-gray-500 font-mono">task-trace-a7f3b2</span>
          </div>
          <div className="p-5 space-y-4 font-mono text-sm">
            {EXAMPLE_SCENARIO.steps.map((step, idx) => (
              <div key={idx} className="flex gap-4">
                <span className="flex-shrink-0 w-40 text-right text-gray-600 text-xs pt-0.5">
                  {step.agent}
                </span>
                <span className="text-gray-300">{step.action}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Benefits Grid -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Why multi-agent development?</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            More than automation. Structured collaboration with guarantees that
            traditional single-agent workflows cannot provide.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="group p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all"
            >
              <div className={`${b.icon} w-8 h-8 text-blue-400 mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{b.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Architecture Quick View -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="grid gap-12 lg:grid-cols-2 items-start">
          <div>
            <h2 className="text-3xl font-bold mb-3">Powered by the A2A control plane</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Multi-agent development is not a separate product &mdash; it is a
              workflow pattern built on the same A2A infrastructure that powers
              all of Recoder's agent orchestration. The control plane handles
              identity, task lifecycle, and audit. The connector layer handles
              protocol translation. The policy plane handles approvals.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>Codex and Claude connectors production-validated</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>7-method unified connector contract</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>Deterministic task states: submitted, working, completed, failed</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <div className="i-ph:check-circle w-5 h-5 text-green-400" />
                <span>Tamper-evident audit with structured, signed events</span>
              </div>
            </div>
          </div>

          {/* Visual: agent interaction diagram */}
          <div className="rounded-xl border border-white/10 bg-gray-900/60 p-6">
            <div className="text-xs text-gray-500 mb-4 font-mono">// Agent interaction model</div>
            <div className="space-y-3">
              {/* Developer */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="i-ph:user w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-300 font-medium">Developer</span>
                <span className="ml-auto text-xs text-gray-600">submits task</span>
              </div>
              {/* Arrow */}
              <div className="flex justify-center text-gray-600">
                <div className="i-ph:arrow-down w-5 h-5" />
              </div>
              {/* Control Plane */}
              <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <div className="text-xs text-purple-400 font-medium mb-2">A2A Control Plane</div>
                <div className="text-xs text-gray-500">task-orchestrator + approval-policy-engine</div>
              </div>
              {/* Fan out arrows */}
              <div className="flex justify-center gap-8 text-gray-600">
                <div className="i-ph:arrow-down-left w-5 h-5" />
                <div className="i-ph:arrow-down w-5 h-5" />
                <div className="i-ph:arrow-down-right w-5 h-5" />
              </div>
              {/* Three agents */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                  <div className="text-xs text-blue-400 font-medium">Code</div>
                </div>
                <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/20 text-center">
                  <div className="text-xs text-purple-400 font-medium">Review</div>
                </div>
                <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/20 text-center">
                  <div className="text-xs text-green-400 font-medium">Test</div>
                </div>
              </div>
              {/* Converge arrow */}
              <div className="flex justify-center gap-8 text-gray-600">
                <div className="i-ph:arrow-down-right w-5 h-5" />
                <div className="i-ph:arrow-down w-5 h-5" />
                <div className="i-ph:arrow-down-left w-5 h-5" />
              </div>
              {/* Audit */}
              <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/20">
                <div className="text-xs text-red-400 font-medium mb-1">Audit Trail</div>
                <div className="text-xs text-gray-500">tamper-evident log + trace ID</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- CTA -- */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ship faster with agent-powered development
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Let specialized agents handle code generation, review, and testing
            while you focus on architecture decisions and product direction.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-500 font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <div className="i-ph:rocket-launch w-5 h-5" />
              Get Started Free
            </a>
            <a
              href="https://recoder.xyz/docs/a2a"
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
            to="/use-cases/automated-workflows"
            className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:border-accent-500/30 hover:bg-accent-500/[0.03] transition-all group"
          >
            <h4 className="text-lg font-semibold mb-1 group-hover:text-accent-400 transition-colors">
              Automated Workflows
            </h4>
            <p className="text-sm text-gray-400">
              Event-driven automation with OpenClaw + A2A: CI/CD triggers, webhooks, and scheduled agent runs.
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
