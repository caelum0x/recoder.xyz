'use client';

import React from 'react';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/session-provider';
import {
  ArrowRight, CheckCircle, Sparkles, TrendingUp,
  BarChart3, FolderOpen,
  MessageCircle, Terminal, Zap, Bot, Workflow,
  Database, ExternalLink, Activity, Clock, Settings, Layers3, BookOpenText, Shield
} from 'lucide-react';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';
import { ACTIVE_PRODUCTS } from '@/lib/active-products';
import { detectLocaleFromPathname, localizePath } from '@/lib/locale-paths';

const productIcons: Record<string, React.ElementType> = {
  spaces: Layers3,
  agents: Bot,
  pm: Database,
  agency: Workflow,
  cli: Terminal,
  docs: BookOpenText,
  providers: Shield,
};

interface AppActivity {
  app: string;
  stats: {
    totalItems: number;
    activeItems: number;
    lastActivityAt: string | null;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    timestamp: string;
    url: string;
  }>;
  error?: string;
}

interface SpacesSummary {
  plan: string;
  activation: {
    hasSpace: boolean;
    hasConnectedAgent: boolean;
    hasShippingLoop: boolean;
    nextStep: string;
  };
  usage: {
    spacesUsed: number;
    connectedAgentsUsed: number;
    previewOrDeployProjects: number;
  };
  entitlements: {
    workspaces: number;
    connectedAgents: number;
    artifactRetentionDays: number;
    previewDeploysPerMonth: number;
  };
}

const appDisplayNames: Record<string, string> = {
  agents: 'Agents',
  agency: 'Agency',
  pm: 'PM',
};

