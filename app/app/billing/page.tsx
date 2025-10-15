/**
 * Billing Management Page
 * Complete billing dashboard with real payments integration
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  CreditCard,
  Check,
  Zap,
  Users,
  ArrowUp,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
  Sparkles
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  features: Array<{
    name: string;
    included: boolean;
  }>;
  limits: {
    monthlyRequests: number;
    dailyRequests: number;
    tokensPerRequest: number;
  };
}

interface Subscription {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt?: string;
  description?: string;
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  async function loadBillingData() {
    try {
      setLoading(true);

      const [plansRes, subscriptionRes, invoicesRes] = await Promise.all([
        fetch('/api/billing/plans').then(r => r.json()),
        fetch('/api/billing/subscription').then(r => r.json()),
        fetch('/api/billing/invoices').then(r => r.json())
      ]);

      if (plansRes.success) {
        setPlans(plansRes.data.plans || []);
      }

      if (subscriptionRes.success) {
        setCurrentSubscription(subscriptionRes.data.subscription);
      }

      if (invoicesRes.success) {
        setInvoices(invoicesRes.data.invoices || []);
      }
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(planId: string, paymentMethod: 'card' | 'crypto') {
    try {
      setCheckoutLoading(planId);
      setError(null);

      const endpoint = paymentMethod === 'card' 
        ? '/api/billing/checkout/paddle'
        : '/api/billing/checkout/dodo';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      }).then(r => r.json());

      if (response.success && response.data.checkoutUrl) {
        window.location.href = response.data.checkoutUrl;
      } else {
        setError('Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'Failed to initiate checkout');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm('Are you sure you want to cancel your subscription?')) {
      return;
    }

    try {
      const response = await fetch('/api/billing/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelAtPeriodEnd: true })
      }).then(r => r.json());

      if (response.success) {
        await loadBillingData();
        alert('Subscription will be cancelled at the end of the billing period');
      } else {
        setError('Failed to cancel subscription');
      }
    } catch (err: any) {
      console.error('Cancel error:', err);
      setError(err.message || 'Failed to cancel subscription');
    }
  }

  async function handleReactivateSubscription() {
    try {
      const response = await fetch('/api/billing/subscription/reactivate', {
        method: 'POST'
      }).then(r => r.json());

      if (response.success) {
        await loadBillingData();
        alert('Subscription reactivated successfully');
      } else {
        setError('Failed to reactivate subscription');
      }
    } catch (err: any) {
      console.error('Reactivate error:', err);
      setError(err.message || 'Failed to reactivate subscription');
    }
  }

  const getPlanIcon = (planName: string) => {
    if (planName.toLowerCase().includes('free')) return Zap;
    if (planName.toLowerCase().includes('pro')) return Sparkles;
    if (planName.toLowerCase().includes('enterprise')) return Users;
    return Check;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading billing information...</p>
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
          <Link 
            href="/dashboard"
            className="text-blue-400 hover:text-blue-300 transition-colors mb-4 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Billing & Subscriptions</h1>
          <p className="text-gray-400">Manage your subscription and billing settings</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="flex-1">
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Current Subscription */}
        {currentSubscription && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-400" />
              Current Subscription
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-gray-400 text-sm mb-1">Plan</p>
                <p className="text-white text-lg font-semibold capitalize">
                  {currentSubscription.planId}
                </p>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-1">Status</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  currentSubscription.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {currentSubscription.status === 'active' && <CheckCircle className="h-4 w-4" />}
                  {currentSubscription.status}
                </div>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-1">Next Billing Date</p>
                <p className="text-white font-medium">
                  {new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            </div>

            {currentSubscription.cancelAtPeriodEnd && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Your subscription will be cancelled on {new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()}
                </p>
                <button
                  onClick={handleReactivateSubscription}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline"
                >
                  Reactivate subscription
                </button>
              </div>
            )}

            {!currentSubscription.cancelAtPeriodEnd && currentSubscription.status === 'active' && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <button
                  onClick={handleCancelSubscription}
                  className="text-red-400 hover:text-red-300 text-sm transition-colors"
                >
                  Cancel Subscription
                </button>
              </div>
            )}
          </div>
        )}

        {/* Available Plans */}
        <div>
          <h2 className="text-2xl font-semibold text-white mb-6">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const Icon = getPlanIcon(plan.name);
              const isCurrentPlan = currentSubscription?.planId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`bg-slate-800/50 backdrop-blur-sm border rounded-lg p-6 ${
                    isCurrentPlan 
                      ? 'border-blue-500/50 ring-2 ring-blue-500/20' 
                      : 'border-slate-700/50'
                  }`}
                >
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <Icon className="h-8 w-8 text-blue-400" />
                      {isCurrentPlan && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                          Current Plan
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    <p className="text-gray-400 text-sm mt-1">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-white">
                        ${plan.price}
                      </span>
                      <span className="text-gray-400 text-sm">/{plan.interval}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {plan.features.slice(0, 5).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-300 text-sm">{feature.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {!isCurrentPlan && (
                      <>
                        <button
                          onClick={() => handleUpgrade(plan.id, 'card')}
                          disabled={checkoutLoading === plan.id}
                          className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {checkoutLoading === plan.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <ArrowUp className="h-4 w-4" />
                              <span>Upgrade with Card</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleUpgrade(plan.id, 'crypto')}
                          disabled={checkoutLoading === plan.id}
                          className="w-full py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Pay with Crypto
                        </button>
                      </>
                    )}
                  </div>

                  {plan.limits && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50 text-xs text-gray-400">
                      <p>{plan.limits.monthlyRequests.toLocaleString()} requests/month</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing History */}
        {invoices.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" />
              Billing History
            </h2>

            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className={`px-2 py-1 rounded text-xs ${
                        invoice.status === 'paid'
                          ? 'bg-green-500/20 text-green-400'
                          : invoice.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {invoice.status}
                      </div>
                      <span className="text-white">
                        ${invoice.amount.toFixed(2)} {invoice.currency}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      {invoice.description || 'Subscription payment'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(invoice.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {invoice.status === 'paid' && (
                    <Link
                      href={`/api/billing/invoices/${invoice.id}/download`}
                      className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span className="text-sm">Download</span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
