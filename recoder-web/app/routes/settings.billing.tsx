/**
 * Billing Settings Route
 * Renders the subscription dashboard inside the settings layout
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { SubscriptionDashboard } from '~/components/subscription/SubscriptionDashboard';

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function loader({ context }: LoaderFunctionArgs) {
  const env = (context as unknown as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  const nodeEnv = env?.NODE_ENV || process.env.NODE_ENV || 'development';
  const billingActionsEnabled = parseBoolean(env?.BILLING_ACTIONS_ENABLED || process.env.BILLING_ACTIONS_ENABLED);

  return json({
    billingActionsEnabled,
    readOnlyMode: nodeEnv === 'production' && !billingActionsEnabled,
  });
}

export default function BillingSettingsPage() {
  const { readOnlyMode } = useLoaderData<typeof loader>();
  return <SubscriptionDashboard readOnlyMode={readOnlyMode} />;
}
