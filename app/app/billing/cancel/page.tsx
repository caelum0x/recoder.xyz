'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import { PageLoader } from '@/components/ui/LoadingSpinner';

const cancellationReasons = [
  'Too expensive',
  'Not using it enough',
  'Missing features I need',
  'Found a better alternative',
  'Technical issues',
  'Temporary break',
  'Other'
];

export default function CancelSubscriptionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadSubscription();
    }
  }, [status, router]);

  const loadSubscription = async () => {
    try {
      const response = await fetch('/api/billing/subscription');
      const data = await response.json();
      if (data.success) {
        setSubscription(data.subscription);
        if (!data.subscription || data.subscription.status !== 'active') {
          router.push('/billing');
        }
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedReason) {
      alert('Please select a reason for cancellation');
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch('/api/billing/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: selectedReason,
          feedback,
          cancelImmediate
        })
      });

      const data = await response.json();

      if (data.success) {
        router.push('/billing?cancelled=true');
      } else {
        alert(data.error || 'Cancellation failed');
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      alert('An error occurred while cancelling');
    } finally {
      setCancelling(false);
    }
  };

  if (loading || status === 'loading') {
    return <PageLoader />;
  }

  if (!subscription) {
    return null;
  }

  const endDate = new Date(subscription.currentPeriodEnd);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/billing" className="text-gray-400 hover:text-white mb-4 inline-flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Billing
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">
            Cancel Subscription
          </h1>
          <p className="text-gray-400">
            We're sorry to see you go. Please tell us why you're cancelling.
          </p>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-400 font-semibold mb-1">Before you cancel...</p>
              <ul className="text-yellow-300 text-sm space-y-1">
                <li>• You'll lose access to all premium features</li>
                <li>• Your API keys will stop working</li>
                <li>• Historical data will be retained for 90 days</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-bold mb-4">Current Subscription</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Plan:</span>
              <span className="font-semibold capitalize">{subscription.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="font-semibold text-green-500">Active</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Next billing date:</span>
              <span className="font-semibold">{endDate.toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount:</span>
              <span className="font-semibold">${subscription.amount}/{subscription.interval}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-bold mb-4">Why are you cancelling?</h3>
          <div className="space-y-2 mb-4">
            {cancellationReasons.map((reason) => (
              <label
                key={reason}
                className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedReason === reason
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                />
                <span className="ml-3">{reason}</span>
              </label>
            ))}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">
              Additional feedback (optional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us more about your experience..."
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-bold mb-4">Cancellation Options</h3>
          <div className="space-y-4">
            <label className="flex items-start cursor-pointer">
              <input
                type="radio"
                name="cancelType"
                checked={!cancelImmediate}
                onChange={() => setCancelImmediate(false)}
                className="w-4 h-4 text-orange-500 focus:ring-orange-500 mt-1"
              />
              <div className="ml-3">
                <div className="font-semibold">Cancel at end of billing period</div>
                <div className="text-sm text-gray-400">
                  Keep access until {endDate.toLocaleDateString()}. No refund.
                </div>
              </div>
            </label>

            <label className="flex items-start cursor-pointer">
              <input
                type="radio"
                name="cancelType"
                checked={cancelImmediate}
                onChange={() => setCancelImmediate(true)}
                className="w-4 h-4 text-orange-500 focus:ring-orange-500 mt-1"
              />
              <div className="ml-3">
                <div className="font-semibold">Cancel immediately</div>
                <div className="text-sm text-gray-400">
                  Access ends now. Prorated refund may apply.
                </div>
              </div>
            </label>
          </div>
        </div>

        {!showConfirm ? (
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/billing')}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-all"
            >
              Keep Subscription
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!selectedReason}
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                selectedReason
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              Continue Cancellation
            </button>
          </div>
        ) : (
          <div className="bg-red-500/10 border-2 border-red-500 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-red-500 mb-4">Are you absolutely sure?</h3>
            <p className="text-gray-300 mb-6">
              This action cannot be easily undone. You'll need to re-subscribe to regain access.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-all"
              >
                Go Back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-all flex items-center justify-center"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Yes, Cancel Subscription'
                )}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-gray-400 text-sm mt-6">
          Need help? <Link href="/support" className="text-orange-500 hover:text-orange-400">Contact support</Link>
        </p>
      </div>
    </div>
  );
}
