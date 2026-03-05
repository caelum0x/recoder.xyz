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
  Database, Server, ExternalLink
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

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [showWelcome, setShowWelcome] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<Record<string, ServiceHealthEntry>>({});

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth/signin');
      return;
    }
    if (searchParams.get('welcome') === 'true') {
      setShowWelcome(true);
      setTimeout(() => setShowWelcome(false), 5000);
    }
  }, [session, isPending, router, searchParams]);

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

            <Link href="/dashboard/api-keys" className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all group">
              <Sparkles className="w-8 h-8 text-orange-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-2">API Keys</h3>
              <p className="text-sm text-gray-400">Manage your API keys and tokens</p>
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
