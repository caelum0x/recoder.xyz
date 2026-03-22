'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/session-provider';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';
import {
  Globe,
  ArrowRight, CheckCircle, Sparkles, TrendingUp,
  BarChart3, FolderOpen,
  MessageCircle, Terminal, Zap, Code2, Bot, Workflow,
  Database, Server, ExternalLink, Activity, AlertCircle, Clock
} from 'lucide-react';
import { RECODER_SERVICES, getServiceUrlClient } from '@/lib/config/platforms';

const serviceIcons: Record<string, React.ElementType> = {
  app: Globe,
  agents: Bot,
  web: Code2,
  api: Server,
  pm: Database,
  studio: Sparkles,
  agency: Workflow,
  openclaw: Terminal,
};

interface ServiceHealthEntry {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'down';
  responseTime: number | null;
  lastChecked: string;
}

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

const appDisplayNames: Record<string, string> = {
  agents: 'Agents',
  agency: 'Agency',
  pm: 'PM',
  web: 'Web IDE',
};

const appIcons: Record<string, React.ElementType> = {
  agents: Bot,
  agency: Workflow,
  pm: Database,
  web: Code2,
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [showWelcome, setShowWelcome] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<Record<string, ServiceHealthEntry>>({});
  const [platformActivity, setPlatformActivity] = useState<AppActivity[]>([]);
  const [platformActivityLoading, setPlatformActivityLoading] = useState(true);
  const redirectToSignIn = () => {
    const currentPath = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/dashboard';
    router.push(`/auth/signin?redirect=${encodeURIComponent(currentPath)}`);
  };

  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
      return;
    }
    if (session && !isPending) {
      // Check if user has completed onboarding
      fetch('/api/onboarding/save')
        .then(r => r.json())
        .then((data: { onboardingCompleted?: boolean }) => {
          if (!data.onboardingCompleted) {
            router.push('/onboarding/welcome');
          }
        })
        .catch(() => {});
    }
    if (searchParams.get('welcome') === 'true') {
      setShowWelcome(true);
      setTimeout(() => setShowWelcome(false), 5000);
    }
  }, [session, isPending, searchParams]);

  // Fetch ecosystem health for status dots
  useEffect(() => {
    fetch('/api/ecosystem-health')
      .then(r => r.json())
      .then((data: { services?: ServiceHealthEntry[] }) => {
        if (data.services) {
          const map: Record<string, ServiceHealthEntry> = {};
          for (const s of data.services) {
            map[s.id] = s;
          }
          setServiceHealth(map);
        }
      })
      .catch(() => {});
  }, []);

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

      <div className="px-8 py-12">
        {/* User Info */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">{session?.user?.name || 'Developer'}</span>
          </h1>
          <p className="text-xl text-gray-400">{session?.user?.email}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-1 gap-6 mb-12 max-w-md">
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-400">Beta Status</h3>
              <Sparkles className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold mb-2">
              <span className="flex items-center space-x-2">
                <span>Beta User</span>
                <span className="text-2xl">🎉</span>
              </span>
            </div>
            <div className="text-sm text-green-400">100% Free Forever</div>
          </div>
        </div>

        {/* Platforms */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Your Platforms</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl">
            {/* CLI */}
            <a
              href="https://www.npmjs.com/package/recoder-code"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Terminal className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">recoder-code CLI</h3>
              <p className="text-sm text-gray-400 mb-4">Terminal-based development</p>
              <div className="flex items-center text-sm text-orange-500 group-hover:text-orange-400">
                <span>Launch</span>
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </a>

            {/* Web IDE - with API key check */}
            <div className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all cursor-pointer">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">Web IDE</h3>
              <p className="text-sm text-gray-400 mb-4">Browser-based code editor</p>
              <LaunchWebIDEButton
                className="flex items-center text-sm text-orange-500 hover:text-orange-400 bg-transparent p-0 transition-colors"
                showIcon={false}
              >
                <span>Launch</span>
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </LaunchWebIDEButton>
            </div>
          </div>
        </div>

        {/* Ecosystem Services */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Ecosystem Services</h2>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
            {RECODER_SERVICES.filter(s => s.showInSwitcher).map(service => {
              const Icon = serviceIcons[service.id] || Globe;
              const health = serviceHealth[service.id];
              const statusColor = health
                ? health.status === 'operational' ? 'bg-green-500'
                  : health.status === 'degraded' ? 'bg-yellow-500'
                  : 'bg-red-500'
                : 'bg-gray-500';
              return (
                <a
                  key={service.id}
                  href={getServiceUrlClient(service.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-5 rounded-2xl border border-white/10 bg-white/5 hover:border-orange-500/40 hover:bg-white/10 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500/20 to-purple-600/20 rounded-xl flex items-center justify-center group-hover:from-orange-500/30 group-hover:to-purple-600/30 transition-colors">
                      <Icon className="w-5 h-5 text-gray-300 group-hover:text-orange-400 transition-colors" />
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                      <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-orange-400 transition-colors" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{service.label}</h3>
                  <p className="text-xs text-gray-500">{service.description}</p>
                </a>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Quick Actions</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <Link href="/dashboard/projects" className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all group">
              <FolderOpen className="w-8 h-8 text-purple-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-2">My Projects</h3>
              <p className="text-sm text-gray-400">View and manage your projects</p>
            </Link>

            <Link href="/settings/ai-providers" className="p-6 rounded-2xl border border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all group">
              <Sparkles className="w-8 h-8 text-orange-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-2">AI Provider Keys</h3>
              <p className="text-sm text-gray-400">Add your OpenRouter or Anthropic key to use AI</p>
            </Link>

            <Link href="/dashboard/usage" className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all group">
              <BarChart3 className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-2">Usage Analytics</h3>
              <p className="text-sm text-gray-400">View detailed usage statistics</p>
            </Link>

            <Link href="/docs" className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all group">
              <TrendingUp className="w-8 h-8 text-green-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-2">Documentation</h3>
              <p className="text-sm text-gray-400">Learn how to use Recoder</p>
            </Link>
          </div>
        </div>

        {/* Platform Activity */}
        <div className="mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <Activity className="w-6 h-6 text-orange-500" />
            <h2 className="text-2xl font-bold">Platform Activity</h2>
          </div>

          {platformActivityLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* App stat cards */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {platformActivity.map((entry) => {
                  const Icon = appIcons[entry.app] || Globe;
                  const displayName = appDisplayNames[entry.app] || entry.app;
                  const hasError = !!entry.error;

                  return (
                    <div
                      key={entry.app}
                      className={`p-5 rounded-2xl border ${
                        hasError
                          ? 'border-zinc-700 bg-zinc-900/50'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-orange-500/20 to-purple-600/20 rounded-lg flex items-center justify-center">
                            <Icon className="w-4 h-4 text-gray-300" />
                          </div>
                          <span className="font-semibold text-sm">{displayName}</span>
                        </div>
                        {hasError && (
                          <AlertCircle className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>

                      {hasError ? (
                        <p className="text-xs text-zinc-500">Unavailable</p>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-baseline justify-between">
                            <span className="text-2xl font-bold">{entry.stats.totalItems}</span>
                            <span className="text-xs text-gray-500">total</span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm text-orange-400">{entry.stats.activeItems} active</span>
                            {entry.stats.lastActivityAt && (
                              <span className="text-xs text-gray-600">
                                {new Date(entry.stats.lastActivityAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Unified activity feed */}
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
                  .slice(0, 10);

                if (allActivities.length === 0) return null;

                return (
                  <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/10">
                      <h3 className="text-sm font-semibold text-gray-400">Recent Activity</h3>
                    </div>
                    <ul className="divide-y divide-white/5">
                      {allActivities.map((item) => {
                        const Icon = appIcons[item.app] || Globe;
                        return (
                          <li key={`${item.app}-${item.id}`}>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center px-5 py-3 hover:bg-white/5 transition-colors group"
                            >
                              <div className="w-7 h-7 bg-gradient-to-br from-orange-500/20 to-purple-600/20 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
                                <Icon className="w-3.5 h-3.5 text-gray-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{item.title}</p>
                                <p className="text-xs text-gray-500">
                                  {appDisplayNames[item.app] || item.app} &middot; {item.type}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
                                <Clock className="w-3 h-3 text-gray-600" />
                                <span className="text-xs text-gray-600">
                                  {new Date(item.timestamp).toLocaleDateString()}
                                </span>
                                <ExternalLink className="w-3 h-3 text-gray-700 group-hover:text-orange-400 transition-colors" />
                              </div>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </>
          )}
        </div>

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
                  href="/settings/ai-providers"
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
