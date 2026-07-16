import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  ArrowRight,
  Key,
  Cpu,
  Layers,
  Server,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Sparkles,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Support = 'yes' | 'no' | 'partial';

interface ComparisonRow {
  feature: string;
  recoder: string;
  cursor: string;
  replit: string;
  copilot: string;
  windsurf: string;
  recoderSupport: Support;
  cursorSupport: Support;
  replitSupport: Support;
  copilotSupport: Support;
  windsurfSupport: Support;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const comparisonData: ComparisonRow[] = [
  {
    feature: 'Free tier available',
    recoder: 'Yes, unlimited with BYOK',
    cursor: 'Limited (2-week trial)',
    replit: 'Limited',
    copilot: 'Free tier (limited)',
    windsurf: 'Limited trial',
    recoderSupport: 'yes',
    cursorSupport: 'partial',
    replitSupport: 'partial',
    copilotSupport: 'partial',
    windsurfSupport: 'partial',
  },
  {
    feature: 'Number of AI models',
    recoder: '40+ via OpenRouter',
    cursor: '~5 (GPT-4, Claude, etc.)',
    replit: '~3 (limited selection)',
    copilot: 'GPT-4 / Claude',
    windsurf: '~5',
    recoderSupport: 'yes',
    cursorSupport: 'partial',
    replitSupport: 'partial',
    copilotSupport: 'partial',
    windsurfSupport: 'partial',
  },
  {
    feature: 'BYOK (Bring Your Own Key)',
    recoder: 'Yes, full support',
    cursor: 'No',
    replit: 'No',
    copilot: 'No',
    windsurf: 'No',
    recoderSupport: 'yes',
    cursorSupport: 'no',
    replitSupport: 'no',
    copilotSupport: 'no',
    windsurfSupport: 'no',
  },
  {
    feature: 'Web IDE',
    recoder: 'Yes',
    cursor: 'No (desktop only)',
    replit: 'Yes',
    copilot: 'Via VS Code Web',
    windsurf: 'No (desktop only)',
    recoderSupport: 'yes',
    cursorSupport: 'no',
    replitSupport: 'yes',
    copilotSupport: 'partial',
    windsurfSupport: 'no',
  },
  {
    feature: 'CLI tool',
    recoder: 'Yes',
    cursor: 'No',
    replit: 'Limited',
    copilot: 'Yes (Copilot CLI)',
    windsurf: 'No',
    recoderSupport: 'yes',
    cursorSupport: 'no',
    replitSupport: 'partial',
    copilotSupport: 'yes',
    windsurfSupport: 'no',
  },
  {
    feature: 'Multi-agent workflows',
    recoder: 'Yes, via Agency',
    cursor: 'No',
    replit: 'Limited',
    copilot: 'No',
    windsurf: 'Limited (Flows)',
    recoderSupport: 'yes',
    cursorSupport: 'no',
    replitSupport: 'partial',
    copilotSupport: 'no',
    windsurfSupport: 'partial',
  },
  {
    feature: 'Self-hostable',
    recoder: 'Yes',
    cursor: 'No',
    replit: 'No',
    copilot: 'No',
    windsurf: 'No',
    recoderSupport: 'yes',
    cursorSupport: 'no',
    replitSupport: 'no',
    copilotSupport: 'no',
    windsurfSupport: 'no',
  },
  {
    feature: 'Open source components',
    recoder: 'Partial',
    cursor: 'No',
    replit: 'Partial',
    copilot: 'No',
    windsurf: 'No',
    recoderSupport: 'partial',
    cursorSupport: 'no',
    replitSupport: 'partial',
    copilotSupport: 'no',
    windsurfSupport: 'no',
  },
  {
    feature: 'Project management',
    recoder: 'Yes, built-in PM',
    cursor: 'No',
    replit: 'No',
    copilot: 'No',
    windsurf: 'No',
    recoderSupport: 'yes',
    cursorSupport: 'no',
    replitSupport: 'no',
    copilotSupport: 'no',
    windsurfSupport: 'no',
  },
  {
    feature: 'Price starting from',
    recoder: '$0 (BYOK) / $20/mo',
    cursor: '$20/mo',
    replit: '$25/mo',
    copilot: '$10/mo',
    windsurf: '$15/mo',
    recoderSupport: 'yes',
    cursorSupport: 'partial',
    replitSupport: 'partial',
    copilotSupport: 'partial',
    windsurfSupport: 'partial',
  },
];

interface Differentiator {
  icon: typeof Key;
  title: string;
  description: string;
  gradient: string;
}

const differentiators: Differentiator[] = [
  {
    icon: Key,
    title: 'BYOK Freedom',
    description:
      'Bring your own OpenRouter, OpenAI, or Anthropic API key and use Recoder completely free. No middleman markup on API costs. You pay the provider directly at their published rates, giving you full cost transparency and control.',
    gradient: 'from-orange-500 to-amber-600',
  },
  {
    icon: Cpu,
    title: 'True Multi-Model Access',
    description:
      'Access 40+ AI models through a single interface, including GPT-4, Claude, Gemini, Llama, Mistral, and more. Switch models per task to get the best results. No vendor lock-in to a single AI provider.',
    gradient: 'from-purple-500 to-pink-600',
  },
  {
    icon: Layers,
    title: 'All-in-One Platform',
    description:
      'Web IDE, CLI tool, multi-agent workflows via Agency, built-in project management with PM, and cloud deployment. Replace multiple subscriptions with a single platform that covers the entire development lifecycle.',
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    icon: Server,
    title: 'Self-Hostable & Open',
    description:
      'Deploy Recoder on your own infrastructure for complete data sovereignty. Ideal for enterprises and teams with strict compliance requirements. Select components are open source, so you can inspect and extend the platform.',
    gradient: 'from-green-500 to-emerald-600',
  },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SupportIndicator({ status }: { status: Support }) {
  switch (status) {
    case 'yes':
      return <CheckCircle2 className="w-5 h-5 text-green-400 inline-block" />;
    case 'no':
      return <XCircle className="w-5 h-5 text-red-400 inline-block" />;
    case 'partial':
      return <MinusCircle className="w-5 h-5 text-yellow-400 inline-block" />;
  }
}

function ComparisonTable() {
  const platforms = ['recoder', 'cursor', 'replit', 'copilot', 'windsurf'] as const;
  const platformLabels: Record<(typeof platforms)[number], string> = {
    recoder: 'Recoder',
    cursor: 'Cursor',
    replit: 'Replit',
    copilot: 'GitHub Copilot',
    windsurf: 'Windsurf',
  };

  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <table className="w-full min-w-[800px] border-collapse">
        <thead>
          <tr>
            <th className="text-left py-4 px-4 text-sm font-medium text-gray-400 border-b border-white/10 w-[200px]">
              Feature
            </th>
            {platforms.map((p) => (
              <th
                key={p}
                className={`py-4 px-4 text-sm font-semibold border-b text-center ${
                  p === 'recoder'
                    ? 'text-orange-400 border-orange-500/30 bg-orange-500/5'
                    : 'text-gray-300 border-white/10'
                }`}
              >
                {platformLabels[p]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisonData.map((row, idx) => (
            <tr
              key={idx}
              className="group hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-4 px-4 text-sm font-medium text-gray-300 border-b border-white/5">
                {row.feature}
              </td>
              {platforms.map((p) => {
                const supportKey = `${p}Support` as keyof ComparisonRow;
                const valueKey = p as keyof ComparisonRow;
                return (
                  <td
                    key={p}
                    className={`py-4 px-4 text-sm text-center border-b ${
                      p === 'recoder'
                        ? 'bg-orange-500/5 border-orange-500/10 text-white font-medium'
                        : 'border-white/5 text-gray-400'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <SupportIndicator
                        status={row[supportKey] as Support}
                      />
                      <span className="text-xs leading-tight">
                        {row[valueKey] as string}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DifferentiatorCard({ item }: { item: Differentiator }) {
  const Icon = item.icon;
  return (
    <div className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all group">
      <div
        className={`w-12 h-12 bg-gradient-to-br ${item.gradient} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="font-bold text-lg mb-2">{item.title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">
        {item.description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AlternativesPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-orange-500">Platform Comparison</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Why developers choose{' '}
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              Recoder
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            The open, multi-model AI development platform. Access 40+ models,
            bring your own API keys, and build with a CLI, Web IDE, and
            multi-agent workflows &mdash; all in one place.
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            Feature-by-feature comparison
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 sm:p-6">
            <ComparisonTable />
          </div>
          <p className="text-xs text-gray-500 text-center mt-4">
            Information based on publicly available data as of February 2025.
            Features and pricing may have changed since then.
          </p>
        </div>
      </section>

      {/* Key Differentiators */}
      <section className="pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            What sets Recoder apart
          </h2>
          <p className="text-gray-400 text-center mb-10 max-w-2xl mx-auto">
            Beyond the checklist &mdash; here is why these differences matter
            for your day-to-day development workflow.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {differentiators.map((item, i) => (
              <DifferentiatorCard key={i} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10 sm:p-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Start building for free
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Bring your own API key and get started in under a minute. No
              credit card required. Upgrade only when you need
              platform-provided keys.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center space-x-2 px-8 py-4 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all hover:bg-white/5"
              >
                <span>View Pricing</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
