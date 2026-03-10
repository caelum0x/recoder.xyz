'use client';

import React from 'react';
import {
  ArrowRight,
  Check,
  Lock,
  Zap,
  Crown,
  AlertTriangle,
  Gauge,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAccountState, useCreateCheckoutSession } from '@/hooks/billing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpgradeContext =
  | 'agent_limit_reached'
  | 'run_limit_reached'
  | 'feature_locked'
  | 'storage_limit'
  | 'generic';

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: UpgradeContext;
  featureName?: string;
}

// ---------------------------------------------------------------------------
// Context config
// ---------------------------------------------------------------------------

const CONTEXT_CONFIG: Record<UpgradeContext, {
  icon: React.ElementType;
  title: string;
  description: string;
  iconClassName: string;
}> = {
  agent_limit_reached: {
    icon: Bot,
    title: 'Agent limit reached',
    description: 'You have reached the maximum number of AI Workers on your current plan. Upgrade to create more.',
    iconClassName: 'text-purple-500',
  },
  run_limit_reached: {
    icon: Gauge,
    title: 'Run limit reached',
    description: 'You have used all your runs for this period. Upgrade for more capacity.',
    iconClassName: 'text-orange-500',
  },
  feature_locked: {
    icon: Lock,
    title: 'Feature locked',
    description: 'This feature is not available on your current plan. Upgrade to unlock it.',
    iconClassName: 'text-blue-500',
  },
  storage_limit: {
    icon: AlertTriangle,
    title: 'Storage limit reached',
    description: 'Your knowledge base storage is full. Upgrade for more space.',
    iconClassName: 'text-yellow-500',
  },
  generic: {
    icon: Crown,
    title: 'Upgrade your plan',
    description: 'Get more runs, agents, and features with a paid plan.',
    iconClassName: 'text-primary',
  },
};

const PRO_HIGHLIGHTS = [
  '1,000 runs per month',
  'Unlimited AI Workers',
  '5 workspaces',
  'All AI models',
  'Priority support',
  'Advanced analytics',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpgradeDialog({
  open,
  onOpenChange,
  context = 'generic',
  featureName,
}: UpgradeDialogProps) {
  const router = useRouter();
  const { data: accountState } = useAccountState();
  const checkoutMutation = useCreateCheckoutSession();

  const ctx = CONTEXT_CONFIG[context];
  const Icon = ctx.icon;
  const currentPlan = accountState?.tier?.display_name || 'Free';

  const handleUpgrade = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    checkoutMutation.mutate({
      tier_key: 'tier_6_50', // Pro tier
      success_url: `${baseUrl}/billing/manage?upgraded=true`,
      cancel_url: `${baseUrl}/billing/plans`,
      commitment_type: 'monthly',
    });
  };

  const handleLearnMore = () => {
    onOpenChange(false);
    router.push('/billing/plans');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn('p-2.5 rounded-xl bg-background shadow-sm border')}>
                <Icon className={cn('h-5 w-5', ctx.iconClassName)} />
              </div>
              <div>
                <DialogTitle className="text-lg">{ctx.title}</DialogTitle>
                {featureName && (
                  <Badge variant="secondary" className="mt-1 text-xs">{featureName}</Badge>
                )}
              </div>
            </div>
            <DialogDescription className="text-sm">
              {ctx.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Plan comparison */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* Current */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Current</p>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-muted-foreground" />
                {currentPlan}
              </p>
            </div>

            {/* Target */}
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-xs text-primary mb-1">Upgrade to</p>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-primary" />
                Pro
                <span className="text-muted-foreground font-normal">$29/mo</span>
              </p>
            </div>
          </div>

          {/* What you get */}
          <p className="text-sm font-medium mb-3">What you will get:</p>
          <div className="space-y-2.5">
            {PRO_HIGHLIGHTS.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div className="p-0.5 rounded-full bg-green-100 dark:bg-green-900/30">
                  <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/20 gap-2">
          <Button variant="ghost" onClick={handleLearnMore} className="text-sm">
            Compare all plans
          </Button>
          <Button
            onClick={handleUpgrade}
            disabled={checkoutMutation.isPending}
            className="gap-1.5"
          >
            {checkoutMutation.isPending ? 'Processing...' : 'Upgrade Now'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
