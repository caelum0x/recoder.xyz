import { atom } from 'nanostores';

/**
 * Mobile sheet state management
 * Converted from Jotai atoms to nanostores
 */

/**
 * Controls whether the mobile sheet/drawer is open
 * Used for responsive mobile navigation and panels
 */
export const isMobileSheetOpen = atom<boolean>(false);

/**
 * Open the mobile sheet
 */
export function openMobileSheet(): void {
  isMobileSheetOpen.set(true);
}

/**
 * Close the mobile sheet
 */
export function closeMobileSheet(): void {
  isMobileSheetOpen.set(false);
}

/**
 * Toggle the mobile sheet open/closed state
 */
export function toggleMobileSheet(): void {
  isMobileSheetOpen.set(!isMobileSheetOpen.get());
}

/**
 * Set the mobile sheet state directly
 */
export function setMobileSheetOpen(open: boolean): void {
  isMobileSheetOpen.set(open);
}
