'use client';

import React, { useState, useMemo } from 'react';
import {
  Check,
  X,
  Sparkles,
  Zap,
  Building2,
  Crown,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAccountState, useCreateCheckoutSession } from '@/hooks/billing';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Plan definitions (mapped to task spec: Free / Pro / Team)
// ---------------------------------------------------------------------------

interface PlanFeature {
  name: string;
  free: string | boolean;
  pro: string | boolean;
  team: string | boolean;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: 'Runs per month', free: '50', pro: '1,000', team: '5,000' },
  { name: 'AI Workers', free: '3', pro: 'Unlimited', team: 'Unlimited' },
  { name: 'Workspaces', free: '1', pro: '5', team: 'Unlimited' },
  { name: 'Knowledge Base Storage', free: '100 MB', pro: '5 GB', team: '50 GB' },
  { name: 'Model Access', free: 'Basic models', pro: 'All models', team: 'All models + priority' },
  { name: 'Analytics', free: false, pro: 'Advanced', team: 'Advanced + export' },
  { name: 'Support', free: 'Community', pro: 'Priority email', team: 'Dedicated' },
  { name: 'Team Features', free: false, pro: false, team: true },
  { name: 'SSO / SAML', free: false, pro: false, team: true },
  { name: 'Audit Logs', free: false, pro: false, team: true },
];

interface PlanDef {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  popular: boolean;
  icon: React.ElementType;
  features: string[];
  disabledFeatures: string[];
  tierKey: string;
}

const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Get started with the essentials',
    popular: false,
    icon: Zap,
    tierKey: 'free',
    features: [
      '50 runs per month',
      '3 AI Workers',
      '1 workspace',
      'Basic models',
      'Community support',
    ],
    disabledFeatures: [
      'No advanced analytics',
      'No team features',
      'No SSO',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 29,
    yearlyPrice: 278, // ~20% off
    description: 'For professionals and growing teams',
    popular: true,
    icon: Crown,
    tierKey: 'tier_6_50',
    features: [
      '1,000 runs per month',
      'Unlimited AI Workers',
      '5 workspaces',
      'All models',
      'Priority email support',
      'Advanced analytics',
      '5 GB knowledge base',
    ],
    disabledFeatures: [
      'No SSO / SAML',
      'No audit logs',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPrice: 79,
    yearlyPrice: 758, // ~20% off
    description: 'For teams that need everything',
    popular: false,
    icon: Building2,
    tierKey: 'tier_25_200',
    features: [
      '5,000 runs per month',
      'Unlimited AI Workers',
      'Unlimited workspaces',
      'All models + priority access',
      'Dedicated support',
      'Advanced analytics + export',
      '50 GB knowledge base',
      'Team management',
      'SSO / SAML',
      'Audit logs',
    ],
    disabledFeatures: [],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlansPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { data: accountState, isLoading } = useAccountState();
  const checkoutMutation = useCreateCheckoutSession();

  const currentTierKey = accountState?.subscription?.tier_key || accountState?.tier?.name || 'free';

  const handleSelectPlan = (plan: PlanDef) => {
    if (plan.tierKey === currentTierKey) return;

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    checkoutMutation.mutate({
      tier_key: plan.tierKey,
      success_url: `${baseUrl}/billing/manage?upgraded=true`,
      cancel_url: `${baseUrl}/billing/plans`,
      commitment_type: isAnnual ? 'yearly' : 'monthly',
    });
  };

  const getButtonState = (plan: PlanDef) => {
    const isCurrent = plan.tierKey === currentTierKey ||
      (plan.id === 'free' && (currentTierKey === 'free' || currentTierKey === 'none'));

    if (isCurrent) return { label: 'Current Plan', disabled: true, variant: 'outline' as const };
    if (plan.id === 'team') return { label: 'Contact Sales', disabled: false, variant: 'outline' as const };
    return { label: 'Upgrade', disabled: false, variant: 'default' as const };
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex justify-center">
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[500px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn('text-sm font-medium', !isAnnual ? 'text-foreground' : 'text-muted-foreground')}>
          Monthly
        </span>
        <Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
        <span className={cn('text-sm font-medium', isAnnual ? 'text-foreground' : 'text-muted-foreground')}>
          Annual
        </span>
        {isAnnual && (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Save 20%
          </Badge>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = isAnnual ? plan.yearlyPrice : plan.monthlyPrice;
          const monthlyEquivalent = isAnnual ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice;
          const btn = getButtonState(plan);
          const Icon = plan.icon;

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col transition-shadow hover:shadow-lg',
                plan.popular && 'border-primary shadow-md ring-1 ring-primary/20'
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1 text-xs font-medium shadow-sm">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-4 pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn(
                    'p-2 rounded-lg',
                    plan.popular ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Icon className={cn('h-5 w-5', plan.popular ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 pt-0">
                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      ${monthlyEquivalent}
                    </span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                  {isAnnual && plan.monthlyPrice > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ${price} billed annually
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Button
                  variant={btn.variant}
                  disabled={btn.disabled || checkoutMutation.isPending}
                  className={cn('w-full mb-6', plan.popular && !btn.disabled && 'bg-primary hover:bg-primary/90')}
                  onClick={() => {
                    if (plan.id === 'team') {
                      window.open('mailto:sales@recoder.xyz?subject=Team Plan Inquiry', '_blank');
                    } else {
                      handleSelectPlan(plan);
                    }
                  }}
                >
                  {checkoutMutation.isPending ? 'Processing...' : btn.label}
                  {!btn.disabled && plan.id !== 'team' && <ArrowRight className="h-4 w-4 ml-1" />}
                </Button>

                {/* Features */}
                <div className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                  {plan.disabledFeatures.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <X className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Feature Comparison</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left text-sm font-medium px-4 py-3 w-[40%]">Feature</th>
                <th className="text-center text-sm font-medium px-4 py-3">Free</th>
                <th className="text-center text-sm font-medium px-4 py-3">
                  <span className="flex items-center justify-center gap-1">
                    Pro <Sparkles className="h-3 w-3 text-primary" />
                  </span>
                </th>
                <th className="text-center text-sm font-medium px-4 py-3">Team</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((feature, idx) => (
                <tr key={feature.name} className={cn(idx % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                  <td className="text-sm px-4 py-3 text-muted-foreground">{feature.name}</td>
                  {(['free', 'pro', 'team'] as const).map((tier) => {
                    const value = feature[tier];
                    return (
                      <td key={tier} className="text-center text-sm px-4 py-3">
                        {typeof value === 'boolean' ? (
                          value ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          )
                        ) : (
                          <span className="font-medium">{value}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
