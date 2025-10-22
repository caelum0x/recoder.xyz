'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { 
  Terminal, Globe, MessageSquare, Code2, Settings, LogOut,
  ArrowRight, CheckCircle, Zap, Sparkles, TrendingUp, Crown,
  Clock, Activity, BarChart3
} from 'lucide-react';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [showWelcome, setShowWelcome] = useState(false);
  const [quota, setQuota] = useState<any>(null);

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

  useEffect(() => {
    if (session) {
      fetch('/api/cli/quota').then(r => r.json()).then(setQuota).catch(console.error);
    }
  }, [session]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const plan = session?.user?.subscriptionPlan || 'free';
  const sessionsUsed = quota?.sessionsUsedToday || 0;
  const sessionsTotal = quota?.sessionsPerDay || 6;
  const sessionsPercent = (sessionsUsed / sessionsTotal) * 100;

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

      {/* Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/dashboard/usage" className="text-gray-400 hover:text-white transition-colors">
              <Activity className="w-5 h-5" />
            </Link>
            <Link href="/settings" className="text-gray-400 hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </Link>
            <button onClick={handleSignOut} className="text-gray-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12">
        {/* User Info */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">{session?.user?.name || 'Developer'}</span>
          </h1>
          <p className="text-xl text-gray-400">{session?.user?.email}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-400">Current Plan</h3>
              <Crown className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-3xl font-bold capitalize mb-2">{plan}</div>
            {plan === 'free' && (
              <Link href="/pricing" className="text-sm text-orange-500 hover:text-orange-400 flex items-center space-x-1">
                <span>Upgrade to Pro</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-400">Daily Sessions</h3>
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold mb-2">{sessionsUsed} / {sessionsTotal}</div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(sessionsPercent, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-400">Tokens/Session</h3>
              <Zap className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold mb-2">{quota?.tokensPerSession || '10k'}</div>
            <div className="text-sm text-gray-400">Premium models only</div>
          </div>
        </div>

        {/* Platforms */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Your Platforms</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                name: 'CLI',
                desc: 'Terminal-based development',
                icon: Terminal,
                href: '/cli',
                color: 'from-orange-500 to-red-600'
              },
              {
                name: 'Web Platform',
                desc: 'Browser-based IDE',
                icon: Globe,
                href: '/platform/web',
                color: 'from-blue-500 to-cyan-600'
              },
              {
                name: 'AI Chat',
                desc: 'Conversational interface',
                icon: MessageSquare,
                href: 'https://chat.recoder.xyz',
                color: 'from-purple-500 to-pink-600',
                external: true
              },
              {
                name: 'VS Code',
                desc: 'IDE extension',
                icon: Code2,
                href: '/docs/extension',
                color: 'from-green-500 to-emerald-600'
              }
            ].map((platform) => (
              <Link
                key={platform.name}
                href={platform.href}
                target={platform.external ? '_blank' : undefined}
                className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all"
              >
                <div className={`w-12 h-12 bg-gradient-to-br ${platform.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <platform.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">{platform.name}</h3>
                <p className="text-sm text-gray-400 mb-4">{platform.desc}</p>
                <div className="flex items-center text-sm text-orange-500 group-hover:text-orange-400">
                  <span>Launch</span>
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Quick Actions</h2>
          <div className="grid md:grid-cols-3 gap-6">
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

        {/* Upgrade CTA for Free Users */}
        {plan === 'free' && (
          <div className="p-8 rounded-2xl border-2 border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10 backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-2">Unlock Premium Features</h3>
                <p className="text-gray-400 mb-6">Get unlimited access to all AI models, priority support, and team collaboration.</p>
                <ul className="space-y-2 mb-6">
                  {['15 sessions per day', '50k tokens/session', 'All AI models included', 'Priority support'].map((feature, i) => (
                    <li key={i} className="flex items-center space-x-2 text-gray-300">
                      <CheckCircle className="w-5 h-5 text-orange-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link 
                  href="/pricing"
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
                >
                  <span>Upgrade to Pro</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <Crown className="w-16 h-16 text-orange-500" />
            </div>
          </div>
        )}
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
