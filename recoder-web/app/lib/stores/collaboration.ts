/**
 * Collaboration Store
 *
 * Nanostores-based global state management for real-time collaboration.
 * Tracks presence, activity, and collaboration settings.
 */

import { atom, map, computed } from 'nanostores';
import type { UserInfo, CursorPosition, SelectionRange, ConnectionState } from '../collaboration/yjs-provider';

// ============================================================================
// Types
// ============================================================================

/** User presence status */
export type PresenceStatus = 'active' | 'idle' | 'away' | 'offline';

/** A collaborator's presence information */
export interface CollaboratorPresence {
  user: UserInfo;
  clientId: number;
  status: PresenceStatus;
  currentFile?: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  lastActivity: number;
  joinedAt: number;
}

/** Activity event types */
export type ActivityType =
  | 'user_joined'
  | 'user_left'
  | 'file_edited'
  | 'file_created'
  | 'file_deleted'
  | 'file_renamed'
  | 'cursor_moved'
  | 'selection_changed'
  | 'comment_added'
  | 'chat_message';

/** Activity feed item */
export interface ActivityItem {
  id: string;
  type: ActivityType;
  user: UserInfo;
  timestamp: number;
  data?: {
    filePath?: string;
    oldPath?: string;
    newPath?: string;
    message?: string;
    line?: number;
  };
}

/** Collaboration settings */
export interface CollaborationSettings {
  enabled: boolean;
  showCursors: boolean;
  showSelections: boolean;
  showPresence: boolean;
  showActivity: boolean;
  soundNotifications: boolean;
  cursorLabelDuration: number; // ms, 0 = always show
}

/** Invite/share configuration */
export interface ShareConfig {
  projectId: string;
  shareLink?: string;
  inviteEmails: string[];
  permissions: 'view' | 'edit' | 'admin';
  expiresAt?: number;
}

// ============================================================================
// Stores
// ============================================================================

/** Current project ID for collaboration */
export const collaborationProjectId = atom<string | null>(null);

/** Connection state to the collaboration server */
export const collaborationConnection = atom<ConnectionState>('disconnected');

/** Whether the document is synced with the server */
export const collaborationSynced = atom<boolean>(false);

/** Current user info */
export const currentCollaborator = atom<UserInfo | null>(null);

/** All collaborators in the current project (keyed by clientId) */
export const collaborators = map<Record<number, CollaboratorPresence>>({});

/** Activity feed items (most recent first) */
export const activityFeed = atom<ActivityItem[]>([]);

/** Maximum activity feed items to keep */
const MAX_ACTIVITY_ITEMS = 100;

/** Collaboration settings */
export const collaborationSettings = atom<CollaborationSettings>({
  enabled: true,
  showCursors: true,
  showSelections: true,
  showPresence: true,
  showActivity: true,
  soundNotifications: false,
  cursorLabelDuration: 3000,
});

/** Share dialog state */
export const shareDialogOpen = atom<boolean>(false);

/** Current share configuration */
export const shareConfig = atom<ShareConfig | null>(null);

/** Unread activity count (for badges) */
export const unreadActivityCount = atom<number>(0);

// ============================================================================
// Computed Values
// ============================================================================

/** List of all collaborators (excluding current user) */
export const collaboratorsList = computed(
  [collaborators, currentCollaborator],
  (collabs, current) => {
    const list = Object.values(collabs);
    if (!current) return list;
    return list.filter((c) => c.user.id !== current.id);
  }
);

/** Collaborators currently viewing the same file */
export const collaboratorsInCurrentFile = atom<CollaboratorPresence[]>([]);

/** Online collaborator count */
export const onlineCount = computed(collaborators, (collabs) => {
  return Object.values(collabs).filter(
    (c) => c.status === 'active' || c.status === 'idle'
  ).length;
});

/** Active collaborator count (not idle or away) */
export const activeCount = computed(collaborators, (collabs) => {
  return Object.values(collabs).filter((c) => c.status === 'active').length;
});

/** Check if collaboration is available */
export const isCollaborationAvailable = computed(
  [collaborationProjectId, collaborationConnection, collaborationSettings],
  (projectId, connection, settings) => {
    return (
      settings.enabled &&
      !!projectId &&
      (connection === 'connected' || connection === 'connecting')
    );
  }
);

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialize collaboration for a project
 */
export function initializeCollaboration(projectId: string, user: UserInfo): void {
  collaborationProjectId.set(projectId);
  currentCollaborator.set(user);
  collaborators.set({});
  activityFeed.set([]);
  unreadActivityCount.set(0);
  console.log('[CollabStore] Initialized for project:', projectId);
}

/**
 * Update connection state
 */
export function setConnectionState(state: ConnectionState): void {
  collaborationConnection.set(state);
}

/**
 * Update sync state
 */
export function setSyncState(synced: boolean): void {
  collaborationSynced.set(synced);
}

/**
 * Add or update a collaborator's presence
 */
export function updateCollaboratorPresence(
  clientId: number,
  presence: Partial<CollaboratorPresence> & { user: UserInfo }
): void {
  const current = collaborators.get();
  const existing = current[clientId];

  const updated: CollaboratorPresence = {
    user: presence.user,
    clientId,
    status: presence.status ?? 'active',
    currentFile: presence.currentFile,
    cursor: presence.cursor,
    selection: presence.selection,
    lastActivity: presence.lastActivity ?? Date.now(),
    joinedAt: existing?.joinedAt ?? Date.now(),
  };

  collaborators.setKey(clientId, updated);

  // Add activity if this is a new collaborator
  if (!existing) {
    addActivity({
      type: 'user_joined',
      user: presence.user,
    });
  }
}

