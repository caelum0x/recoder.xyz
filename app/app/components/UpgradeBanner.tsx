'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, X, Sparkles } from 'lucide-react';

const DISMISS_KEY = 'recoder-upgrade-banner-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface UpgradeBannerProps {
  plan?: string;
  onDismiss?: () => void;
}

export function UpgradeBanner({ plan = 'free', onDismiss }: UpgradeBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for free plan users
    if (plan !== 'free') return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DURATION_MS) {
        return; // Still within the 7-day dismissal window
      }
      // Expired -- remove stale entry
      localStorage.removeItem(DISMISS_KEY);
    }

    setVisible(true);
  }, [plan]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  return (
    <div className="relative rounded-lg p-[1px] bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500">
      <div className="relative flex items-center justify-between gap-4 rounded-lg bg-gray-950 px-4 py-3">
        {/* Subtle gradient glow behind content */}
        <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-orange-500/5 via-purple-500/5 to-orange-500/5" />

        <div className="relative flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-sm text-gray-300 truncate">
            You&apos;re on the <span className="font-semibold text-white">Free</span> plan.
            Upgrade for more sessions, higher token limits, and team features.
          </p>
        </div>

        <div className="relative flex items-center gap-2 flex-shrink-0">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-orange-500 to-purple-600 px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Upgrade
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={handleDismiss}
            className="rounded-md p-1 text-gray-500 transition-colors hover:text-gray-300 hover:bg-white/5"
            aria-label="Dismiss upgrade banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpgradeBanner;
