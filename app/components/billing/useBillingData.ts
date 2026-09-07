'use client';

import { useCallback, useEffect, useState } from 'react';
import { PLANS, type PlanId } from '@/lib/pricing-config';

/**
 * Shape returned by GET /api/billing/dashboard. The server is authoritative for
 * plan/status/period — this is a read model for the billing UI only. Entitlement
 * gating is enforced server-side, never by hiding buttons here.
 */
export interface BillingSubscription {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  amount: number;
  currency: string;
}

export interface BillingUsage {
  requests: number;
  tokens: number;
  cost: number;
}

export interface BillingPaymentMethod {
  type: string;
  last4: string | null;
  expiry: string;
}

export interface BillingData {
  subscription: BillingSubscription;
  usage: BillingUsage;
  nextPayment: { date: string; amount: number } | null;
  paymentMethod: BillingPaymentMethod | null;
}

export interface UseBillingDataResult {
  data: BillingData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useBillingData(): UseBillingDataResult {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/dashboard', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (response.status === 401) {
        setError('Please sign in to view your billing details.');
        setData(null);
        return;
      }

      const json = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: BillingData; error?: string }
        | null;

      if (!response.ok || !json?.success || !json.data) {
        setError(json?.error || 'Unable to load billing details. Please try again.');
        setData(null);
        return;
      }

      setData(json.data);
    } catch {
      setError('Unable to load billing details. Please check your connection and try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export function planDisplayName(planId: string): string {
  return PLANS[planId as PlanId]?.name ?? (planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : 'Free');
}

export function formatMoney(amount: number, currency: string): string {
  const safeCurrency = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency }).format(amount || 0);
  } catch {
    return `$${(amount || 0).toFixed(2)}`;
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export interface StatusLabel {
  text: string;
  className: string;
}

/**
 * Human, non-emoji status pill. `cancelAtPeriodEnd` takes visual priority so a
 * user who scheduled a cancellation always sees it.
 */
export function statusLabel(sub: BillingSubscription): StatusLabel {
  const status = (sub.status || '').toLowerCase();
  if (sub.cancelAtPeriodEnd || status === 'cancelling') {
    return { text: 'Cancels at period end', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
  }
  switch (status) {
    case 'active':
      return { text: 'Active', className: 'bg-green-500/10 text-green-300 border-green-500/20' };
    case 'trialing':
      return { text: 'Trial', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' };
    case 'past_due':
    case 'unpaid':
      return { text: 'Payment due', className: 'bg-red-500/10 text-red-300 border-red-500/20' };
    case 'cancelled':
    case 'canceled':
      return { text: 'Cancelled', className: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20' };
    default:
      return { text: status ? status : 'Unknown', className: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20' };
  }
}

export function isPaidPlan(planId: string): boolean {
  return planId !== 'free' && Boolean(PLANS[planId as PlanId]);
}
