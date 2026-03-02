import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

export const meta: MetaFunction = () => {
  const title = 'Multi-Agent Workflows: Use Cases for Recoder A2A';
  const description =
    'Practical multi-agent workflow patterns with Recoder: PR triage, incident response, migration automation, and release hardening with traceable delegated tasks.';
  const url = 'https://web.recoder.xyz/platform/use-cases/multi-agent-workflows';

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

const USE_CASES = [
  {
    title: 'PR Triage Pipeline',
    summary:
      'OpenClaw ingests webhook events, Codex prepares change summaries, Claude reviews risk, and PM surface logs final approval.',
  },
  {
    title: 'Incident Containment',
    summary:
      'A delegated task fan-out collects logs, proposes rollback patches, and enforces policy approval before production actions.',
  },
  {
    title: 'Schema Migration Assistant',
    summary:
      'One agent drafts migration steps, another validates compatibility, and a final policy gate approves execution windows.',
  },
  {
    title: 'Release Readiness Gate',
    summary:
      'Contract checks, evidence snapshots, and branding drift scans run as trace-linked delegated tasks before release promotion.',
  },
];

export default function MultiAgentWorkflowsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-white">
      <header className="mb-10">
        <p className="text-sm text-gray-400 mb-3">Use Cases</p>
        <h1 className="text-4xl font-bold mb-4">Multi-Agent Workflows</h1>
        <p className="text-gray-300 max-w-3xl">
          Recoder’s A2A model is designed for real operational flows, not demos. These patterns show how teams use
          delegated tasks with trace IDs, policy, and audit history from trigger to completion.
        </p>
      </header>

      <section className="grid gap-4 mb-10">
        {USE_CASES.map((item) => (
          <article key={item.title} className="rounded-xl border border-white/10 p-5 bg-white/5">
            <h2 className="text-xl font-semibold mb-2">{item.title}</h2>
            <p className="text-gray-300 text-sm">{item.summary}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-white/10 p-6 bg-white/5">
        <h2 className="text-2xl font-semibold mb-3">Next steps</h2>
        <div className="flex gap-3">
          <Link to="/platform/a2a" className="px-4 py-2 rounded-md bg-accent-500 text-black font-medium">
            A2A Architecture
          </Link>
          <Link to="/platform/openclaw" className="px-4 py-2 rounded-md border border-white/20">
            OpenClaw Gateway
          </Link>
        </div>
      </section>
    </main>
  );
}
