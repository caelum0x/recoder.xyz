'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X,
  Check,
  ArrowRight,
  Sparkles,
  Zap,
  Users,
  Key,
  Headphones,
  Code,
} from 'lucide-react';
import { PLANS, type PlanId, getNextPlan, formatPrice } from '@/lib/pricing-config';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: PlanId;
  /** Short explanation of what triggered the modal (e.g. "session limit reached") */
  trigger?: string;
}

/** Features we highlight in the comparison table */
const COMPARISON_ROWS: {
  label: string;
  icon: React.ReactNode;
  getValue: (planId: PlanId) => string;
}[] = [
  {
    label: 'Workspaces',
    icon: <Zap className="w-4 h-4" />,
    getValue: (id) => {
      const count = PLANS[id].limits.workspaces;
      return count >= 999 ? 'Unlimited' : `${count}`;
    },
  },
  {
    label: 'Connected agents',
    icon: <Code className="w-4 h-4" />,
    getValue: (id) => {
      const count = PLANS[id].limits.connectedAgents;
      return count >= 999 ? 'Unlimited' : `${count}`;
    },
  },
  {
    label: 'Artifact retention',
    icon: <Users className="w-4 h-4" />,
    getValue: (id) => {
      const days = PLANS[id].limits.artifactRetentionDays;
      return days >= 365 ? '1 year+' : `${days} days`;
    },
  },
  {
    label: 'Approval workflows',
    icon: <Key className="w-4 h-4" />,
    getValue: (id) => PLANS[id].limits.approvalWorkflows,
  },
  {
    label: 'Preview deploys / month',
    icon: <Headphones className="w-4 h-4" />,
    getValue: (id) => {
      const count = PLANS[id].limits.previewDeploysPerMonth;
      return count >= 999 ? 'Unlimited' : `${count}`;
    },
  },
];

export function UpgradeModal({
  isOpen,
  onClose,
  currentPlan = 'free',
  trigger,
}: UpgradeModalProps) {
  const [animateIn, setAnimateIn] = useState(false);

  const nextPlanId = getNextPlan(currentPlan);
  const current = PLANS[currentPlan];
  const recommended = nextPlanId ? PLANS[nextPlanId] : null;

  // Animate entrance
  useEffect(() => {
    if (isOpen) {
      // Small delay so the backdrop renders first, then content slides in
      const t = setTimeout(() => setAnimateIn(true), 20);
      return () => clearTimeout(t);
    }
    setAnimateIn(false);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          animateIn ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Modal panel */}
      <div
        className={`relative w-full max-w-lg rounded-2xl border border-white/10 bg-gray-950/90 backdrop-blur-xl shadow-2xl transition-all duration-300 ${
          animateIn ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
        }`}
      >
        {/* Decorative gradient top edge */}
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md p-1 text-gray-500 transition-colors hover:text-gray-300 hover:bg-white/5"
          aria-label="Close upgrade modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/20 to-purple-600/20">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Upgrade Your Plan</h2>
              <p className="text-sm text-gray-400">
                {trigger || 'Unlock more power and features'}
              </p>
            </div>
          </div>

          {/* Current plan indicator */}
          <div className="mt-5 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current plan</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{current.name}</span>
              <span className="text-sm text-gray-400">{formatPrice(current)}</span>
            </div>
          </div>

          {/* Recommended plan */}
          {recommended && (
            <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-500/[0.05] p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-purple-400 uppercase tracking-wide mb-1">Recommended</p>
                  <span className="text-sm font-semibold text-white">{recommended.name}</span>
                </div>
                <span className="text-sm font-semibold text-purple-300">
                  {formatPrice(recommended)}
                </span>
              </div>
              <p className="text-xs text-gray-400">{recommended.description}</p>
            </div>
          )}

          {/* Feature comparison */}
          {recommended && (
            <div className="mt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                What you get with {recommended.name}
              </p>
              <div className="space-y-2">
                {COMPARISON_ROWS.map((row) => {
                  const currentVal = row.getValue(currentPlan);
                  const nextVal = row.getValue(nextPlanId!);
                  const isUpgrade = currentVal !== nextVal;

                  return (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-md px-3 py-2 bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-2 text-gray-400">
                        {row.icon}
                        <span className="text-sm">{row.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500 line-through">{currentVal}</span>
                        {isUpgrade && (
                          <>
                            <ArrowRight className="w-3 h-3 text-gray-600" />
                            <span className="font-medium text-purple-300">{nextVal}</span>
                          </>
                        )}
                        {!isUpgrade && (
                          <span className="text-gray-300">
                            <Check className="w-3.5 h-3.5 text-green-500 inline" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              onClick={onClose}
            >
              Upgrade Now
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:text-gray-200 hover:bg-white/5"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpgradeModal;
