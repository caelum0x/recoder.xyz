/**
 * Anonymous ID utility for tracking users before authentication
 * Stored in localStorage to persist across sessions
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AnonymousId');
const STORAGE_KEY = 'recoder_anonymous_id';
const COOKIE_NAME = 'recoder_anonymous_id';

function getCookieDomain(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hostname = window.location.hostname;
  if (hostname === 'recoder.xyz' || hostname.endsWith('.recoder.xyz')) {
    return '.recoder.xyz';
  }

  return null;
}

function writeAnonymousCookie(value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') {
    return;
  }

  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];

  const cookieDomain = getCookieDomain();
  if (cookieDomain) {
    parts.push(`Domain=${cookieDomain}`);
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }

  document.cookie = parts.join('; ');
}

export function getOrCreateAnonymousId(): string {
  // Server-side rendering check
  if (typeof window === 'undefined') {
    return '';
  }

  let id = localStorage.getItem(STORAGE_KEY);

  if (!id) {
    // Generate unique anonymous ID
    id = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(STORAGE_KEY, id);
    logger.info('🆔 Created new anonymous ID:', id);
  }

  writeAnonymousCookie(id, 31536000);

  return id;
}

/**
 * Get current anonymous ID without creating a new one
 */
export function getAnonymousId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const id = localStorage.getItem(STORAGE_KEY);
  if (id) {
    writeAnonymousCookie(id, 31536000);
  }
  return id;
}

/**
 * Clear anonymous ID (when user signs up)
 */
export function clearAnonymousId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  writeAnonymousCookie('', 0);
  logger.info('🗑️ Cleared anonymous ID');
}

/**
 * Transfer anonymous sessions to authenticated user
 */
export async function claimAnonymousSessions(userId: string): Promise<number> {
  const anonymousId = getAnonymousId();
  
  if (!anonymousId) {
    return 0;
  }

  try {
    const response = await fetch('/api/chat-history/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonymousId, userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to claim sessions');
    }

    const result = await response.json() as { claimedCount: number };
    logger.info(`✅ Claimed ${result.claimedCount} anonymous sessions for user ${userId}`);
    
    // Clear anonymous ID after claiming
    clearAnonymousId();
    
    return result.claimedCount;
  } catch (error) {
    logger.error('❌ Failed to claim anonymous sessions:', error);
    return 0;
  }
}
