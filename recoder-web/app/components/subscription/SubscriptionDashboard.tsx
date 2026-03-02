/**
 * Subscription Dashboard Component
 * Shows current subscription, usage, and manage options
 */

import { useState, useEffect, useCallback } from 'react';

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

function CancelModal({
  open,
  onClose,
  onConfirm,
  periodEnd,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  periodEnd: string | null;
  loading: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-xl font-semibold text-recoder-elements-textPrimary mb-3">
          Cancel subscription?
        </h3>

        <p className="text-recoder-elements-textSecondary text-sm mb-2">
          Your subscription will remain active until the end of the current billing period.
        </p>

        {periodEnd && (
          <p className="text-recoder-elements-textTertiary text-sm mb-4">
            You will keep access until{' '}
            <span className="text-recoder-elements-textPrimary font-medium">
              {new Date(periodEnd).toLocaleDateString()}
            </span>
            . After that, your account will revert to the Free plan.
          </p>
        )}

        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-6">
          <p className="text-yellow-400 text-sm">
            You can resubscribe at any time from the billing portal.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-recoder-elements-textPrimary bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-item-backgroundHover transition-colors"
          >
            Keep subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Cancelling...' : 'Yes, cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionDashboard({ readOnlyMode = false }: { readOnlyMode?: boolean }) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  async function loadSubscriptionData() {
    try {
      const response = await fetch('/api/subscribe', {
        credentials: 'include',
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

    setCancelling(true);

    try {
      const response = await fetch('/api/subscribe?action=cancel-subscription', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId: data.subscription.subscription_id,
          provider: data.subscription.provider,
          immediate: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      setCancelModalOpen(false);
      showToast('success', 'Subscription cancelled. You will keep access until the end of your billing period.');
      loadSubscriptionData();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
    }
  }

  async function handleManageBilling() {
    if (!data?.subscription) return;

    try {
      const response = await fetch('/api/subscribe?action=create-portal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: data.subscription.customer_id,
          provider: data.subscription.provider,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to open billing portal');
      }

      const { portalUrl } = (await response.json()) as { portalUrl: string };
      window.location.href = portalUrl;
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to open billing portal');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Billing</h1>
          <p className="text-recoder-elements-textSecondary">Manage your subscription and usage</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const { subscription, usage, stats } = data || {};
  const usagePercent = usage ? ((usage.limit - usage.remaining) / usage.limit) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg border shadow-lg transition-opacity ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-400'
              : 'bg-red-500/10 border-red-500/50 text-red-400'
          }`}
        >
          <p className="text-sm">{toast.message}</p>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Billing</h1>
        <p className="text-recoder-elements-textSecondary">Manage your subscription and usage</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Current Plan */}
        <div className="bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-recoder-elements-textPrimary">Current Plan</h2>
          </div>

          {subscription ? (
            <>
              <div className="mb-4">
                <p className="text-3xl font-bold text-recoder-elements-textPrimary capitalize">
                  {subscription.plan_id}
                </p>
                <p className="text-recoder-elements-textTertiary text-sm mt-1">
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
                  <span className="text-recoder-elements-textSecondary capitalize">
                    Status: {subscription.status}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-recoder-elements-textTertiary" />
                  <span className="text-recoder-elements-textSecondary text-sm">
                    Renews: {new Date(subscription.current_period_end).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleManageBilling}
                  disabled={readOnlyMode}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm"
                >
                  {readOnlyMode ? 'Billing Disabled' : 'Manage Billing'}
                </button>

                {!subscription.cancel_at_period_end && !readOnlyMode && (
                  <button
                    onClick={() => setCancelModalOpen(true)}
                    className="flex-1 bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-item-backgroundHover text-recoder-elements-textSecondary py-2 px-4 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel Plan
                  </button>
                )}
              </div>

              {subscription.cancel_at_period_end && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                  <p className="text-yellow-400 text-sm">
                    Subscription will cancel on{' '}
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              )}
              {readOnlyMode && (
                <div className="mt-4 p-3 bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded-lg">
                  <p className="text-recoder-elements-textSecondary text-sm">
                    Billing write actions are disabled in this environment.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-recoder-elements-textTertiary mb-4">No active subscription</p>
              <a
                href="/pricing"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium transition-colors text-sm"
              >
                View Plans
              </a>
            </div>
          )}
        </div>

        {/* Usage Stats */}
        <div className="bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-semibold text-recoder-elements-textPrimary">Usage This Month</h2>
          </div>

          {usage && (
            <>
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-recoder-elements-textTertiary">AI Generations</span>
                  <span className="text-2xl font-bold text-recoder-elements-textPrimary">
                    {usage.limit - usage.remaining} / {usage.limit}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-recoder-elements-background-depth-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      usagePercent > 80
                        ? 'bg-red-500'
                        : usagePercent > 50
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                <p className="text-recoder-elements-textTertiary text-sm mt-2">
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
        <div className="bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-xl p-6">
          <h2 className="text-xl font-semibold text-recoder-elements-textPrimary mb-4">
            Usage Statistics (30 days)
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-recoder-elements-textTertiary text-sm">Total Generations</p>
              <p className="text-2xl font-bold text-recoder-elements-textPrimary">
                {stats.totalGenerations}
              </p>
            </div>
            <div>
              <p className="text-recoder-elements-textTertiary text-sm">Tokens Used</p>
              <p className="text-2xl font-bold text-recoder-elements-textPrimary">
                {stats.totalTokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-recoder-elements-textTertiary text-sm">Est. Cost Saved</p>
              <p className="text-2xl font-bold text-green-400">${stats.totalCost.toFixed(2)}</p>
            </div>
          </div>

          {/* Model usage breakdown */}
          {Object.keys(stats.byModel).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-recoder-elements-textPrimary mb-3">
                By AI Model
              </h3>
              <div className="space-y-2">
                {Object.entries(stats.byModel).map(([model, count]) => (
                  <div key={model} className="flex justify-between items-center">
                    <span className="text-recoder-elements-textSecondary">{model}</span>
                    <span className="text-recoder-elements-textPrimary font-medium">
                      {count} generations
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Modal */}
      <CancelModal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={handleCancelSubscription}
        periodEnd={data?.subscription?.current_period_end ?? null}
        loading={cancelling}
      />
    </div>
  );
}
