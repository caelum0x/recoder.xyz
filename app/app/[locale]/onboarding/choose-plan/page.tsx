/**
 * Onboarding - Choose Plan
 *
 * Owner decision 2026-10-27: Recoder's hosted paid tiers (Pro/Team) are
 * retired — the product is completely free, so this step no longer sells
 * anything. Previously: a 3-plan pricing grid + billing-cycle toggle +
 * Dodo/Paddle checkout call. Now: a single "you're already on the full
 * plan" screen, then straight on to API-key setup. See git history
 * (pre-2026-10-27) for the removed checkout logic.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { SiteHeader } from '@/components/SiteHeader';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';
import Link from 'next/link';
import { Check, ArrowRight, ArrowLeft, Zap } from 'lucide-react';

const FREE_FEATURES = [
  'Use your own OpenRouter API key (BYOK)',
  'Access to all 50+ AI models',
  'CLI, Web, and API access',
  'Unlimited parallel agents',
  'Full team collaboration, no member cap',
  'Community support',
];

export default function ChoosePlanPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    } else if (session && !isPending) {
      setLoading(false);
    }
  }, [session, isPending, router]);

  const handleContinue = () => {
    sessionStorage.setItem('onboarding_plan', 'free');
    trackEvent(AnalyticsEvents.ONBOARDING_PLAN_CHOSEN, {
      step: 'choose-plan',
      plan: 'free',
    });
    router.push('/onboarding/setup-api-key');
  };

  if (loading || isPending) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-white transition-all duration-500"
          style={{ width: '60%' }}
        />
      </div>

      <SiteHeader />

      <div className="container mx-auto px-6 py-24 mt-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold mb-4">Recoder is free</h1>
            <p className="text-xl text-gray-400">
              Every feature below is already unlocked on your account — nothing to buy.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-white bg-white/5 mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Full access</h3>
                <p className="text-gray-400 text-sm">$0, forever</p>
              </div>
            </div>
            <div className="space-y-3">
              {FREE_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start space-x-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Link
              href="/onboarding/setup-profile"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>

            <button
              onClick={handleContinue}
              className="px-8 py-3 bg-white text-black hover:bg-neutral-200 rounded-xl font-medium transition-all flex items-center space-x-2"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
