import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';

export const meta: MetaFunction = () => {
  const title = 'Recoder vs Replit: AI Build Platform Comparison';
  const description =
    'Compare Recoder and Replit for production-grade AI-assisted development. Recoder focuses on multi-agent orchestration, policy enforcement, and cross-connector task governance.';
  const url = 'https://web.recoder.xyz/platform/vs-replit';

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

const COMPARISON = [
  {
    area: 'Core focus',
    replit: 'Cloud IDE + rapid app prototyping',
    recoder: 'Agent coordination + governance for serious delivery',
  },
  {
    area: 'Execution model',
    replit: 'Single interactive runtime',
    recoder: 'Task-based orchestration across connectors',
  },
  {
    area: 'Approvals & policy',
    replit: 'Basic workspace controls',
    recoder: 'Policy hooks + approval timeline for privileged actions',
  },
  {
    area: 'Interop',
    replit: 'Platform-native',
    recoder: 'A2A contract with Codex/Claude/OpenClaw adapters',
  },
];

export default function PlatformVsReplitPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-white">
      <header className="mb-10">
        <p className="text-sm text-gray-400 mb-3">Comparison</p>
        <h1 className="text-4xl font-bold mb-4">Recoder vs Replit</h1>
        <p className="text-gray-300 max-w-3xl">
          Replit is excellent for quickly building in-browser projects. Recoder is built for organizations running
          multi-agent workflows with control-plane rigor.
        </p>
      </header>

      <section className="grid gap-4 mb-10">
        {COMPARISON.map((item) => (
          <article key={item.area} className="rounded-xl border border-white/10 p-5 bg-white/5">
            <h2 className="text-lg font-semibold mb-2">{item.area}</h2>
            <p className="text-sm text-gray-400 mb-1">
              <strong className="text-gray-300">Replit:</strong> {item.replit}
            </p>
            <p className="text-sm text-gray-300">
              <strong>Recoder:</strong> {item.recoder}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-white/10 p-6 bg-white/5">
        <h2 className="text-2xl font-semibold mb-3">Decision shortcut</h2>
        <p className="text-gray-300 mb-5">
          Choose Replit for solo prototyping speed. Choose Recoder if you need delegated task reliability, approval
          gates, and auditable multi-agent execution.
        </p>
        <div className="flex gap-3">
          <a href="https://recoder.xyz/pricing" className="px-4 py-2 rounded-md bg-accent-500 text-black font-medium">
            View Pricing
          </a>
          <Link to="/platform/openclaw" className="px-4 py-2 rounded-md border border-white/20">
            Explore OpenClaw
          </Link>
        </div>
      </section>
    </main>
  );
}
