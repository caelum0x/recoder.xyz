'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Crown, Key, TrendingUp, Zap } from 'lucide-react';
import PlanOverview from './components/PlanOverview';
import ApiKeyManager from './components/ApiKeyManager';
import UsageMetrics from './components/UsageMetrics';
import PremiumFeatures from './components/PremiumFeatures';
import CLISessionManager from './components/CLISessionManager';

export default function PremiumSettingsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [premiumData, setPremiumData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchPremiumStatus();
    }
  }, [status]);

  const fetchPremiumStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/premium/status', {
        headers: {
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch premium status');
      }

      const data = await response.json();
      setPremiumData(data);
    } catch (err) {
      console.error('Error fetching premium status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load premium data');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="p-8 text-center">
          <Crown className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-2xl font-bold mb-2">Please Sign In</h2>
          <p className="text-gray-600 mb-4">
            You need to be signed in to access premium settings.
          </p>
          <Button onClick={() => window.location.href = '/auth/signin'}>
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="p-8 text-center bg-red-50 border-red-200">
          <h2 className="text-2xl font-bold text-red-900 mb-2">Error</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <Button onClick={fetchPremiumStatus} variant="outline">
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  const isPremium = premiumData?.subscription?.plan !== 'free';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Crown className={`w-8 h-8 ${isPremium ? 'text-yellow-500' : 'text-gray-400'}`} />
              Premium Settings
            </h1>
            <p className="mt-2 text-gray-600">
              Manage your subscription, API keys, and usage analytics
            </p>
          </div>
          {!isPremium && (
            <Button 
              onClick={() => window.location.href = '/pricing'}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              Upgrade to Premium
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Plan Overview - Full width on mobile, 2 cols on desktop */}
        <div className="lg:col-span-2">
          <PlanOverview 
            premiumData={premiumData} 
            onRefresh={fetchPremiumStatus}
          />
        </div>

        {/* Usage Metrics - Right sidebar */}
        <div>
          <UsageMetrics usage={premiumData?.usage} limits={premiumData?.subscription?.limits} />
        </div>
      </div>

      {/* API Key Management */}
      <div className="mb-6">
        <ApiKeyManager 
          apiKeys={premiumData?.apiKeys || []} 
          onRefresh={fetchPremiumStatus}
          maxKeys={premiumData?.subscription?.limits?.maxApiKeys || 1}
          currentPlan={premiumData?.subscription?.plan || 'free'}
        />
      </div>

      {/* CLI Session Management */}
      <div className="mb-6">
        <CLISessionManager
          sessions={premiumData?.cliSessions || []}
          onRefresh={fetchPremiumStatus}
        />
      </div>

      {/* Premium Features List */}
      <div>
        <PremiumFeatures 
          features={premiumData?.subscription?.limits?.features || []}
          currentPlan={premiumData?.subscription?.plan || 'free'}
        />
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" 
              onClick={() => window.location.href = '/dashboard/usage'}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Usage Dashboard</h3>
              <p className="text-sm text-gray-600">View detailed analytics</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => window.location.href = '/settings/subscription'}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Crown className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Subscription</h3>
              <p className="text-sm text-gray-600">Manage billing & plans</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => window.location.href = '/cli/auth'}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Key className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">CLI Authentication</h3>
              <p className="text-sm text-gray-600">Setup terminal access</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
