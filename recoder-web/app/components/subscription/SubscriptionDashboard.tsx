/**
 * Subscription Dashboard Component
 * Shows current subscription, usage, and manage options
 */

import { useState, useEffect } from 'react';

// Icon components using UnoCSS classes (Cloudflare Workers compatible)
const CreditCard = ({ className }: { className?: string }) => <div className={`i-ph:credit-card ${className || ''}`} />;
const TrendingUp = ({ className }: { className?: string }) => <div className={`i-ph:trend-up ${className || ''}`} />;
const Calendar = ({ className }: { className?: string }) => <div className={`i-ph:calendar ${className || ''}`} />;
const AlertCircle = ({ className }: { className?: string }) => <div className={`i-ph:warning-circle ${className || ''}`} />;
const CheckCircle = ({ className }: { className?: string }) => <div className={`i-ph:check-circle ${className || ''}`} />;

interface SubscriptionData {
  subscription: any;
  usage: {
    allowed: boolean;
    remaining: number;
    limit: number;
    planId: string;
  };
  stats: {
    totalGenerations: number;
    totalTokens: number;
    totalCost: number;
    byModel: Record<string, number>;
    byDay: Array<{ date: string; count: number }>;
  };
}

export function SubscriptionDashboard() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  async function loadSubscriptionData() {
    try {
      const userId = getUserId();
      const response = await fetch('/api/subscribe', {
        headers: {
          'x-user-id': userId || ''
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load subscription data');
      }

      const result = (await response.json()) as SubscriptionData;
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelSubscription() {
    if (!data?.subscription) return;

    const confirmed = confirm(
      'Are you sure you want to cancel? You will keep access until the end of your billing period.'
    );

    if (!confirmed) return;

    try {
      const userId = getUserId();
      const response = await fetch('/api/subscribe?action=cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || ''
        },
        body: JSON.stringify({
          subscriptionId: data.subscription.subscription_id,
          provider: data.subscription.provider,
          immediate: false
        })
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      alert('Subscription cancelled. You will keep access until the end of your billing period.');
      loadSubscriptionData();
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
    }
  }

  async function handleManageBilling() {
    if (!data?.subscription) return;

    try {
      const userId = getUserId();
      const response = await fetch('/api/subscribe?action=create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || ''
        },
        body: JSON.stringify({
          customerId: data.subscription.customer_id,
          provider: data.subscription.provider
        })
      });

      if (!response.ok) {
        throw new Error('Failed to open billing portal');
      }

      const { portalUrl } = (await response.json()) as { portalUrl: string };
      window.location.href = portalUrl;
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const { subscription, usage, stats } = data || {};
  const usagePercent = usage ? (usage.remaining / usage.limit) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Subscription & Usage</h1>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Current Plan */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Current Plan</h2>
          </div>

          {subscription ? (
            <>
              <div className="mb-4">
                <p className="text-3xl font-bold text-white capitalize">{subscription.plan_id}</p>
                <p className="text-gray-400 text-sm mt-1">
                  Provider: {subscription.provider === 'paddle' ? 'Paddle' : 'DodoPay'}
                </p>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  {subscription.status === 'active' ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                  )}
                  <span className="text-gray-300 capitalize">Status: {subscription.status}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">
                    Renews: {new Date(subscription.current_period_end).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleManageBilling}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Manage Billing
                </button>

                {!subscription.cancel_at_period_end && (
                  <button
                    onClick={handleCancelSubscription}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                  >
                    Cancel Plan
                  </button>
                )}
              </div>

              {subscription.cancel_at_period_end && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                  <p className="text-yellow-400 text-sm">
                    Subscription will cancel on {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">No active subscription</p>
              <a
                href="/pricing"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium transition-colors"
              >
                View Plans
              </a>
            </div>
          )}
        </div>

        {/* Usage Stats */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-semibold text-white">Usage This Month</h2>
          </div>

          {usage && (
            <>
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-gray-400">AI Generations</span>
                  <span className="text-2xl font-bold text-white">
                    {usage.limit - usage.remaining} / {usage.limit}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${100 - usagePercent}%` }}
                  />
                </div>

                <p className="text-gray-400 text-sm mt-2">
                  {usage.remaining} generations remaining
                </p>
              </div>

              {usage.remaining < 10 && usage.remaining > 0 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                  <p className="text-yellow-400 text-sm">
                    You're running low on generations. Consider upgrading your plan.
                  </p>
                </div>
              )}

              {usage.remaining === 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                  <p className="text-red-400 text-sm">
                    You've reached your monthly limit. Upgrade to continue generating.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Additional Stats */}
      {stats && stats.totalGenerations > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Usage Statistics (30 days)</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-gray-400 text-sm">Total Generations</p>
              <p className="text-2xl font-bold text-white">{stats.totalGenerations}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Tokens Used</p>
              <p className="text-2xl font-bold text-white">{stats.totalTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Est. Cost Saved</p>
              <p className="text-2xl font-bold text-green-400">${stats.totalCost.toFixed(2)}</p>
            </div>
          </div>

          {/* Model usage breakdown */}
          {Object.keys(stats.byModel).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">By AI Model</h3>
              <div className="space-y-2">
                {Object.entries(stats.byModel).map(([model, count]) => (
                  <div key={model} className="flex justify-between items-center">
                    <span className="text-gray-300">{model}</span>
                    <span className="text-white font-medium">{count} generations</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getUserId(): string | null {
  return localStorage.getItem('userId');
}
