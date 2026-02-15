/**
 * Token Usage Store
 *
 * Reactive store (nanostores) that holds the current token usage
 * breakdown so the UI can subscribe to changes without prop-drilling.
 */

import { atom } from 'nanostores';
import type { TokenBreakdown } from '~/lib/services/token-counter';

/** Current token breakdown (null when no data is available yet) */
export const tokenBreakdownStore = atom<TokenBreakdown | null>(null);

/** Push a new breakdown into the store */
export function updateTokenBreakdown(breakdown: TokenBreakdown) {
  tokenBreakdownStore.set(breakdown);
}

/** Reset the store (e.g. when starting a new chat) */
export function clearTokenBreakdown() {
  tokenBreakdownStore.set(null);
}
