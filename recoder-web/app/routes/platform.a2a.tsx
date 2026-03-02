import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export const meta: MetaFunction = () => {
  const title = 'A2A Protocol - Agent-to-Agent Communication | Recoder.xyz';
  const description =
    'The A2A control plane lets different AI coding assistants collaborate through a unified protocol. Multi-agent orchestration, Tier-1 connectors for Codex and Claude, policy-driven approval flows, and a tamper-evident audit trail.';
  const url = 'https://web.recoder.xyz/platform/a2a';

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
    { property: 'og:image:alt', content: 'A2A Protocol - Agent-to-Agent Communication' },

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

function A2ASchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Recoder A2A Protocol',
    description:
      'Agent-to-Agent communication protocol enabling multi-agent orchestration across AI coding assistants with unified task lifecycle, policy-driven approvals, and tamper-evident audit trail.',
    url: 'https://web.recoder.xyz/platform/a2a',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier available',
    },
    isPartOf: {
      '@type': 'SoftwareApplication',
      name: 'Recoder.xyz',
      url: 'https://recoder.xyz',
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

const FEATURES = [
  {
    icon: 'i-ph:users-three',
    title: 'Multi-Agent Orchestration',
    description:
      'A single control plane manages agent identity, capability discovery, and task lifecycle across every connected assistant.',
  },
  {
    icon: 'i-ph:plugs-connected',
    title: 'Connector Ecosystem',
    description:
      'UACB adapters translate platform-native protocols (MCP, JSON-RPC, LSP, REST, File/Git) into canonical control-plane models.',
  },
  {
    icon: 'i-ph:shield-check',
    title: 'Policy & Approval Flows',
    description:
      'Centralized identity, RBAC/ACL authorization, sandbox rules, and human-in-the-loop approval workflows for privileged actions.',
  },
  {
    icon: 'i-ph:scroll',
    title: 'Tamper-Evident Audit Trail',
    description:
      'Every task state transition, approval decision, and execution event is recorded with structured, signed audit events.',
  },
  {
    icon: 'i-ph:arrows-clockwise',
    title: 'Canonical Task Lifecycle',
    description:
      'Tasks progress through deterministic states: submitted, working, input-required, completed, cancelled, or failed.',
  },
  {
    icon: 'i-ph:buildings',
    title: 'Release Gate Governance',
    description:
      'No connector ships as "Supported" until it passes deterministic CI checks, contract parity, smoke evidence, and policy integration gates.',
  },
];

const TIER1_CONNECTORS = [
  {
    name: 'Codex',
    status: 'Supported',
    statusColor: 'text-green-400',
    description: 'OpenAI Codex integration with full contract parity and production smoke evidence.',
  },
  {
    name: 'Claude',
    status: 'Supported',
    statusColor: 'text-green-400',
    description: 'Anthropic Claude integration with approval/policy validation and deterministic CI.',
  },
];

const TIER2_CONNECTORS = [
  { name: 'Cursor', status: 'Backlog' },
  { name: 'Windsurf', status: 'Backlog' },
  { name: 'Replit', status: 'Backlog' },
  { name: 'VS Code Copilot', status: 'Backlog' },
  { name: 'JetBrains', status: 'Backlog' },
];

const ARCHITECTURE_LAYERS = [
  {
    label: 'Control Plane',
    color: 'border-purple-500/40 bg-purple-500/5',
    services: ['agent-registry', 'task-orchestrator', 'approval-policy-engine', 'audit-log-service', 'collaboration-service'],
  },
  {
    label: 'Connector Plane',
    color: 'border-accent-500/40 bg-accent-500/5',
    services: ['connector-manager', 'mcp-adapter', 'jsonrpc-adapter', 'lsp-adapter', 'rest-adapter', 'file-git-adapter'],
  },
  {
    label: 'Policy Plane',
    color: 'border-green-500/40 bg-green-500/5',
    services: ['identity-service', 'authorization-service', 'sandbox-policy-service', 'approval-workflow-service', 'audit-signing-service'],
  },
  {
    label: 'Release Gate Plane',
    color: 'border-red-400/40 bg-red-400/5',
    services: ['phase3-production-gates', 'a5-release-evidence', 'check-phase3-ga-ready', 'signoff-workflows'],
  },
];

const CONNECTOR_CONTRACT = [
  'discoverCapabilities()',
  'submitTask(task)',
  'streamTaskUpdates(taskId)',
  'cancelTask(taskId)',
  'extractContext(scope)',
  'mapPlatformActionToPolicyAction(action)',
  'emitAuditEvent(event)',
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PlatformA2APage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <A2ASchema />

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
            <Link to="/platform/openclaw" className="hover:text-white transition-colors">OpenClaw</Link>
            <a href="https://recoder.xyz/agents" className="hover:text-white transition-colors">Agents</a>
            <a href="https://recoder.xyz/platform" className="hover:text-white transition-colors">Platform</a>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-500/15 rounded-full blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Agent-to-Agent Protocol
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            One control plane for{' '}
            <span className="bg-gradient-to-r from-purple-400 to-accent-400 bg-clip-text text-transparent">
              every AI assistant
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            The A2A protocol lets different AI coding assistants collaborate
            through a unified task lifecycle, connector layer, and policy plane
            &mdash; so your agents work <em>together</em>, not in silos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/docs/a2a"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-accent-500 font-medium text-white hover:opacity-90 transition-opacity"
            >
              <div className="i-ph:book-open-text w-5 h-5" />
              Read the Docs
            </a>
            <a
              href="https://recoder.xyz/platform"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              <div className="i-ph:squares-four w-5 h-5" />
              View All Services
            </a>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Built for multi-agent interop</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Four canonical planes work together so connectors, policies, and
            release gates stay in sync across every agent runtime.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/[0.03] transition-all"
            >
              <div className={`${f.icon} w-8 h-8 text-purple-400 mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (text-based) ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Architecture at a glance</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Four stacked planes separate concerns cleanly. Each plane owns a
            specific set of responsibilities and communicates through
            well-defined contracts.
          </p>
        </div>

        <div className="space-y-6 max-w-3xl mx-auto">
          {ARCHITECTURE_LAYERS.map((layer) => (
            <div
              key={layer.label}
              className={`rounded-xl border p-5 ${layer.color}`}
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300 mb-3">
                {layer.label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {layer.services.map((s) => (
                  <span
                    key={s}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Arrow indicator between planes */}
        <div className="flex justify-center mt-6 text-gray-600 text-xs font-mono">
          control&nbsp;&darr;&nbsp;connector&nbsp;&darr;&nbsp;policy&nbsp;&darr;&nbsp;release
        </div>
      </section>

      {/* ── Unified Connector Contract ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="grid gap-12 lg:grid-cols-2 items-start">
          <div>
            <h2 className="text-3xl font-bold mb-3">Unified connector contract</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Every connector&mdash;whether it speaks MCP, JSON-RPC, LSP, REST,
              or File/Git&mdash;implements the same seven-method interface. This
              guarantees canonical task states, policy routing, and structured
              audit events regardless of the underlying platform.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>Required behavior:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use canonical control-plane task states</li>
                <li>Route privileged actions through the policy engine</li>
                <li>Emit structured audit events for approvals and execution</li>
                <li>Return deterministic error taxonomy</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-gray-900/60 p-6 font-mono text-sm">
            <div className="text-gray-500 mb-3">// ConnectorInterface</div>
            {CONNECTOR_CONTRACT.map((method) => (
              <div key={method} className="py-1.5 border-b border-white/5 last:border-0">
                <span className="text-purple-400">fn</span>{' '}
                <span className="text-gray-200">{method}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Connectors ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-white/5">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Connector ecosystem</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Tier-1 connectors are production-validated today. Tier-2 connectors
            are on the backlog and will be promoted once the GA release gate
            passes.
          </p>
        </div>

        {/* Tier 1 */}
        <div className="mb-12">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-4">
            Tier 1 &mdash; Active
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {TIER1_CONNECTORS.map((c) => (
              <div
                key={c.name}
                className="p-5 rounded-xl border border-green-500/20 bg-green-500/[0.03]"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-lg font-semibold">{c.name}</h4>
                  <span className={`text-xs font-medium ${c.statusColor}`}>{c.status}</span>
                </div>
                <p className="text-sm text-gray-400">{c.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tier 2 */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
            Tier 2 &mdash; Backlog
          </h3>
          <div className="flex flex-wrap gap-3">
            {TIER2_CONNECTORS.map((c) => (
              <span
                key={c.name}
                className="px-4 py-2 rounded-lg border border-white/5 bg-white/[0.02] text-sm text-gray-500"
              >
                {c.name}
                <span className="ml-2 text-xs text-gray-600">{c.status}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to connect your agents?
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Start building multi-agent workflows with the A2A control plane.
            Integrate Codex, Claude, and more through a single protocol.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://recoder.xyz/auth/signin"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-gradient-to-r from-purple-600 to-accent-500 font-semibold text-white hover:opacity-90 transition-opacity"
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
              View on GitHub
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
            <Link to="/platform/openclaw" className="hover:text-gray-400 transition-colors">OpenClaw</Link>
            <a href="https://recoder.xyz/docs" className="hover:text-gray-400 transition-colors">Docs</a>
            <a href="https://github.com/nicepkg/recoder" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
