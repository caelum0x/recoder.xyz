import { requireSessionAccessToken } from '@/lib/auth/session-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionStatus {
  tier: 'free' | 'pro' | 'enterprise';
  active: boolean;
  planName: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// Use the local nginx stub (same-origin) which returns subscription data
const SUBSCRIPTION_URL = '/api/user/subscription';

/**
 * Fetch the current user's subscription status from the central
 * recoder.xyz auth/billing service.
 */
export async function getSubscription(): Promise<SubscriptionStatus> {
  const token = await requireSessionAccessToken();

  const res = await fetch(SUBSCRIPTION_URL, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(body || `Failed to fetch subscription: ${res.status}`);
  }

  return res.json();
}
