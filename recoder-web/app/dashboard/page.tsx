"use client";

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import { getUserChats, getUserStats } from "@/app/(main)/actions";
import Link from "next/link";
import Image from "next/image";
import {
  User, History, Settings, Zap, TrendingUp, Calendar,
  MessageSquare, Code, Database, Rocket, ChevronRight,
  Activity, Clock, Sparkles, Target, Terminal, Globe,
  CreditCard, BarChart3, ExternalLink, CheckCircle,
  AlertCircle, Shield
} from "lucide-react";

interface UserStats {
  generationsToday: number;
  generationsTotal: number;
  tokensUsed: number;
  favoriteModel: string;
  averageQuality: string;
  deploymentsCount: number;
  chatsCount: number;
}

interface SubscriptionData {
  subscriptionId: string;
  productId: string;
  status: string;
  amount: number;
  currency: string;
  nextBillingDate: string;
  previousBillingDate: string;
  createdAt: string;
  cancelAtNextBilling: boolean;
  trialPeriodDays: number;
  customer: any;
}

interface UsageStats {
  cliRequests: { used: number; limit: number };
  webProjects: { used: number; limit: number };
  chatMessages: { used: number; limit: number };
  extensionSuggestions: { used: number; limit: number };
  storage: { used: string; limit: string };
}

