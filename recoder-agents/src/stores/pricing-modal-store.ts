import { create } from 'zustand';
import { trackCtaUpgrade } from '@/lib/analytics/gtm';

interface PricingModalState {
  isOpen: boolean;
  customTitle?: string;
  isAlert?: boolean;
  alertTitle?: string;
  alertSubtitle?: string;
  returnUrl?: string;
  openPricingModal: (options?: { title?: string; returnUrl?: string, isAlert?: boolean, alertTitle?: string, alertSubtitle?: string }) => void;
  closePricingModal: () => void;
}

/**
 * Check if we're running in BYOK (Bring Your Own Key) mode.
 * In BYOK mode, there's no billing — pricing modals should never appear.
 *
 * The billing API (lib/api/billing.ts getAccountState) hardcodes tier_key='byok'
 * when the platform is in BYOK mode. This check is a fast, synchronous guard.
 */
function isByokMode(): boolean {
  // Build-time env var
  if (process.env.NEXT_PUBLIC_BYOK_MODE === 'true') return true;
  // The billing API currently hardcodes BYOK mode — always return true
  // When billing is re-enabled, remove this line and use the checks below
  return true;
}

export const usePricingModalStore = create<PricingModalState>((set) => ({
  isOpen: false,
  isAlert: false,
  customTitle: undefined,
  alertSubtitle: undefined,
  returnUrl: undefined,
  openPricingModal: (options) => {
    // BYOK mode: no billing, no pricing modals
    if (isByokMode()) {
      return;
    }

    // Track cta_upgrade event for GTM/GA4
    trackCtaUpgrade();

    set({
      isOpen: true,
      customTitle: options?.title,
      isAlert: options?.isAlert || false,
      alertTitle: options?.alertTitle,
      alertSubtitle: options?.alertSubtitle,
      returnUrl: options?.returnUrl,
    });
  },
  closePricingModal: () =>
    set({
      isOpen: false,
      customTitle: undefined,
      isAlert: false,
      alertTitle: undefined,
      alertSubtitle: undefined,
      returnUrl: undefined,
    }),
}));