/**
 * Remove a collaborator
 */
export function removeCollaborator(clientId: number): void {
  const current = collaborators.get();
  const collaborator = current[clientId];

  if (collaborator) {
    addActivity({
      type: 'user_left',
      user: collaborator.user,
    });

    const { [clientId]: _, ...rest } = current;
    collaborators.set(rest);
  }
}

/**
 * Update collaborators in current file
 */
export function setCollaboratorsInFile(
  filePath: string,
  collabs: CollaboratorPresence[]
): void {
  collaboratorsInCurrentFile.set(collabs.filter((c) => c.currentFile === filePath));
}

/**
 * Add an activity item to the feed
 */
export function addActivity(
  activity: Omit<ActivityItem, 'id' | 'timestamp'>
): void {
  const item: ActivityItem = {
    ...activity,
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  };

  const current = activityFeed.get();
  const updated = [item, ...current].slice(0, MAX_ACTIVITY_ITEMS);
  activityFeed.set(updated);

  // Increment unread count
  unreadActivityCount.set(unreadActivityCount.get() + 1);

  // Play sound notification if enabled
  const settings = collaborationSettings.get();
  if (settings.soundNotifications && activity.type === 'user_joined') {
    playNotificationSound();
  }
}

/**
 * Clear unread activity count
 */
export function markActivityAsRead(): void {
  unreadActivityCount.set(0);
}

/**
 * Clear all activity
 */
export function clearActivity(): void {
  activityFeed.set([]);
  unreadActivityCount.set(0);
}

/**
 * Update collaboration settings
 */
export function updateSettings(
  updates: Partial<CollaborationSettings>
): void {
  const current = collaborationSettings.get();
  collaborationSettings.set({ ...current, ...updates });

  // Persist to localStorage
  try {
    localStorage.setItem(
      'recoder:collaboration-settings',
      JSON.stringify({ ...current, ...updates })
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load settings from localStorage
 */
export function loadSettings(): void {
  try {
    const stored = localStorage.getItem('recoder:collaboration-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      collaborationSettings.set({
        ...collaborationSettings.get(),
        ...parsed,
      });
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Open share dialog
 */
export function openShareDialog(projectId: string): void {
  shareConfig.set({
    projectId,
    inviteEmails: [],
    permissions: 'edit',
  });
  shareDialogOpen.set(true);
}

/**
 * Close share dialog
 */
export function closeShareDialog(): void {
  shareDialogOpen.set(false);
}

/**
 * Update share configuration
 */
export function updateShareConfig(updates: Partial<ShareConfig>): void {
  const current = shareConfig.get();
  if (current) {
    shareConfig.set({ ...current, ...updates });
  }
}

/**
 * Generate a share link
 */
export async function generateShareLink(
  projectId: string,
  permissions: 'view' | 'edit'
): Promise<string> {
  // This would call the backend API to generate a share link
  // For now, generate a placeholder
  const token = Math.random().toString(36).slice(2, 12);
  const link = `${window.location.origin}/join/${projectId}?token=${token}&p=${permissions}`;

  const config = shareConfig.get();
  if (config) {
    shareConfig.set({ ...config, shareLink: link });
  }

  return link;
}

/**
 * Reset collaboration state (on project close)
 */
export function resetCollaboration(): void {
  collaborationProjectId.set(null);
  collaborationConnection.set('disconnected');
  collaborationSynced.set(false);
  currentCollaborator.set(null);
  collaborators.set({});
  activityFeed.set([]);
  unreadActivityCount.set(0);
  shareDialogOpen.set(false);
  shareConfig.set(null);
  collaboratorsInCurrentFile.set([]);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get presence status color
 */
export function getPresenceStatusColor(status: PresenceStatus): string {
  switch (status) {
    case 'active':
      return 'bg-green-500';
    case 'idle':
      return 'bg-yellow-500';
    case 'away':
      return 'bg-orange-500';
    case 'offline':
      return 'bg-gray-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Get presence status text
 */
export function getPresenceStatusText(status: PresenceStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'idle':
      return 'Idle';
    case 'away':
      return 'Away';
    case 'offline':
      return 'Offline';
    default:
      return 'Unknown';
  }
}

/**
 * Format activity timestamp
 */
export function formatActivityTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return 'just now';
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }
}

/**
 * Get activity description text
 */
export function getActivityDescription(activity: ActivityItem): string {
  switch (activity.type) {
    case 'user_joined':
      return 'joined the project';
    case 'user_left':
      return 'left the project';
    case 'file_edited':
      return `edited ${activity.data?.filePath || 'a file'}`;
    case 'file_created':
      return `created ${activity.data?.filePath || 'a file'}`;
    case 'file_deleted':
      return `deleted ${activity.data?.filePath || 'a file'}`;
    case 'file_renamed':
      return `renamed ${activity.data?.oldPath} to ${activity.data?.newPath}`;
    case 'comment_added':
      return `commented on ${activity.data?.filePath || 'a file'}`;
    case 'chat_message':
      return activity.data?.message || 'sent a message';
    default:
      return 'performed an action';
  }
}

/**
 * Play notification sound
 */
function playNotificationSound(): void {
  try {
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.2
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Ignore audio errors
  }
}

// Initialize settings on module load
if (typeof window !== 'undefined') {
  loadSettings();
}