const appIcons: Record<string, React.ElementType> = {
  agents: Bot,
  agency: Workflow,
  pm: Database,
};

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [showWelcome, setShowWelcome] = useState(false);
  const [platformActivity, setPlatformActivity] = useState<AppActivity[]>([]);
  const [platformActivityLoading, setPlatformActivityLoading] = useState(true);
  const [spacesSummary, setSpacesSummary] = useState<SpacesSummary | null>(null);
  const locale = detectLocaleFromPathname(pathname || '');
  const appHref = (href: string) => localizePath(href, locale);

  const redirectToSignIn = () => {
    const currentPath = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/dashboard';
    router.push(`${appHref('/auth/signin')}?redirect=${encodeURIComponent(currentPath)}`);
  };

  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
      return;
    }
    if (searchParams.get('welcome') === 'true') {
      setShowWelcome(true);
      setTimeout(() => setShowWelcome(false), 5000);
    }
  }, [session, isPending, searchParams]);

  useEffect(() => {
    if (!isPending && session) {
      trackEvent(AnalyticsEvents.DASHBOARD_VIEWED, { source: 'dashboard', userId: session.user?.id });
    }
  }, [isPending, session]);

  // Fetch cross-app platform activity
  useEffect(() => {
    setPlatformActivityLoading(true);
    fetch('/api/dashboard/platform-activity')
      .then(r => r.json())
      .then((data: { success?: boolean; data?: AppActivity[] }) => {
        if (data.success && data.data) {
          setPlatformActivity(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setPlatformActivityLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/spaces')
      .then(r => r.json())
      .then((payload: { success?: boolean; data?: SpacesSummary }) => {
        if (payload.success && payload.data) {
          setSpacesSummary(payload.data);
        }
      })
      .catch(() => {});
  }, []);

  if (isPending) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Welcome Banner */}
      {showWelcome && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slideDown">
          <div className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full shadow-2xl flex items-center space-x-3">
            <CheckCircle className="w-6 h-6" />
            <span className="font-bold">Welcome to Recoder! Your account is ready.</span>
          </div>
        </div>
      )}

      <div className="px-8 py-12 max-w-6xl mx-auto">
        {/* User Info */}
        <div className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">{session?.user?.name || 'Developer'}</span>
            </h1>
            <p className="text-xl text-gray-400">{session?.user?.email}</p>
          </div>
          <div className="flex space-x-3">
             <Link
                href={appHref('/settings/ai-providers')}
                className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 hover:border-orange-500/50 rounded-lg text-sm transition-all"
              >
                <Sparkles className="w-4 h-4 text-orange-500" />
                <span>API Keys</span>
              </Link>
              <Link
                href={appHref('/settings')}
                className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-lg text-sm transition-all"
              >
                <Settings className="w-4 h-4 text-gray-400" />
                <span>Settings</span>
              </Link>
          </div>
        </div>

        <div className="mb-12 rounded-[2rem] border border-orange-500/20 bg-gradient-to-r from-orange-500/10 via-white/[0.03] to-purple-500/10 p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-black/30 px-4 py-2 text-sm text-orange-300 mb-5">
                <Layers3 className="h-4 w-4" />
                Primary signed-in path
              </div>
              <h2 className="text-3xl font-bold mb-4">Create your first Space and prove one shipping loop</h2>
              <p className="text-lg text-gray-300">
                The main path after signup should be: create a Space, connect an agent, then make task -&gt; artifact -&gt; PR -&gt; preview -&gt; approval visible before handoff.
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {[
                  {
                    title: 'Create a Space',
                    complete: spacesSummary?.activation.hasSpace === true,
                  },
                  {
                    title: 'Connect an agent',
                    complete: spacesSummary?.activation.hasConnectedAgent === true,
                  },
                  {
                    title: 'Ship the loop',
                    complete: spacesSummary?.activation.hasShippingLoop === true,
                  },
                ].map((step) => (
                  <div key={step.title} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className={`text-sm font-medium ${step.complete ? 'text-green-300' : 'text-white'}`}>{step.title}</div>
                    <div className="mt-2 text-xs text-gray-500">{step.complete ? 'Completed' : 'Next milestone'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:min-w-[320px] rounded-2xl border border-white/10 bg-black/30 p-6">
              <div className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-3">Current capacity</div>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex justify-between"><span>Plan</span><span className="capitalize">{spacesSummary?.plan || 'free'}</span></div>
                <div className="flex justify-between"><span>Spaces</span><span>{spacesSummary?.usage.spacesUsed ?? 0} / {spacesSummary?.entitlements.workspaces ?? 1}</span></div>
                <div className="flex justify-between"><span>Connected agents</span><span>{spacesSummary?.usage.connectedAgentsUsed ?? 0} / {spacesSummary?.entitlements.connectedAgents ?? 1}</span></div>
                <div className="flex justify-between"><span>Preview deploys</span><span>{spacesSummary?.entitlements.previewDeploysPerMonth ?? 3}/month</span></div>
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Link href={appHref('/dashboard/spaces')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-medium text-black hover:bg-orange-400">
                  Create your first Space
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={appHref('/agents')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 hover:bg-white/[0.04]">
                  Connect an agent
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* All Products */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-orange-500" />
            All Recoder Products
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ACTIVE_PRODUCTS.map((product) => {
              const Icon = productIcons[product.id] || Sparkles;
              const primaryHref = product.primaryAction.external ? product.primaryAction.href : appHref(product.primaryAction.href);
              const secondaryHref = product.secondaryAction
                ? (product.secondaryAction.external ? product.secondaryAction.href : appHref(product.secondaryAction.href))
                : null;

              return (
                <div key={product.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                        <Icon className="h-5 w-5 text-orange-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{product.name}</h3>
                        <p className="text-xs text-gray-500">{product.category}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-gray-300">
                      {product.status}
                    </span>
                  </div>
                  <p className="mb-2 text-sm font-medium text-orange-200">{product.eyebrow}</p>
                  <p className="text-sm leading-relaxed text-gray-400">{product.description}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {product.primaryAction.external ? (
                      <a
                        href={primaryHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-orange-400"
                      >
                        {product.primaryAction.label}
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <Link
                        href={primaryHref}
                        className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-orange-400"
                      >
                        {product.primaryAction.label}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                    {product.secondaryAction && secondaryHref ? (
                      product.secondaryAction.external ? (
                        <a
                          href={secondaryHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.04]"
                        >
                          {product.secondaryAction.label}
                        </a>
                      ) : (
                        <Link
                          href={secondaryHref}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.04]"
                        >
                          {product.secondaryAction.label}
                        </Link>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Links */}
        <div className="mb-12 grid md:grid-cols-3 gap-6">
            <Link href={appHref('/dashboard/projects')} className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all group flex items-center space-x-4">
              <FolderOpen className="w-10 h-10 text-purple-500" />
              <div>
                <h3 className="font-bold text-lg">My Projects</h3>
                <p className="text-sm text-gray-500">Manage your work</p>
              </div>
            </Link>

            <Link href={appHref('/dashboard/usage')} className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all group flex items-center space-x-4">
              <BarChart3 className="w-10 h-10 text-blue-500" />
              <div>
                <h3 className="font-bold text-lg">Usage</h3>
                <p className="text-sm text-gray-500">Limits & analytics</p>
              </div>
            </Link>

            <Link href={appHref('/docs')} className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all group flex items-center space-x-4">
              <TrendingUp className="w-10 h-10 text-green-500" />
              <div>
                <h3 className="font-bold text-lg">Docs</h3>
                <p className="text-sm text-gray-500">Guides & API</p>
              </div>
            </Link>
        </div>

        {/* Recent Activity Feed */}
        {(() => {
          const allActivities = platformActivity
            .flatMap((entry) =>
              (entry.recentActivity || []).map((item) => ({
                ...item,
                app: entry.app,
              })),
            )
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            )
            .slice(0, 5);

          if (allActivities.length === 0 || platformActivityLoading) return null;

          return (
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center space-x-3">
                  <Activity className="w-6 h-6 text-orange-500" />
                  <h2 className="text-2xl font-bold">Recent Activity</h2>
                </div>
                <Link href={appHref('/dashboard/analytics')} className="text-sm text-gray-500 hover:text-white transition-colors">
                  View all
                </Link>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <ul className="divide-y divide-white/5">
                  {allActivities.map((item) => {
                    const Icon = appIcons[item.app] || Sparkles;
                    return (
                      <li key={`${item.app}-${item.id}`}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center px-5 py-4 hover:bg-white/5 transition-colors group"
                        >
                          <div className="w-8 h-8 bg-gradient-to-br from-orange-500/20 to-purple-600/20 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
                            <Icon className="w-4 h-4 text-gray-400 group-hover:text-orange-400 transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <p className="text-xs text-gray-500">
                              {appDisplayNames[item.app] || item.app} &middot; {item.type}
                            </p>
                          </div>
                          <div className="flex items-center space-x-4 ml-3 flex-shrink-0">
                            <div className="flex items-center text-xs text-gray-600">
                              <Clock className="w-3 h-3 mr-1" />
                              {new Date(item.timestamp).toLocaleDateString()}
                            </div>
                            <ExternalLink className="w-4 h-4 text-gray-700 group-hover:text-orange-400 transition-colors" />
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })()}

        {/* Beta User Banner */}
        <div className="p-8 rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-blue-600/10 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                <Sparkles className="w-8 h-8 text-green-400" />
                <h3 className="text-2xl font-bold">🎉 You're a Beta User!</h3>
              </div>
              <p className="text-gray-300 mb-6">Thank you for being part of our free beta! Everything is 100% free during beta - just bring your own API key.</p>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">40+ AI Models</div>
                    <div className="text-sm text-gray-400">Access to GPT, Claude, Gemini, and more</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">You Control Costs</div>
                    <div className="text-sm text-gray-400">Pay only for what you use with your API key</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">No Subscriptions</div>
                    <div className="text-sm text-gray-400">No monthly fees, no hidden charges</div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Web ↔ CLI Sync</div>
                    <div className="text-sm text-gray-400">Seamless sync between platforms</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={appHref('/settings/ai-providers')}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition-all"
                >
                  <span>Manage API Keys</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="https://github.com/recoder-xyz/feedback"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Give Feedback</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        .animate-slideDown {
          animation: slideDown 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
