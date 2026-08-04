/**
 * Payment provider registry (C6): one place where webhook and billing routes
 * resolve a PaymentProvider by name. Unknown or unconfigured providers come
 * back as degraded stubs — resolution itself never throws.
 */

import { getCreemProvider } from '@/lib/services/creem.service';
import { getDodoProvider } from './dodo-provider';
import { getPaddleProvider } from './paddle-provider';
import { degradedProvider, type PaymentProvider } from './provider';

export const PROVIDER_NAMES = ['creem', 'dodo', 'paddle'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function getProvider(name: string): PaymentProvider {
  switch (name) {
    case 'creem':
      return getCreemProvider();
    case 'dodo':
      return getDodoProvider();
    case 'paddle':
      return getPaddleProvider();
    default:
      return degradedProvider(name, `unknown_provider:${name}`);
  }
}