export default function Dashboard() {
  const { user, session, loading } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    generationsToday: 0,
    generationsTotal: 0,
    tokensUsed: 0,
    favoriteModel: "claude-3-5-sonnet-20241022",
    averageQuality: "high",
    deploymentsCount: 0,
    chatsCount: 0,
  });
  const [recentChats, setRecentChats] = useState([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      fetchUserStats();
      fetchRecentChats();
      loadDashboardData();
    }
  }, [user]);

  const fetchUserStats = async () => {
    try {
      const userStats = await getUserStats();
      setStats(userStats);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch user stats:", error);
      setIsLoading(false);
    }
  };

  const fetchRecentChats = async () => {
    try {
      const userChats = await getUserChats(5);
      setRecentChats(userChats as any);
    } catch (error) {
      console.error("Failed to fetch recent chats:", error);
    }
  };

  const loadDashboardData = async () => {
    try {
      // Load subscription data
      const subResponse = await fetch('/api/subscription/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      });
      
      if (subResponse.ok) {
        const subData = await subResponse.json();
        if (subData.success && subData.subscriptions.length > 0) {
          setSubscription(subData.subscriptions[0]); // Get most recent subscription
        }
      }

      // Mock usage data (in real app, this would come from your analytics API)
      setUsage({
        cliRequests: { used: 127, limit: 1000 },
        webProjects: { used: 3, limit: 20 },
        chatMessages: { used: 342, limit: 1000 },
        extensionSuggestions: { used: 89, limit: 500 },
        storage: { used: '2.3 GB', limit: '10 GB' }
      });

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'on_hold': return 'text-yellow-600 bg-yellow-100';
      case 'cancelled': return 'text-red-600 bg-red-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getUsagePercent = (used: number, limit: number) => {
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  const currentPlan = subscription ? 
    (subscription.amount >= 9900 ? 'ENTERPRISE' : 
     subscription.amount >= 1900 ? 'PRO' : 'FREE') : 'FREE';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                ← Back to Recoder
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                subscription ? getStatusColor(subscription.status) : 'text-blue-600 bg-blue-100'
              }`}>
                {currentPlan} Plan
              </span>
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name || "User"}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-medium text-gray-900">{user?.name}</p>
                <p className="text-sm text-gray-600">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome back, {user?.name?.split(' ')[0] || 'User'}! 👋
          </h2>
          <p className="text-gray-600">
            Manage your AI development workspace and access all Recoder products.
          </p>
        </div>

        {/* Dashboard Navigation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Dashboard Sections</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/dashboard/cost"
              className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <DollarSign className="w-5 h-5 text-blue-600 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">Cost Analysis</h3>
                <p className="text-sm text-gray-600">View usage costs and optimization</p>
              </div>
            </Link>
            
            <Link
              href="/dashboard/router-analytics"
              className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <BarChart3 className="w-5 h-5 text-green-600 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">Router Analytics</h3>
                <p className="text-sm text-gray-600">Monitor CLI router performance</p>
              </div>
            </Link>

            <Link
              href="/settings"
              className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Settings className="w-5 h-5 text-purple-600 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">Settings</h3>
                <p className="text-sm text-gray-600">Manage account and preferences</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Quick Access to Products */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Terminal className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">CLI Tool</h3>
                <p className="text-sm text-gray-600">Generate production code</p>
              </div>
            </div>
            <div className="mt-4">
              <button 
                onClick={() => window.open('https://www.npmjs.com/package/recoder-cli', '_blank')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
              >
                Install CLI <ExternalLink className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <Code className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">VS Code Extension</h3>
                <p className="text-sm text-gray-600">AI in your editor</p>
              </div>
            </div>
            <div className="mt-4">
              <button 
                onClick={() => window.open('https://marketplace.visualstudio.com/items?itemName=recoder.recoder-vscode', '_blank')}
                className="text-green-600 hover:text-green-800 text-sm font-medium flex items-center"
              >
                Get Extension <ExternalLink className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Web Platform</h3>
                <p className="text-sm text-gray-600">Build in the browser</p>
              </div>
            </div>
            <div className="mt-4">
              <button 
                onClick={() => window.open('https://web.recoder.xyz', '_blank')}
                className="text-purple-600 hover:text-purple-800 text-sm font-medium flex items-center"
              >
                Open Platform <ExternalLink className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-lg">
                <MessageSquare className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">AI Chat</h3>
                <p className="text-sm text-gray-600">Conversational coding</p>
              </div>
            </div>
            <div className="mt-4">
              <button 
                onClick={() => window.open('https://chat.recoder.xyz', '_blank')}
                className="text-orange-600 hover:text-orange-800 text-sm font-medium flex items-center"
              >
                Start Chatting <ExternalLink className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Usage & Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Usage Statistics */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Usage This Month</h2>
                <BarChart3 className="w-5 h-5 text-gray-400" />
              </div>
              
              {usage && (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">CLI Requests</span>
                      <span className="text-sm text-gray-600">
                        {usage.cliRequests.used} / {usage.cliRequests.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${getUsageColor(getUsagePercent(usage.cliRequests.used, usage.cliRequests.limit))}`}
                        style={{ width: `${getUsagePercent(usage.cliRequests.used, usage.cliRequests.limit)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Web Projects</span>
                      <span className="text-sm text-gray-600">
                        {usage.webProjects.used} / {usage.webProjects.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${getUsageColor(getUsagePercent(usage.webProjects.used, usage.webProjects.limit))}`}
                        style={{ width: `${getUsagePercent(usage.webProjects.used, usage.webProjects.limit)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Chat Messages</span>
                      <span className="text-sm text-gray-600">
                        {usage.chatMessages.used} / {usage.chatMessages.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${getUsageColor(getUsagePercent(usage.chatMessages.used, usage.chatMessages.limit))}`}
                        style={{ width: `${getUsagePercent(usage.chatMessages.used, usage.chatMessages.limit)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">VS Code Suggestions</span>
                      <span className="text-sm text-gray-600">
                        {usage.extensionSuggestions.used} / {usage.extensionSuggestions.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${getUsageColor(getUsagePercent(usage.extensionSuggestions.used, usage.extensionSuggestions.limit))}`}
                        style={{ width: `${getUsagePercent(usage.extensionSuggestions.used, usage.extensionSuggestions.limit)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Storage</span>
                      <span className="text-sm text-gray-600">
                        {usage.storage.used} / {usage.storage.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: '23%' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
                <Clock className="w-5 h-5 text-gray-400" />
              </div>
              
              {recentChats.length > 0 ? (
                <div className="space-y-4">
                  {recentChats.map((chat: any) => (
                    <div key={chat.id} className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{chat.title}</p>
                        <p className="text-xs text-gray-600">{new Date(chat.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Terminal className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Generated React component</p>
                      <p className="text-xs text-gray-600">2 minutes ago via CLI</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Code className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Code suggestion accepted</p>
                      <p className="text-xs text-gray-600">15 minutes ago in VS Code</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Globe className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Web project created</p>
                      <p className="text-xs text-gray-600">1 hour ago via Web Platform</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <MessageSquare className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">AI Chat session</p>
                      <p className="text-xs text-gray-600">3 hours ago</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Subscription & Account */}
          <div className="space-y-6">
            {/* Subscription Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Subscription</h2>
                <CreditCard className="w-5 h-5 text-gray-400" />
              </div>
              
              {subscription ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Plan</span>
                    <span className="text-sm font-bold text-gray-900">{currentPlan}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Status</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                      {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Amount</span>
                    <span className="text-sm font-bold text-gray-900">
                      ${(subscription.amount / 100).toFixed(2)} {subscription.currency.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Next Billing</span>
                    <span className="text-sm text-gray-600">
                      {new Date(subscription.nextBillingDate).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200">
                    <Link
                      href="/pricing"
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium text-center block"
                    >
                      Manage Subscription
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-600 mb-4">You're on the Free plan</p>
                  <Link
                    href="/pricing"
                    className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Upgrade Plan
                  </Link>
                </div>
              )}
            </div>

            {/* Account Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Account</h2>
                <User className="w-5 h-5 text-gray-400" />
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <p className="text-sm text-gray-900 mt-1">{user?.email}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Member Since</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {subscription ? new Date(subscription.createdAt).toLocaleDateString() : 'Today'}
                  </p>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <Link
                    href="/settings"
                    className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium text-center block"
                  >
                    Account Settings
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl border border-blue-200 p-6">
              <div className="flex items-center mb-4">
                <Zap className="w-6 h-6 text-blue-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">AI Usage Today</h2>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.generationsToday}</div>
                  <div className="text-xs text-gray-600">Requests</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">98%</div>
                  <div className="text-xs text-gray-600">Success Rate</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const runtime = "edge";