/**
 * Awareness Module for Real-time Collaboration
 *
 * Provides local awareness state management, color generation,
 * and utilities for tracking user presence.
 */

import type { Awareness } from 'y-protocols/awareness';
import type { UserInfo, CursorPosition, SelectionRange } from './yjs-provider';

// User presence status
export type PresenceStatus = 'active' | 'idle' | 'away';

// Extended user presence
export interface UserPresence {
  user: UserInfo;
  clientId: number;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  currentFile?: string;
  status: PresenceStatus;
  lastActivity: number;
}

// Awareness state structure (what's stored in Yjs awareness)
export interface AwarenessState {
  user: UserInfo;
  cursor?: CursorPosition | null;
  selection?: SelectionRange | null;
  currentFile?: string;
  status?: PresenceStatus;
  lastActivity?: number;
}

// Idle timeout thresholds (matching server)
const IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const AWAY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Color palette for user identification
const USER_COLORS = [
  '#FF6B6B', // Coral Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Pastel Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
  '#F8B500', // Amber
  '#00CED1', // Dark Cyan
  '#FF69B4', // Hot Pink
  '#32CD32', // Lime Green
  '#FF7F50', // Coral
  '#9B59B6', // Purple
  '#E74C3C', // Red
  '#3498DB', // Blue
  '#2ECC71', // Emerald
  '#F39C12', // Orange
];

/**
 * Generate a consistent color for a user based on their ID
 * Uses hash function to ensure same user always gets same color
 */
export function generateUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

/**
 * Generate a lighter version of a color (for selection highlights)
 */
export function getLightColor(color: string, opacity: number = 0.3): string {
  // Convert hex to RGBA
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get initials from a user name
 */
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Determine user status based on last activity
 */
export function getUserStatus(lastActivity: number): PresenceStatus {
  const now = Date.now();
  const elapsed = now - lastActivity;

  if (elapsed > AWAY_TIMEOUT) {
    return 'away';
  } else if (elapsed > IDLE_TIMEOUT) {
    return 'idle';
  }
  return 'active';
}

/**
 * Convert awareness states to UserPresence array
 */
export function awarenessStatesToPresence(
  awareness: Awareness,
  excludeLocalUser: boolean = true
): UserPresence[] {
  const states = awareness.getStates();
  const localClientId = awareness.clientID;
  const presences: UserPresence[] = [];

  states.forEach((state: { [x: string]: any }, clientId: number) => {
    const awarenessState = state as AwarenessState;
    if (excludeLocalUser && clientId === localClientId) return;
    if (!awarenessState.user) return;

    const lastActivity = awarenessState.lastActivity || Date.now();

    presences.push({
      user: awarenessState.user,
      clientId,
      cursor: awarenessState.cursor || undefined,
      selection: awarenessState.selection || undefined,
      currentFile: awarenessState.currentFile,
      status: awarenessState.status || getUserStatus(lastActivity),
      lastActivity,
    });
  });

  return presences;
}

/**
 * Get users currently editing a specific file
 */
export function getUsersInFile(
  awareness: Awareness,
  filePath: string,
  excludeLocalUser: boolean = true
): UserPresence[] {
  const allUsers = awarenessStatesToPresence(awareness, excludeLocalUser);
  return allUsers.filter((user) => user.currentFile === filePath);
}

/**
 * Manager class for local awareness state
 */
export class LocalAwarenessManager {
  private awareness: Awareness;
  private user: UserInfo;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityTime: number = Date.now();

  constructor(awareness: Awareness, user: UserInfo) {
    this.awareness = awareness;
    this.user = user;

    // Initialize local state
    this.setLocalState({
      user,
      status: 'active',
      lastActivity: Date.now(),
    });

    // Start activity tracking
    this.startActivityTracking();
  }

  /**
   * Set the complete local awareness state
   */
  setLocalState(state: Partial<AwarenessState>): void {
    const currentState = this.awareness.getLocalState() as AwarenessState | null;
    this.awareness.setLocalState({
      ...currentState,
      ...state,
    });
  }

  /**
   * Update cursor position
   */
  setCursor(cursor: CursorPosition | null): void {
    this.markActivity();
    this.awareness.setLocalStateField('cursor', cursor);
  }

  /**
   * Update selection range
   */
  setSelection(selection: SelectionRange | null): void {
    this.markActivity();
    this.awareness.setLocalStateField('selection', selection);
  }

  /**
   * Update current file being edited
   */
  setCurrentFile(filePath: string): void {
    this.markActivity();
    this.awareness.setLocalStateField('currentFile', filePath);
  }

  /**
   * Mark user as active (called on user input)
   */
  markActivity(): void {
    this.lastActivityTime = Date.now();
    this.awareness.setLocalStateField('lastActivity', this.lastActivityTime);
    this.awareness.setLocalStateField('status', 'active');
  }

  /**
   * Start automatic activity status tracking
   */
  private startActivityTracking(): void {
    if (this.activityTimer) return;

    this.activityTimer = setInterval(() => {
      const status = getUserStatus(this.lastActivityTime);
      const currentStatus = (this.awareness.getLocalState() as AwarenessState | null)?.status;

      if (currentStatus !== status) {
        this.awareness.setLocalStateField('status', status);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop activity tracking
   */
  stopActivityTracking(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  /**
   * Clear local awareness state
   */
  clear(): void {
    this.stopActivityTracking();
    this.awareness.setLocalState(null);
  }

  /**
   * Get current local state
   */
  getLocalState(): AwarenessState | null {
    return this.awareness.getLocalState() as AwarenessState | null;
  }

  /**
   * Get all remote states
   */
  getRemoteStates(): UserPresence[] {
    return awarenessStatesToPresence(this.awareness, true);
  }

  /**
   * Subscribe to awareness changes
   */
  subscribe(callback: (presences: UserPresence[]) => void): () => void {
    const handler = () => {
      callback(this.getRemoteStates());
    };

    this.awareness.on('change', handler);
    return () => this.awareness.off('change', handler);
  }
}

/**
 * Create a gravatar URL for an email
 */
export function getGravatarUrl(email: string, size: number = 32): string {
  const normalized = email.toLowerCase().trim();
  // Simple hash for gravatar (MD5 would be ideal but this is a fallback)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const chr = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const hashString = Math.abs(hash).toString(16).padStart(32, '0');
  return `https://www.gravatar.com/avatar/${hashString}?d=identicon&s=${size}`;
}

/**
 * Create a UserInfo object from basic user data
 */
export function createUserInfo(
  id: string,
  name?: string,
  email?: string,
  avatar?: string
): UserInfo {
  const displayName = name || email?.split('@')[0] || 'Anonymous';

  return {
    id,
    name: displayName,
    email,
    color: generateUserColor(id),
    avatar: avatar || (email ? getGravatarUrl(email) : undefined),
  };
}

/**
 * Compare two cursor positions
 */
export function cursorEquals(a?: CursorPosition, b?: CursorPosition): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.line === b.line && a.column === b.column;
}

/**
 * Compare two selection ranges
 */
export function selectionEquals(a?: SelectionRange, b?: SelectionRange): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return cursorEquals(a.anchor, b.anchor) && cursorEquals(a.head, b.head);
}

/**
 * Check if a selection is empty (cursor only)
 */
export function isEmptySelection(selection?: SelectionRange): boolean {
  if (!selection) return true;
  return cursorEquals(selection.anchor, selection.head);
}

export default LocalAwarenessManager;
