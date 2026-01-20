/**
 * useCollaboration Hook
 *
 * Main hook for managing real-time collaboration in the editor.
 * Integrates Yjs, awareness, and CodeMirror for multi-user editing.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import * as Y from 'yjs';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  CollaborationManager,
  YjsProvider,
  type ConnectionState,
  type UserInfo,
  type CursorPosition,
  type SelectionRange,
} from '../collaboration/yjs-provider';
import {
  createCollaborationExtensions,
  type CollaborationConfig,
} from '../collaboration/codemirror-collab';
import { useAuth } from '../contexts/AuthContext';

// Generate a consistent color for a user based on their ID
function generateUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF7F50',
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length];
}

// Remote user state
export interface RemoteUser {
  user: UserInfo;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  currentFile?: string;
  clientId: number;
}

// User joined/left event
export interface UserEvent {
  type: 'joined' | 'left';
  user: UserInfo;
  timestamp: number;
}

// Hook options
export interface UseCollaborationOptions {
  projectId: string;
  enabled?: boolean;
  onUserJoined?: (user: UserInfo) => void;
  onUserLeft?: (user: UserInfo) => void;
  onConnectionChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
}

// Hook return type
export interface CollaborationState {
  // Connection state
  connectionState: ConnectionState;
  isSynced: boolean;
  isEnabled: boolean;

  // Current user
  currentUser: UserInfo | null;

  // Remote users
  remoteUsers: RemoteUser[];
  projectCollaborators: RemoteUser[];

  // User events (for notifications)
  userEvents: UserEvent[];
  clearUserEvents: () => void;

  // File management
  setCurrentFile: (filePath: string) => void;
  currentFile: string | null;

  // Cursor/selection updates
  updateCursor: (cursor: CursorPosition | null) => void;
  updateSelection: (selection: SelectionRange | null) => void;

  // Get CodeMirror extensions for a file
  getEditorExtensions: (filePath: string) => Extension[];

  // Provider access
  getProviderForFile: (filePath: string) => YjsProvider | null;
  currentProvider: YjsProvider | null;

  // Yjs document access
  getDocForFile: (filePath: string) => Y.Doc | null;

  // Reconnection
  reconnect: () => void;
}

/**
 * Main hook for collaboration functionality
 */
