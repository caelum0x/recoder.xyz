'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/session-provider';
import { getRecoderWebUrlClient, getRecoderChatUrl } from '@/lib/config/platforms';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';
import {
  Terminal, Globe, MessageSquare, Code2, Settings, LogOut,
  ArrowRight, CheckCircle, Zap, Sparkles, TrendingUp, Crown,
  Clock, Activity, BarChart3, FolderOpen, X, Key, AlertCircle,
  MessageCircle, User, ChevronDown
} from 'lucide-react';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [showWelcome, setShowWelcome] = useState(false);
  const [quota, setQuota] = useState<any>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Sessions usage data from API
  const sessionsUsed = quota?.sessionsUsedToday || 0;
  const sessionsTotal = quota?.sessionsPerDay || 5;
  const sessionsPercent = sessionsTotal > 0 ? (sessionsUsed / sessionsTotal) * 100 : 0;

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

  // Check if user has API keys
  useEffect(() => {
    if (session) {
      fetch('/api/user/ai-provider-keys')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setHasApiKey(data.keys && data.keys.length > 0);
          }
        })
        .catch(() => setHasApiKey(false));
    }
  }, [session]);

  // Fetch quota/usage data
  useEffect(() => {
    if (session) {
      fetch('/api/user/quota')
        .then(r => r.json())
        .then(data => {
          if (data.success && data.quota) {
            setQuota(data.quota);
          }
        })
        .catch(err => console.error('Failed to fetch quota:', err));
    }
  }, [session]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleWebIDEClick = (e: React.MouseEvent) => {
    if (hasApiKey === false) {
      e.preventDefault();
      setShowApiKeyModal(true);
    }
    // If hasApiKey is true, let the Link work normally
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const plan = (session?.user as any)?.subscriptionPlan || 'free';

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

      {/* API Key Required Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-500/30 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <Key className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">API Key Required</h2>
                    <p className="text-sm text-gray-400">One quick step before you start coding</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Beta Explanation */}
              <div className="p-4 bg-gradient-to-r from-orange-500/10 to-purple-600/10 border border-orange-500/20 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Sparkles className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-bold text-white mb-2">Welcome to Recoder.xyz FREE BETA! 🎉</h3>
                    <p className="text-sm text-gray-300 mb-3">
                      We're launching completely free to build the best AI coding platform.
                      Instead of charging you for AI features, we use a <strong>Bring Your Own Key (BYOK)</strong> model.
                    </p>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>You control costs:</strong> Pay AI providers directly (typically $0.02-0.10 per request)</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>You choose models:</strong> Access 40+ models from OpenRouter, Anthropic, OpenAI, Groq</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>We're 100% free:</strong> No subscriptions, no hidden fees, just bring your API key</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Why BYOK */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-bold text-white mb-2">Why we can't afford to provide API credits</h3>
                    <p className="text-sm text-gray-300">
                      As a beta startup with zero capital, we can't subsidize AI API costs.
                      But this works in your favor - you get <strong>full transparency</strong>,
                      <strong>unlimited usage</strong>, and <strong>premium features</strong> without any platform markup.
                    </p>
                  </div>
                </div>
              </div>

              {/* Getting Started */}
              <div>
                <h3 className="font-bold text-white mb-3">Getting Started (2 minutes):</h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                    <div className="text-sm text-gray-300">
                      <strong className="text-white">Get an API key</strong> from OpenRouter (recommended), Anthropic, OpenAI, or Groq
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                    <div className="text-sm text-gray-300">
                      <strong className="text-white">Add it to Recoder</strong> - we encrypt it securely (AES-256-GCM)
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                    <div className="text-sm text-gray-300">
                      <strong className="text-white">Start coding!</strong> Access Web IDE + CLI with full features
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-600/10 border border-blue-500/20 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Zap className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <strong className="text-white">Our Recommendation:</strong>
                    <p className="text-gray-300 mt-1">
                      Start with <strong className="text-blue-400">OpenRouter</strong> - one key gives you access to 40+ models
                      (GPT-4, Claude 3.5 Sonnet, Gemini, Llama) with pay-as-you-go pricing. $5 = ~500 requests.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-white/10 bg-white/5">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  I'll do this later
                </button>
                <Link
                  href="/settings/ai-providers?redirect=web-ide"
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2 shadow-lg"
                >
                  <Key className="w-5 h-5" />
                  <span>Add API Key Now</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
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
            {/* Quick Access - Settings */}
            <Link
              href="/settings"
              className="text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />

                  {/* Menu */}
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                    {/* User Info */}
                    <div className="p-4 border-b border-white/10">
                      <div className="font-medium text-white truncate">{session?.user?.name || 'User'}</div>
                      <div className="text-sm text-gray-400 truncate">{session?.user?.email}</div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <Link
                        href="/settings/account"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <User className="w-4 h-4 text-gray-400 group-hover:text-orange-500" />
                        <span className="text-sm text-gray-300 group-hover:text-white">Account</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <Settings className="w-4 h-4 text-gray-400 group-hover:text-orange-500" />
                        <span className="text-sm text-gray-300 group-hover:text-white">Settings</span>
                      </Link>
                      <Link
                        href="/settings/ai-providers"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <Key className="w-4 h-4 text-gray-400 group-hover:text-orange-500" />
                        <span className="text-sm text-gray-300 group-hover:text-white">AI Providers</span>
                      </Link>
                    </div>

                    {/* Sign Out */}
                    <div className="p-2 border-t border-white/10">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          handleSignOut();
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors group"
                      >
                        <LogOut className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
                        <span className="text-sm text-gray-300 group-hover:text-red-500">Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
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
            <div className="text-3xl font-bold mb-2">
              {quota?.tokensPerSession ? `${(quota.tokensPerSession / 1000).toFixed(0)}k` : '10k'}
            </div>
            <div className="text-sm text-gray-400">Premium models only</div>
          </div>
        </div>

        {/* Platforms */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Your Platforms</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CLI */}
            <Link
              href="/cli"
              className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Terminal className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">CLI</h3>
              <p className="text-sm text-gray-400 mb-4">Terminal-based development</p>
              <div className="flex items-center text-sm text-orange-500 group-hover:text-orange-400">
                <span>Launch</span>
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

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
              {hasApiKey === false && (
                <div className="mt-3 flex items-center space-x-1 text-xs text-yellow-500">
                  <AlertCircle className="w-3 h-3" />
                  <span>API key required</span>
                </div>
              )}
            </div>

            {/* AI Chat */}
            <div className="group p-6 rounded-2xl border border-white/10 bg-white/5 opacity-60 cursor-not-allowed relative">
              <div className="absolute top-3 right-3 px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full text-xs text-purple-400 font-medium">
                Coming Soon
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">Recoder Chat</h3>
              <p className="text-sm text-gray-400 mb-4">Conversational interface</p>
              <div className="flex items-center text-sm text-gray-500">
                <span>Coming Soon</span>
              </div>
            </div>

            {/* VS Code */}
            <div className="group p-6 rounded-2xl border border-white/10 bg-white/5 opacity-60 cursor-not-allowed relative">
              <div className="absolute top-3 right-3 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-xs text-green-400 font-medium">
                Coming Soon
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <Code2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">VS Code Extension</h3>
              <p className="text-sm text-gray-400 mb-4">IDE extension</p>
              <div className="flex items-center text-sm text-gray-500">
                <span>Coming Soon</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Quick Actions</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <Link href="/projects" className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all group">
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
