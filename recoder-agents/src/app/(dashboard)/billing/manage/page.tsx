'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  Calendar,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  Download,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  useAccountState,
  useCancelSubscription,
  useReactivateSubscription,
  useCreatePortalSession,
} from '@/hooks/billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: {
      label: 'Active',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    canceled: {
      label: 'Canceled',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
    past_due: {
      label: 'Past Due',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    },
    trialing: {
      label: 'Trial',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    no_subscription: {
      label: 'No Plan',
      className: 'bg-muted text-muted-foreground',
    },
  };

  const cfg = map[status] || map.no_subscription;

  return (
    <Badge variant="secondary" className={cn('text-xs font-medium', cfg!.className)}>
      {cfg!.label}
    </Badge>
  );
}

function formatDate(ts: number | string | null | undefined): string {
  if (!ts) return '--';
  const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Cancel Dialog
// ---------------------------------------------------------------------------

function CancelDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string, comment: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Cancel Subscription
          </DialogTitle>
          <DialogDescription>
            Your plan will remain active until the end of your current billing period. After that, you will be downgraded to the Free plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Why are you canceling?</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="too_expensive">Too expensive</SelectItem>
                <SelectItem value="not_using_enough">Not using it enough</SelectItem>
                <SelectItem value="switching">Switching to a competitor</SelectItem>
                <SelectItem value="missing_features">Missing features I need</SelectItem>
                <SelectItem value="technical_issues">Technical issues</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Additional comments <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us how we can improve..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Keep Subscription
          </Button>
          <Button
            variant="destructive"
            disabled={!reason || isPending}
            onClick={() => onConfirm(reason!, comment)}
          >
            {isPending ? 'Canceling...' : 'Cancel Subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ManageSubscriptionPage() {
  const { data: accountState, isLoading } = useAccountState();
  const cancelMutation = useCancelSubscription();
  const reactivateMutation = useReactivateSubscription();
  const portalMutation = useCreatePortalSession();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const sub = accountState?.subscription;
  const limits = accountState?.limits;
  const credits = accountState?.credits;
  const tier = accountState?.tier;
  const status = sub?.status || 'no_subscription';
  const isCancelled = sub?.is_cancelled || sub?.cancel_at_period_end;

  // Usage bars data
  const usageItems = [
    {
      label: 'Credits Used',
      current: (tier?.monthly_credits || 0) - (credits?.total || 0),
      max: tier?.monthly_credits || 0,
      suffix: 'credits',
    },
    {
      label: 'AI Workers',
      current: limits?.ai_worker_count?.current_count || 0,
      max: limits?.ai_worker_count?.limit || 0,
      suffix: 'workers',
    },
    {
      label: 'Concurrent Runs',
      current: limits?.concurrent_runs?.running_count || 0,
      max: limits?.concurrent_runs?.limit || 0,
      suffix: 'runs',
    },
  ];

  const handleCancel = (reason: string, comment: string) => {
    const feedback = comment ? `${reason}: ${comment}` : reason;
    cancelMutation.mutate({ feedback }, {
      onSuccess: () => setCancelOpen(false),
    });
  };

  const handleManagePayment = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    portalMutation.mutate({ return_url: `${baseUrl}/billing/manage` });
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {tier?.display_name || 'Free'}
              <StatusBadge status={status} />
            </CardTitle>
            <CardDescription className="mt-1">
              {sub?.billing_period === 'yearly' || sub?.billing_period === 'yearly_commitment'
                ? 'Annual billing'
                : 'Monthly billing'}
              {sub?.current_period_end && (
                <span> &middot; Next billing date: {formatDate(sub.current_period_end)}</span>
              )}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              ${tier?.monthly_credits ? Math.round(tier.monthly_credits / 100) : 0}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
          </div>
        </CardHeader>

        {isCancelled && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30">
              <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-orange-700 dark:text-orange-400">
                  Subscription canceled
                </p>
                <p className="text-orange-600 dark:text-orange-400/80">
                  Your plan will end on {formatDate(sub?.cancellation_effective_date || sub?.current_period_end)}.
                  You can reactivate anytime before then.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reactivateMutation.mutate()}
                disabled={reactivateMutation.isPending}
              >
                {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate'}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Usage This Period */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage This Period</CardTitle>
          <CardDescription>Your resource usage for the current billing cycle.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {usageItems.map((item) => {
              const UNLIMITED = 100_000;
              const isUnlimited = item.max >= UNLIMITED;
              const pct = isUnlimited ? 0 : item.max > 0 ? Math.min((item.current / item.max) * 100, 100) : 0;
              const isHigh = pct >= 80;

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className={cn('font-medium', isHigh && 'text-orange-600 dark:text-orange-400')}>
                      {item.current} / {isUnlimited ? 'Unlimited' : item.max} {item.suffix}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className={cn('h-2', isHigh && '[&>div]:bg-orange-500')}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Payment Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Managed by Stripe</p>
                <p className="text-xs text-muted-foreground">
                  Update your payment method through the secure Stripe portal.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManagePayment}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? 'Opening...' : 'Update'}
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3">
            <Button variant="outline" className="justify-between h-auto py-3" asChild>
              <Link href="/billing/plans">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  <span>Change Plan</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Button>

            <Button
              variant="outline"
              className="justify-between h-auto py-3"
              onClick={handleManagePayment}
              disabled={portalMutation.isPending}
            >
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>Download Invoice</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>

            {!isCancelled && status === 'active' && (
              <Button
                variant="outline"
                className="justify-between h-auto py-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10"
                onClick={() => setCancelOpen(true)}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Cancel Subscription</span>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        isPending={cancelMutation.isPending}
      />
    </div>
  );
}
