'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react';

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<string>('');

  useEffect(() => {
    const paymentProvider = searchParams.get('provider') || 'paddle';
    setProvider(paymentProvider);

    // Wait a moment for webhook to process
    setTimeout(() => {
      setLoading(false);
    }, 3000);
  }, [searchParams]);

  function handleContinue() {
    router.push('/dashboard');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-12 max-w-md w-full text-center">
          <Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">
            Processing Your Payment...
          </h1>
          <p className="text-gray-300">
            Please wait while we confirm your subscription.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center px-4">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-12 max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full mx-auto flex items-center justify-center animate-bounce">
            <CheckCircle className="w-16 h-16 text-white" />
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-3xl font-bold text-white mb-4">
          Payment Successful!
        </h1>
        <p className="text-gray-300 mb-8">
          Thank you for subscribing to Recoder Pro! Your account has been upgraded and you now have access to all premium features.
        </p>

        {/* Features Unlocked */}
        <div className="bg-white/5 rounded-xl p-6 mb-8 text-left">
          <h3 className="text-lg font-semibold text-white mb-4">
            What's Unlocked:
          </h3>
          <ul className="space-y-2 text-gray-300">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              No API key needed - we provide it
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Premium AI models (Claude, GPT-4, Gemini)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Increased daily sessions
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Priority support
            </li>
          </ul>
        </div>

        {/* Payment Method */}
        <p className="text-sm text-gray-400 mb-6">
          Payment method: {provider === 'paddle' ? 'Credit Card (Paddle)' : 'Cryptocurrency (DODO Pay)'}
        </p>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
        >
          Continue to Dashboard
          <ArrowRight className="w-5 h-5" />
        </button>

        {/* Help Link */}
        <p className="text-sm text-gray-400 mt-6">
          Questions? <a href="/support" className="text-blue-400 hover:underline">Contact Support</a>
        </p>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-12 max-w-md w-full text-center">
          <Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">
            Loading...
          </h1>
        </div>
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
