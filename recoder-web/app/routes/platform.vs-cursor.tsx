import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

export const meta: MetaFunction = () => {
  const title = 'Recoder vs Cursor: Multi-Agent Control Plane Comparison';
  const description =
    'Compare Recoder and Cursor for team-scale AI coding. Recoder adds A2A orchestration, policy approvals, and connector-level audit trails across agents.';
  const url = 'https://web.recoder.xyz/platform/vs-cursor';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:type', content: 'article' },
    { property: 'og:image', content: 'https://recoder.xyz/og-image.png' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: 'https://recoder.xyz/og-image.png' },
    { tagName: 'link', rel: 'canonical', href: url },
  ];
};

const ROWS = [
  ['Primary model', 'Single-assistant IDE flow', 'Multi-agent control plane across connectors'],
  ['Delegation', 'Manual handoff between tools', 'Native delegated tasks with trace IDs'],
  ['Policy controls', 'Local/editor constraints', 'Approval + policy middleware in task lifecycle'],
  ['Audit trail', 'Basic activity history', 'Tamper-evident task + approval events'],
  ['Connector strategy', 'IDE native integrations', 'Tiered connector contracts (Codex/Claude/OpenClaw)'],
];

export default function PlatformVsCursorPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-white">
      <header className="mb-10">
        <p className="text-sm text-gray-400 mb-3">Comparison</p>
        <h1 className="text-4xl font-bold mb-4">Recoder vs Cursor</h1>
        <p className="text-gray-300 max-w-3xl">
          Cursor is strong for single-assistant code editing. Recoder is built for orchestrating multiple assistants
          with shared policy and audit controls.
        </p>
      </header>

      <section className="rounded-xl border border-white/10 overflow-hidden mb-10">
        <div className="grid grid-cols-3 bg-white/5 text-sm font-semibold">
          <div className="p-4">Capability</div>
          <div className="p-4">Cursor</div>
          <div className="p-4">Recoder</div>
        </div>
        {ROWS.map(([cap, cursor, recoder]) => (
          <div key={cap} className="grid grid-cols-3 border-t border-white/10 text-sm">
            <div className="p-4 text-gray-200">{cap}</div>
            <div className="p-4 text-gray-400">{cursor}</div>
            <div className="p-4 text-gray-200">{recoder}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-white/10 p-6 bg-white/5">
        <h2 className="text-2xl font-semibold mb-3">When to pick Recoder</h2>
        <p className="text-gray-300 mb-5">
          Use Recoder when teams need deterministic delegation, approval workflows, and connector-level reliability
          gates across multiple AI assistants.
        </p>
        <div className="flex gap-3">
          <a
            href="https://recoder.xyz/auth/signup"
            className="px-4 py-2 rounded-md bg-accent-500 text-black font-medium"
          >
            Start Free
          </a>
          <Link to="/platform/a2a" className="px-4 py-2 rounded-md border border-white/20">
            See A2A Protocol
          </Link>
        </div>
      </section>
    </main>
  );
}
