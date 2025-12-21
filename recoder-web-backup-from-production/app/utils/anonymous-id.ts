/**
 * Anonymous ID utility for tracking users before authentication
 * Stored in localStorage to persist across sessions
 */

export function getOrCreateAnonymousId(): string {
  // Server-side rendering check
  if (typeof window === 'undefined') {
    return '';
  }

  const key = 'bolt_anonymous_id';
  let id = localStorage.getItem(key);

  if (!id) {
    // Generate unique anonymous ID
    id = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(key, id);
    console.log('🆔 Created new anonymous ID:', id);
  }

  return id;
}

/**
 * Get current anonymous ID without creating a new one
 */
export function getAnonymousId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem('bolt_anonymous_id');
}

/**
 * Clear anonymous ID (when user signs up)
 */
export function clearAnonymousId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('bolt_anonymous_id');
  console.log('🗑️ Cleared anonymous ID');
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

    const { claimedCount } = await response.json();
    console.log(`✅ Claimed ${claimedCount} anonymous sessions for user ${userId}`);
    
    // Clear anonymous ID after claiming
    clearAnonymousId();
    
    return claimedCount;
  } catch (error) {
    console.error('❌ Failed to claim anonymous sessions:', error);
    return 0;
  }
}
