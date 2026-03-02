import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export const meta: MetaFunction = () => {
  const title = 'Enterprise Orchestration - Policy, Approvals & Audit for AI Agents | Recoder.xyz';
  const description =
    'Enterprise-grade AI agent orchestration with centralized policy controls, human-in-the-loop approval workflows, RBAC authorization, sandbox rules, and tamper-evident audit trails. Built on the Recoder A2A protocol.';
  const url = 'https://web.recoder.xyz/use-cases/enterprise-orchestration';

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
    { property: 'og:image:alt', content: 'Enterprise Orchestration - Policy, Approvals & Audit for AI Agents' },

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
    headline: 'Enterprise Orchestration: Policy Controls, Approval Workflows, and Audit Trails for AI Agents',
    description:
      'How enterprise teams use the Recoder A2A policy plane for RBAC authorization, sandbox rules, human-in-the-loop approval workflows, and tamper-evident audit trails across all AI agent operations.',
    url: 'https://web.recoder.xyz/use-cases/enterprise-orchestration',
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
      '@id': 'https://web.recoder.xyz/use-cases/enterprise-orchestration',
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

const POLICY_PILLARS = [
  {
    icon: 'i-ph:identification-card',
    title: 'Identity & Authentication',
    description:
      'Every agent, service, and user has a verified identity registered in the control plane. The identity-service handles authentication and issues scoped credentials for all operations.',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/20 bg-blue-500/[0.03]',
    service: 'identity-service',
  },
  {
    icon: 'i-ph:lock-key',
    title: 'Authorization (RBAC/ACL)',
    description:
      'Fine-grained role-based and capability-based access control determines which agents can perform which actions. The authorization-service evaluates permissions for every task dispatch.',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/20 bg-purple-500/[0.03]',
    service: 'authorization-service',
  },
  {
    icon: 'i-ph:cube',
    title: 'Sandbox Policy',
    description:
      'Agent execution environments are isolated and constrained by sandbox rules. File system access, network calls, and resource consumption are bounded by configurable policies.',
    color: 'text-green-400',
    borderColor: 'border-green-500/20 bg-green-500/[0.03]',
    service: 'sandbox-policy-service',
  },
  {
    icon: 'i-ph:hand-palm',
    title: 'Approval Workflows',
    description:
      'Privileged actions (production deployments, config changes, dependency additions) require explicit human-in-the-loop approval before execution proceeds.',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/20 bg-amber-500/[0.03]',
    service: 'approval-workflow-service',
  },
  {
    icon: 'i-ph:scroll',
    title: 'Tamper-Evident Audit',
    description:
      'Every task state transition, approval decision, and execution event is recorded with structured, signed audit events. The audit log is immutable and traceable end-to-end.',
    color: 'text-red-400',
    borderColor: 'border-red-400/20 bg-red-400/[0.03]',
    service: 'audit-signing-service',
  },
];

const APPROVAL_FLOW_STEPS = [
  {
    step: '01',
    title: 'Privileged action detected',
    description:
      'A connector calls mapPlatformActionToPolicyAction() to translate a platform-specific action into a canonical policy action. The policy engine identifies it as requiring approval.',
    color: 'text-blue-400',
  },
  {
    step: '02',
    title: 'Task paused at input-required',
    description:
      'The task transitions to the "input-required" state. Execution is suspended until the approval workflow completes. The trace ID links the pending approval to the original task.',
    color: 'text-amber-400',
  },
  {
    step: '03',
    title: 'Approval request dispatched',
    description:
      'The approval-workflow-service notifies designated approvers via configured channels (Slack, email, dashboard). The request includes full context: what action, which agent, what scope.',
    color: 'text-purple-400',
  },
  {
    step: '04',
    title: 'Human review & decision',
    description:
      'The approver reviews the request context, examines the agent\'s proposed action, and makes an approve/reject decision. The decision is captured as a signed audit event.',
    color: 'text-green-400',
  },
  {
    step: '05',
    title: 'Execution resumes or terminates',
    description:
      'On approval, the task transitions back to "working" and the agent proceeds. On rejection, the task transitions to "cancelled" with the rejection reason in the audit trail.',
    color: 'text-accent-400',
  },
  {
    step: '06',
    title: 'Full audit sealed',
    description:
      'The complete approval lifecycle (request, notification, decision, execution outcome) is recorded as a chain of signed audit events linked to the original trace.',
    color: 'text-red-400',
  },
];

const ENTERPRISE_SCENARIOS = [
  {
    title: 'Production deployment gate',
    description:
      'A coding agent completes a feature branch and requests deployment to production. The policy engine requires senior engineer approval. The request includes diff summary, test results, and risk assessment. Only after approval does the deploy proceed.',
    icon: 'i-ph:cloud-arrow-up',
    approver: 'Senior Engineer',
    action: 'Deploy to production',
  },
  {
    title: 'Security-sensitive file access',
    description:
      'An agent needs to modify .env files or security configuration. The sandbox-policy-service flags the action as restricted. The approval workflow routes it to the security team with full context about what will change and why.',
    icon: 'i-ph:shield-warning',
    approver: 'Security Team',
    action: 'Modify secrets/config',
  },
  {
    title: 'New dependency addition',
    description:
      'An agent proposes adding a new npm package or Go module. The policy engine triggers a supply-chain review: license check, vulnerability scan, and maintainer reputation. A tech lead approves or suggests alternatives.',
    icon: 'i-ph:package',
    approver: 'Tech Lead',
    action: 'Add dependency',
  },
  {
    title: 'Database migration execution',
    description:
      'A schema migration agent generates migration files. Before execution, the approval workflow requires DBA sign-off on the migration plan. The audit trail captures the exact schema changes, rollback plan, and approval chain.',
    icon: 'i-ph:database',
    approver: 'DBA / Platform Team',
    action: 'Execute migration',
  },
];

const AUDIT_FEATURES = [
  {
    icon: 'i-ph:fingerprint',
    title: 'Signed events',
    description: 'Every audit event is cryptographically signed to prevent tampering. Events include agent identity, action type, timestamp, and trace ID.',
  },
  {
    icon: 'i-ph:link',
    title: 'Trace-linked',
    description: 'Audit events carry the W3C trace ID from the original task submission. Reconstruct the full execution timeline from trigger to completion.',
  },
  {
    icon: 'i-ph:magnifying-glass',
    title: 'Searchable & filterable',
    description: 'Query the audit log by agent, action type, time range, approval status, or trace ID. Full-text search across event payloads.',
  },
  {
    icon: 'i-ph:export',
    title: 'Exportable',
    description: 'Export audit logs in structured formats (JSON, CSV) for compliance reporting, incident investigation, or integration with SIEM tools.',
  },
  {
    icon: 'i-ph:timer',
    title: 'Real-time streaming',
    description: 'Stream audit events in real-time to dashboards, alerting systems, or external log aggregators for live visibility into agent operations.',
  },
  {
    icon: 'i-ph:lock',
    title: 'Immutable storage',
    description: 'Audit events are append-only. No event can be modified or deleted after creation. Retention policies ensure long-term compliance.',
  },
];

const COMPLIANCE_BADGES = [
  { label: 'RBAC/ACL', description: 'Role-based access control' },
  { label: 'HITL', description: 'Human-in-the-loop approvals' },
  { label: 'Audit Trail', description: 'Tamper-evident logging' },
  { label: 'Sandbox', description: 'Isolated execution environments' },
  { label: 'Signed Events', description: 'Cryptographic event signing' },
  { label: 'Trace Context', description: 'W3C trace propagation' },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EnterpriseOrchestrationPage() {
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
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-400/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Use Case
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            Enterprise-grade{' '}
            <span className="bg-gradient-to-r from-amber-400 to-red-400 bg-clip-text text-transparent">
              agent governance
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Policy controls, approval workflows, and tamper-evident audit trails
            for teams that need to know exactly what their AI agents are doing,
            why, and who approved it.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-red-500 font-medium text-white hover:opacity-90 transition-opacity"
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

          {/* Compliance badges */}
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            {COMPLIANCE_BADGES.map((badge) => (
              <div
                key={badge.label}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-gray-400"
                title={badge.description}
              >
                {badge.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Policy Pillars -- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Five pillars of the policy plane</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            The A2A policy plane is a dedicated architectural layer that
            centralizes identity, authorization, sandbox rules, approvals,
            and audit signing across all agent operations.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {POLICY_PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className={`p-6 rounded-xl border ${pillar.borderColor} transition-all hover:scale-[1.02]`}
            >
              <div className={`${pillar.icon} w-10 h-10 ${pillar.color} mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{pillar.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-3">{pillar.description}</p>
              <div className="inline-flex px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-gray-500">
                {pillar.service}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -- Approval Workflow Flow -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Human-in-the-loop approval workflow</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            When an agent attempts a privileged action, the task pauses until a
            human approver reviews and makes a decision. Every step is audited.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-blue-500/40 via-amber-500/40 to-red-400/40" />
            <div className="space-y-8">
              {APPROVAL_FLOW_STEPS.map((s) => (
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

        {/* Flow summary */}
        <div className="flex justify-center mt-10">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.02] text-xs text-gray-500 font-mono">
            <span className="text-blue-400">detect</span>
            <span>&rarr;</span>
            <span className="text-amber-400">pause</span>
            <span>&rarr;</span>
            <span className="text-purple-400">notify</span>
            <span>&rarr;</span>
            <span className="text-green-400">review</span>
            <span>&rarr;</span>
            <span className="text-accent-400">resume</span>
            <span>&rarr;</span>
            <span className="text-red-400">audit</span>
          </div>
        </div>
      </section>

      {/* -- Enterprise Scenarios -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Real-world enterprise scenarios</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            These patterns show how enterprise teams use the policy plane to
            maintain control over AI agent operations in production.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {ENTERPRISE_SCENARIOS.map((scenario) => (
            <div
              key={scenario.title}
              className="p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:border-amber-500/20 hover:bg-amber-500/[0.02] transition-all"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`${scenario.icon} w-8 h-8 text-amber-400 flex-shrink-0`} />
                <div>
                  <h3 className="text-lg font-semibold">{scenario.title}</h3>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-gray-600 font-mono">
                      approver: {scenario.approver}
                    </span>
                    <span className="text-xs text-amber-500/60 font-mono">
                      action: {scenario.action}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{scenario.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Audit Trail Deep Dive -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="grid gap-12 lg:grid-cols-2 items-start">
          <div>
            <h2 className="text-3xl font-bold mb-3">Tamper-evident audit trail</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              The audit-signing-service records every meaningful event in agent
              operations. Events are cryptographically signed, trace-linked, and
              stored in append-only storage. This gives enterprise teams a
              complete, unforgeable record of everything their agents have done.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {AUDIT_FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <div className={`${f.icon} w-5 h-5 text-red-400 flex-shrink-0 mt-0.5`} />
                  <div>
                    <h4 className="text-sm font-semibold mb-0.5">{f.title}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual: audit event example */}
          <div className="rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-gray-900">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-2 text-xs text-gray-500 font-mono">audit-event.json</span>
            </div>
            <div className="p-5 font-mono text-xs leading-relaxed">
              <div className="text-gray-600">{'{'}</div>
              <div className="ml-4">
                <span className="text-purple-400">"event_id"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"evt_a7f3b2c9"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"trace_id"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"00-4bf92f3577b34da6-00f067aa0ba902b7-01"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"type"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"approval.granted"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"agent_id"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"codex-connector-01"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"action"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"deploy.production"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"approver"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"user:sr-eng-jane"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"decision"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"approved"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"timestamp"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"2026-02-25T14:32:07Z"</span>
                <span className="text-gray-600">,</span>
              </div>
              <div className="ml-4">
                <span className="text-purple-400">"signature"</span>
                <span className="text-gray-600">: </span>
                <span className="text-green-400">"sha256:e3b0c44298fc..."</span>
              </div>
              <div className="text-gray-600">{'}'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Policy Plane Architecture View -- */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Policy plane architecture</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            The policy plane is a dedicated architectural layer in the A2A
            control plane, separate from the connector and release gate planes.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {/* Control Plane */}
          <div className="rounded-xl border border-purple-500/40 bg-purple-500/5 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-300 mb-3">
              Control Plane
            </h3>
            <div className="flex flex-wrap gap-2">
              {['agent-registry', 'task-orchestrator', 'approval-policy-engine', 'audit-log-service', 'collaboration-service'].map((s) => (
                <span
                  key={s}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-300"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Policy Plane (highlighted) */}
          <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-5 relative">
            <div className="absolute -top-3 left-4 px-2 bg-gray-950 text-xs text-amber-400 font-semibold">
              ENTERPRISE FOCUS
            </div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-300 mb-3">
              Policy Plane
            </h3>
            <div className="flex flex-wrap gap-2">
              {['identity-service', 'authorization-service', 'sandbox-policy-service', 'approval-workflow-service', 'audit-signing-service'].map((s) => (
                <span
                  key={s}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-200"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Connector Plane */}
          <div className="rounded-xl border border-accent-500/40 bg-accent-500/5 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-accent-300 mb-3">
              Connector Plane
            </h3>
            <div className="flex flex-wrap gap-2">
              {['connector-manager', 'mcp-adapter', 'jsonrpc-adapter', 'lsp-adapter', 'rest-adapter', 'file-git-adapter'].map((s) => (
                <span
                  key={s}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-300"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Release Gate Plane */}
          <div className="rounded-xl border border-red-400/40 bg-red-400/5 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-red-300 mb-3">
              Release Gate Plane
            </h3>
            <div className="flex flex-wrap gap-2">
              {['phase3-production-gates', 'a5-release-evidence', 'check-phase3-ga-ready', 'signoff-workflows'].map((s) => (
                <span
                  key={s}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-300"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-6 text-gray-600 text-xs font-mono">
          control&nbsp;&darr;&nbsp;policy&nbsp;&darr;&nbsp;connector&nbsp;&darr;&nbsp;release
        </div>
      </section>

      {/* -- CTA -- */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Govern your AI agents with confidence
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Deploy AI agents at enterprise scale with the policy controls,
            approval workflows, and audit trails your organization requires.
            Every action traced. Every decision recorded.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-gradient-to-r from-amber-500 to-red-500 font-semibold text-white hover:opacity-90 transition-opacity"
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
