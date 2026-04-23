import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ArrowRight, Bot, Briefcase, Code2, LayoutDashboard, Terminal } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Customer Workflows | Recoder.xyz',
  description: 'See practical Recoder workflows for startups, product teams, and agencies using BYOK-first AI development across browser and terminal surfaces.',
  openGraph: {
    title: 'Customer Workflows | Recoder.xyz',
    description: 'Practical Recoder workflows for startups, product teams, and agencies.',
    url: 'https://recoder.xyz/customers',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder customer workflows' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Customer Workflows | Recoder.xyz',
    description: 'Practical Recoder workflows for startups, product teams, and agencies.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/customers',
  },
};

const stories = [
  {
    title: 'Startup founder shipping landing pages and demos',
    summary: 'A founder signs in, connects OpenRouter, prototypes in the browser, then hands follow-up tasks to Agents as the scope grows.',
    stack: ['Sign in', 'BYOK', 'Web IDE', 'Agents'],
  },
  {
    title: 'Product team connecting roadmap work to implementation',
    summary: 'The team uses PM to capture scope, moves implementation into Agents and browser projects, then tracks follow-up work without switching systems.',
    stack: ['PM', 'Agents', 'Projects', 'Docs'],
  },
  {
    title: 'Agency using one system for scoping and delivery',
    summary: 'Agency teams use Recoder to move from client workflow design to implementation, keeping project context and provider choice consistent.',
    stack: ['Agency', 'Agents', 'CLI', 'Projects'],
  },
];

const surfaces = [
  { icon: Bot, label: 'Agents', text: 'Multi-turn work, tool execution, and preview-oriented outputs.' },
  { icon: Code2, label: 'Browser Projects', text: 'Fast iteration and visual feedback without local setup friction.' },
  { icon: Terminal, label: 'CLI', text: 'Keep terminal-first flow when the work moves into local development.' },
  { icon: LayoutDashboard, label: 'PM', text: 'Bridge product planning, feedback, and implementation context.' },
  { icon: Briefcase, label: 'Agency', text: 'Carry the same system into delivery, client, and workflow work.' },
];

export default function CustomersPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="px-6 pt-24 pb-20">
        <div className="container mx-auto max-w-6xl">
          <section className="text-center mb-16">
            <p className="mb-4 inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-sm text-orange-400">
              Customer workflows
            </p>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Examples of how teams use
              <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent"> Recoder in practice</span>
            </h1>
            <p className="mx-auto max-w-3xl text-xl text-gray-400">
              Concrete workflow patterns for teams using BYOK-first AI development across browser and terminal surfaces.
            </p>
          </section>

          <section className="grid gap-6 lg:grid-cols-3 mb-16">
            {stories.map((story) => (
              <div key={story.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-2xl font-bold mb-3">{story.title}</h2>
                <p className="text-gray-400 mb-5">{story.summary}</p>
                <div className="flex flex-wrap gap-2">
                  {story.stack.map((item) => (
                    <span key={item} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-gray-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-8 mb-16">
            <h2 className="text-3xl font-bold mb-8">One system, different starting points</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {surfaces.map((surface) => (
                <div key={surface.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <surface.icon className="w-6 h-6 text-orange-400 mb-3" />
                  <h3 className="font-semibold mb-2">{surface.label}</h3>
                  <p className="text-sm text-gray-400">{surface.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <Link href="/docs/getting-started" className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-colors group">
              <h2 className="text-2xl font-bold mb-2">Follow the activation path</h2>
              <p className="text-gray-400 mb-4">Use the getting-started guide to move from signup to provider setup to first project.</p>
              <span className="inline-flex items-center gap-2 text-orange-400 group-hover:gap-3 transition-all">Open guide <ArrowRight className="w-4 h-4" /></span>
            </Link>
            <Link href="/learn" className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-colors group">
              <h2 className="text-2xl font-bold mb-2">Explore tutorials and docs</h2>
              <p className="text-gray-400 mb-4">Go deeper into Recoder with product tutorials, docs, and learning paths.</p>
              <span className="inline-flex items-center gap-2 text-orange-400 group-hover:gap-3 transition-all">Explore learn hub <ArrowRight className="w-4 h-4" /></span>
            </Link>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