export function useCollaboration(options: UseCollaborationOptions): CollaborationState {
  const { projectId, enabled = true, onUserJoined, onUserLeft, onConnectionChange, onError } = options;
  const { user: authUser } = useAuth();

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isSynced, setIsSynced] = useState(false);
  const [currentFile, setCurrentFileState] = useState<string | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [projectCollaborators, setProjectCollaborators] = useState<RemoteUser[]>([]);
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);

  // Refs
  const managerRef = useRef<CollaborationManager | null>(null);
  const currentProviderRef = useRef<YjsProvider | null>(null);
  const previousUsersRef = useRef<Set<string>>(new Set());
  const extensionCacheRef = useRef<Map<string, Extension[]>>(new Map());

  // Create user info from auth user
  const currentUser = useMemo<UserInfo | null>(() => {
    if (!authUser) return null;

    return {
      id: authUser.id,
      name: authUser.name || authUser.email?.split('@')[0] || 'Anonymous',
      email: authUser.email || undefined,
      color: generateUserColor(authUser.id),
      avatar: authUser.image || undefined,
    };
  }, [authUser]);

  // Initialize collaboration manager
  useEffect(() => {
    if (!enabled || !projectId || !currentUser) {
      setConnectionState('disconnected');
      return;
    }

    const manager = new CollaborationManager(projectId, currentUser);
    managerRef.current = manager;

    return () => {
      manager.closeAll();
      managerRef.current = null;
      currentProviderRef.current = null;
      extensionCacheRef.current.clear();
      previousUsersRef.current.clear();
    };
  }, [enabled, projectId, currentUser]);

  // Handle awareness updates
  const handleAwarenessUpdate = useCallback((states: Map<number, any>, filePath: string) => {
    const users: RemoteUser[] = [];
    const currentUserIds = new Set<string>();

    states.forEach((state, clientId) => {
      if (!state.user) return;

      // Track all users for project collaborators
      currentUserIds.add(state.user.id);

      // Skip local user in remote list
      if (currentUser && state.user.id === currentUser.id) return;

      users.push({
        user: state.user,
        cursor: state.cursor,
        selection: state.selection,
        currentFile: state.currentFile,
        clientId,
      });
    });

    // Detect user joins and leaves
    const previousUsers = previousUsersRef.current;
    const joined: UserInfo[] = [];
    const left: UserInfo[] = [];

    // Find new users
    currentUserIds.forEach((userId) => {
      if (!previousUsers.has(userId)) {
        const user = users.find((u) => u.user.id === userId)?.user;
        if (user && user.id !== currentUser?.id) {
          joined.push(user);
        }
      }
    });

    // Find users who left
    previousUsers.forEach((userId) => {
      if (!currentUserIds.has(userId) && userId !== currentUser?.id) {
        // Try to find the user info from previous state
        const prevUser = projectCollaborators.find((u) => u.user.id === userId)?.user;
        if (prevUser) {
          left.push(prevUser);
        }
      }
    });

    // Update previous users
    previousUsersRef.current = currentUserIds;

    // Emit events
    const now = Date.now();
    const newEvents: UserEvent[] = [];

    joined.forEach((user) => {
      onUserJoined?.(user);
      newEvents.push({ type: 'joined', user, timestamp: now });
    });

    left.forEach((user) => {
      onUserLeft?.(user);
      newEvents.push({ type: 'left', user, timestamp: now });
    });

    if (newEvents.length > 0) {
      setUserEvents((prev) => [...prev.slice(-9), ...newEvents]); // Keep last 10 events
    }

    // Update state
    setRemoteUsers(users.filter((u) => u.currentFile === filePath));
    setProjectCollaborators(users);
  }, [currentUser, onUserJoined, onUserLeft, projectCollaborators]);

  // Set current file
  const setCurrentFile = useCallback((filePath: string) => {
    if (!managerRef.current || !currentUser) return;

    setCurrentFileState(filePath);

    // Get or create provider for this file
    const { provider } = managerRef.current.getProvider(filePath);
    currentProviderRef.current = provider;

    // Update connection state
    setConnectionState(provider.getConnectionState());
    setIsSynced(provider.isSynced());

    // Set up awareness update handler
    const awareness = provider.getAwareness();
    const awarenessHandler = () => handleAwarenessUpdate(awareness.getStates(), filePath);

    // Initial state
    handleAwarenessUpdate(awareness.getStates(), filePath);

    // Subscribe to updates
    awareness.on('update', awarenessHandler);

    // Update our current file in awareness
    provider.updateCurrentFile(filePath);

    // Notify connection state changes
    const originalOnConnectionStateChange = provider['options'].onConnectionStateChange;
    provider['options'].onConnectionStateChange = (state: ConnectionState) => {
      setConnectionState(state);
      onConnectionChange?.(state);
      originalOnConnectionStateChange?.(state);
    };

    provider['options'].onSynced = () => {
      setIsSynced(true);
    };

    provider['options'].onError = (error: Error) => {
      onError?.(error);
    };

    return () => {
      awareness.off('update', awarenessHandler);
    };
  }, [currentUser, handleAwarenessUpdate, onConnectionChange, onError]);

  // Update cursor
  const updateCursor = useCallback((cursor: CursorPosition | null) => {
    currentProviderRef.current?.updateCursor(cursor);
  }, []);

  // Update selection
  const updateSelection = useCallback((selection: SelectionRange | null) => {
    currentProviderRef.current?.updateSelection(selection);
  }, []);

  // Get provider for a file
  const getProviderForFile = useCallback((filePath: string): YjsProvider | null => {
    if (!managerRef.current) return null;
    const { provider } = managerRef.current.getProvider(filePath);
    return provider;
  }, []);

  // Get Yjs doc for a file
  const getDocForFile = useCallback((filePath: string): Y.Doc | null => {
    if (!managerRef.current) return null;
    const { doc } = managerRef.current.getProvider(filePath);
    return doc;
  }, []);

  // Get CodeMirror extensions for a file
  const getEditorExtensions = useCallback((filePath: string): Extension[] => {
    if (!managerRef.current || !currentUser) return [];

    // Check cache
    const cached = extensionCacheRef.current.get(filePath);
    if (cached) return cached;

    // Create new extensions
    const { doc, provider } = managerRef.current.getProvider(filePath);

    const config: CollaborationConfig = {
      doc,
      awareness: provider.getAwareness(),
      user: currentUser,
      onCursorUpdate: (cursor) => provider.updateCursor(cursor),
      onSelectionUpdate: (selection) => provider.updateSelection(selection),
    };

    const extensions = createCollaborationExtensions(config);
    extensionCacheRef.current.set(filePath, extensions);

    return extensions;
  }, [currentUser]);

  // Clear user events
  const clearUserEvents = useCallback(() => {
    setUserEvents([]);
  }, []);

  // Reconnect
  const reconnect = useCallback(() => {
    if (currentProviderRef.current) {
      currentProviderRef.current.disconnect();
      currentProviderRef.current.connect();
    }
  }, []);

  return {
    connectionState,
    isSynced,
    isEnabled: enabled && !!currentUser,
    currentUser,
    remoteUsers,
    projectCollaborators,
    userEvents,
    clearUserEvents,
    setCurrentFile,
    currentFile,
    updateCursor,
    updateSelection,
    getEditorExtensions,
    getProviderForFile,
    currentProvider: currentProviderRef.current,
    getDocForFile,
    reconnect,
  };
}

/**
 * Hook to get remote users in the current file
 */
export function useRemoteUsersInFile(collaboration: CollaborationState): RemoteUser[] {
  return collaboration.remoteUsers;
}

/**
 * Hook to get all project collaborators
 */
export function useProjectCollaboratorsHook(collaboration: CollaborationState): RemoteUser[] {
  return collaboration.projectCollaborators;
}

/**
 * Hook to get connection status
 */
export function useConnectionStatus(collaboration: CollaborationState): {
  state: ConnectionState;
  isSynced: boolean;
  isConnected: boolean;
} {
  return {
    state: collaboration.connectionState,
    isSynced: collaboration.isSynced,
    isConnected: collaboration.connectionState === 'connected',
  };
}

export default useCollaboration;
