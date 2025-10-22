'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { 
  CheckCircle,
  X,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  XCircle,
  Zap,
  Users,
  Globe,
  Shield
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'weekly' | 'monthly' | 'yearly';
  features: string[];
}

interface Subscription {
  id: string;
  plan: Plan;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string;
  trialEnd?: string;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'monthly',
    features: [
      '5,000 requests/month',
      'Basic models',
      'Community support',
      'Standard rate limits',
    ],
  },
  {
    id: 'weekly',
    name: 'Weekly',
    price: 10,
    interval: 'weekly',
    features: [
      '50,000 requests/week',
      'All AI models',
      'Priority support',
      'Higher rate limits',
      'Custom integrations',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    interval: 'monthly',
    features: [
      'Unlimited requests',
      'All AI models',
      'Priority support',
      'No rate limits',
      'Custom integrations',
      'Advanced analytics',
      'Team collaboration',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    interval: 'monthly',
    features: [
      'Everything in Pro',
      'Dedicated support',
      'Custom SLA',
      'On-premise deployment',
      'Advanced security',
      'Custom contract',
    ],
  },
];

export default function SubscriptionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadSubscription();
    }
  }, [status, router]);

  const loadSubscription = async () => {
    try {
      const { backendApi } = await import('@/lib/backend-api');

      // Get user's subscriptions
      const subscriptions = await backendApi.getSubscriptions();

      // Get the active subscription
      const activeSub = subscriptions.find(
        (sub) => sub.status === 'active' || sub.status === 'cancelled_at_period_end'
      );

      if (activeSub) {
        // Map backend data to frontend format
        const plan = PLANS.find((p) => p.id === activeSub.planId) || PLANS[0];

        setSubscription({
          id: activeSub.id,
          plan,
          status: activeSub.status === 'cancelled_at_period_end' ? 'active' : activeSub.status,
          currentPeriodStart: activeSub.currentPeriodStart || new Date().toISOString(),
          currentPeriodEnd: activeSub.nextBillingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd || activeSub.status === 'cancelled_at_period_end',
        });
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setProcessing(true);
    try {
      const { backendApi } = await import('@/lib/backend-api');

      if (!subscription) {
        // No existing subscription, redirect to checkout
        router.push(`/checkout?plan=${planId}`);
        return;
      }

      // Change existing subscription plan
      await backendApi.changePlan(subscription.id, planId);
      await loadSubscription();
    } catch (error: any) {
      console.error('Error upgrading plan:', error);
      alert(error.message || 'Failed to upgrade plan');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    setProcessing(true);
    try {
      const { backendApi } = await import('@/lib/backend-api');

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Cancel subscription (at period end by default)
      await backendApi.cancelSubscription(subscription.id, true);

      setShowCancelModal(false);
      setCancelReason('');
      await loadSubscription();
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      alert(error.message || 'Failed to cancel subscription');
    } finally {
      setProcessing(false);
    }
  };

  const handleReactivate = async () => {
    setProcessing(true);
    try {
      const { backendApi } = await import('@/lib/backend-api');

      if (!subscription) {
        throw new Error('No subscription found');
      }

      // Reactivate subscription
      await backendApi.reactivateSubscriptionAlt();
      await loadSubscription();
    } catch (error: any) {
      console.error('Error reactivating subscription:', error);
      alert(error.message || 'Failed to reactivate subscription');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/30">
            <CheckCircle className="w-3.5 h-3.5" />
            Active
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/30">
            <XCircle className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
      case 'past_due':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Past Due
          </span>
        );
      case 'trialing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/30">
            <Zap className="w-3.5 h-3.5" />
            Trial
          </span>
        );
      default:
        return null;
    }
  };

  if (loading || status === 'loading') {
    return <PageLoader />;
  }

  const currentPlan = subscription?.plan || PLANS[0];
  const isFreePlan = currentPlan.id === 'free';

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/billing" 
            className="text-gray-400 hover:text-white mb-4 inline-flex items-center gap-2 transition-colors"
          >
            ← Back to Billing
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent mb-2">
            Subscription Management
          </h1>
          <p className="text-gray-400">Manage your plan and subscription settings</p>
        </div>

        {/* Current Subscription */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-bold">{currentPlan.name} Plan</h2>
                {subscription && getStatusBadge(subscription.status)}
              </div>
              <p className="text-4xl font-bold text-gray-300">
                ${currentPlan.price}
                <span className="text-lg text-gray-400">/{currentPlan.interval}</span>
              </p>
            </div>
          </div>

          {subscription && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-black/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">Current Period</span>
                </div>
                <p className="text-white font-medium">
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>

              <div className="bg-black/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-sm">Next Billing Date</span>
                </div>
                <p className="text-white font-medium">
                  {subscription.cancelAtPeriodEnd 
                    ? 'Subscription will end on ' + new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  }
                </p>
              </div>
            </div>
          )}

          {/* Cancellation Notice */}
          {subscription?.cancelAtPeriodEnd && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-yellow-400 font-medium mb-1">Subscription Cancelled</p>
                  <p className="text-sm text-gray-300">
                    Your subscription will remain active until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                    You can reactivate it at any time before then.
                  </p>
                </div>
                <button
                  onClick={handleReactivate}
                  disabled={processing}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Reactivate'}
                </button>
              </div>
            </div>
          )}

          {/* Current Plan Features */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3">Included Features:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {currentPlan.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-gray-300">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {!subscription?.cancelAtPeriodEnd && !isFreePlan && (
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-lg font-medium transition-all"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>

        {/* Available Plans */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">
            {isFreePlan ? 'Upgrade Your Plan' : 'Change Your Plan'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan.id;
              const isHigherTier = PLANS.indexOf(plan) > PLANS.indexOf(currentPlan);
              
              return (
                <div
                  key={plan.id}
                  className={`bg-white/5 backdrop-blur-xl border rounded-2xl p-6 ${
                    isCurrent 
                      ? 'border-orange-500/50 ring-2 ring-orange-500/20' 
                      : 'border-white/10 hover:border-white/20'
                  } transition-all`}
                >
                  <div className="mb-4">
                    <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                    <p className="text-3xl font-bold">
                      ${plan.price}
                      <span className="text-sm text-gray-400">/{plan.interval}</span>
                    </p>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.slice(0, 4).map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => !isCurrent && handleUpgrade(plan.id)}
                    disabled={isCurrent || processing}
                    className={`w-full py-2 rounded-lg font-medium transition-all ${
                      isCurrent
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : isHigherTier
                        ? 'bg-gradient-to-r from-orange-500 to-purple-600 hover:opacity-90 text-white'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {isCurrent ? 'Current Plan' : isHigherTier ? 'Upgrade' : 'Downgrade'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cancel Subscription Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 max-w-md w-full">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Cancel Subscription?</h2>
                <p className="text-gray-400">
                  Your subscription will remain active until the end of your current billing period.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Help us improve - Why are you cancelling? (Optional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Tell us your reason..."
                  rows={3}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelReason('');
                  }}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-semibold transition-all"
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancelSubscription}
                  disabled={processing}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
