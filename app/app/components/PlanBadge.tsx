'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { PlanId } from '@/lib/pricing-config';

interface PlanBadgeProps {
  plan: PlanId;
  showUpgradeLink?: boolean;
}

const PLAN_STYLES: Record<PlanId, { bg: string; text: string; border: string; dot: string }> = {
  free: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    border: 'border-gray-500/20',
    dot: 'bg-gray-400',
  },
  weekly: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
  },
  monthly: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/20',
    dot: 'bg-orange-400',
  },
  pro: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    dot: 'bg-purple-400',
  },
  enterprise: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-400',
  },
};

const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Free',
  weekly: 'Weekly',
  monthly: 'Monthly',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export function PlanBadge({ plan, showUpgradeLink = true }: PlanBadgeProps) {
  const style = PLAN_STYLES[plan] ?? PLAN_STYLES.free;
  const label = PLAN_LABELS[plan] ?? 'Free';
  const isFree = plan === 'free';

  return (
    <span className="inline-flex items-center gap-2">
      {/* Badge pill */}
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} ${style.border}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {label}
      </span>

      {/* Optional upgrade link for free users */}
      {isFree && showUpgradeLink && (
        <Link
          href="/pricing"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-purple-400 transition-colors hover:text-purple-300"
        >
          Upgrade
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      )}
    </span>
  );
}

export default PlanBadge;
