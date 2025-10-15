/**
 * Dashboard Overview Page
 * Main dashboard with key metrics and quick actions
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Activity,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  DollarSign,
  Zap,
  Users,
  FolderGit2,
  Terminal,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Calendar,
  CreditCard
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface DashboardStats {
  usage: {
    requests: number;
    tokens: number;
    cost: number;
    trend: number;
  };
  projects: {
    total: number;
    active: number;
    trend: number;
  };
  apiKeys: {
    total: number;
    active: number;
  };
  subscription: {
    plan: string;
    status: string;
    renewsAt: string;
    daysRemaining: number;
  };
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  icon: 'project' | 'api' | 'usage' | 'billing';
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);
      const [statsRes, activitiesRes] = await Promise.all([
        apiClient.get('/api/dashboard/overview/stats'),
        apiClient.get('/api/dashboard/overview/activities')
      ]);

      if (statsRes.success) {
        setStats(statsRes.data);
      }

      if (activitiesRes.success) {
        setActivities(activitiesRes.data.activities || []);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <FolderGit2 className="h-4 w-4" />;
      case 'api':
        return <Terminal className="h-4 w-4" />;
      case 'usage':
        return <Activity className="h-4 w-4" />;
      case 'billing':
        return <CreditCard className="h-4 w-4" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <h3 className="font-medium">Error Loading Dashboard</h3>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-gray-400">Welcome back! Here's your overview</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Usage Stats */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Zap className="h-5 w-5 text-blue-400" />
              </div>
              {stats?.usage.trend !== undefined && (
                <div className={`flex items-center gap-1 text-sm ${
                  stats.usage.trend >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {stats.usage.trend >= 0 ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                  <span>{Math.abs(stats.usage.trend)}%</span>
                </div>
              )}
            </div>
            <h3 className="text-gray-400 text-sm mb-1">API Requests</h3>
            <p className="text-2xl font-bold text-white">
              {stats?.usage.requests.toLocaleString() || '0'}
            </p>
            <p className="text-xs text-gray-500 mt-2">This month</p>
          </div>

          {/* Cost Stats */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-400" />
              </div>
            </div>
            <h3 className="text-gray-400 text-sm mb-1">Total Cost</h3>
            <p className="text-2xl font-bold text-white">
              ${stats?.usage.cost.toFixed(2) || '0.00'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              ${(stats?.usage.cost / (stats?.usage.requests || 1)).toFixed(4)} per request
            </p>
          </div>

          {/* Projects Stats */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <FolderGit2 className="h-5 w-5 text-purple-400" />
              </div>
              {stats?.projects.trend !== undefined && (
                <div className={`flex items-center gap-1 text-sm ${
                  stats.projects.trend >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {stats.projects.trend >= 0 ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                  <span>{Math.abs(stats.projects.trend)}%</span>
                </div>
              )}
            </div>
            <h3 className="text-gray-400 text-sm mb-1">Active Projects</h3>
            <p className="text-2xl font-bold text-white">
              {stats?.projects.active || '0'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {stats?.projects.total || '0'} total
            </p>
          </div>

          {/* API Keys Stats */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Terminal className="h-5 w-5 text-orange-400" />
              </div>
            </div>
            <h3 className="text-gray-400 text-sm mb-1">API Keys</h3>
            <p className="text-2xl font-bold text-white">
              {stats?.apiKeys.active || '0'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {stats?.apiKeys.total || '0'} total
            </p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Subscription Status */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-400" />
                  Subscription
                </h2>
                <Link 
                  href="/dashboard/billing"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Manage →
                </Link>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Current Plan</p>
                    <p className="text-2xl font-bold text-white capitalize">
                      {stats?.subscription.plan || 'Free'}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm ${
                    stats?.subscription.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {stats?.subscription.status || 'inactive'}
                  </div>
                </div>

                {stats?.subscription.renewsAt && (
                  <div className="border-t border-slate-700/50 pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Next billing date</span>
                      <span className="text-white">
                        {new Date(stats.subscription.renewsAt).toLocaleDateString()}
                      </span>
                    </div>
                    {stats.subscription.daysRemaining <= 7 && (
                      <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-yellow-400 text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Renews in {stats.subscription.daysRemaining} days
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-6">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/chat"
                className="flex items-center gap-3 p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors group"
              >
                <Terminal className="h-5 w-5 text-blue-400" />
                <div className="flex-1">
                  <p className="text-white font-medium">New Project</p>
                  <p className="text-xs text-gray-400">Start building</p>
                </div>
              </Link>

              <Link
                href="/dashboard/api-keys"
                className="flex items-center gap-3 p-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg transition-colors group"
              >
                <Terminal className="h-5 w-5 text-purple-400" />
                <div className="flex-1">
                  <p className="text-white font-medium">Manage API Keys</p>
                  <p className="text-xs text-gray-400">Configure access</p>
                </div>
              </Link>

              <Link
                href="/dashboard/usage"
                className="flex items-center gap-3 p-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg transition-colors group"
              >
                <BarChart3 className="h-5 w-5 text-green-400" />
                <div className="flex-1">
                  <p className="text-white font-medium">View Analytics</p>
                  <p className="text-xs text-gray-400">Usage insights</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" />
              Recent Activity
            </h2>
            <Link 
              href="/dashboard/usage"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </Link>
          </div>

          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No recent activity</p>
            ) : (
              activities.slice(0, 10).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg"
                >
                  <div className="p-2 bg-slate-700/50 rounded-lg">
                    {getActivityIcon(activity.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
