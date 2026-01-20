/**
 * Awareness Context for Real-time Collaboration
 *
 * Provides React context for awareness state management,
 * user presence tracking, and cursor/selection synchronization.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { YjsProvider, UserInfo, CursorPosition, SelectionRange, ConnectionState } from './yjs-provider';
import { CollaborationManager } from './yjs-provider';
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

// Remote user awareness state
export interface RemoteUserState {
  user: UserInfo;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  currentFile?: string;
  clientId: number;
}

// Collaboration context state
interface CollaborationContextState {
  // Connection state
  connectionState: ConnectionState;
  isSynced: boolean;

  // Current user info
  currentUser: UserInfo | null;

  // Remote users in current file
  remoteUsers: RemoteUserState[];

  // All collaborators in the project
  projectCollaborators: RemoteUserState[];

  // Current provider for the active file
  currentProvider: YjsProvider | null;

  // Methods
  setCurrentFile: (filePath: string) => void;
  updateCursor: (cursor: CursorPosition | null) => void;
  updateSelection: (selection: SelectionRange | null) => void;
  getProviderForFile: (filePath: string) => YjsProvider | null;
}

const CollaborationContext = createContext<CollaborationContextState | null>(null);

interface CollaborationProviderProps {
  projectId: string;
  children: ReactNode;
  enabled?: boolean;
}

/**
 * Provider component for collaboration context
 */
export function CollaborationProvider({ projectId, children, enabled = true }: CollaborationProviderProps) {
  const { user: authUser } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isSynced, setIsSynced] = useState(false);
  const [currentFile, setCurrentFileState] = useState<string | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUserState[]>([]);
  const [projectCollaborators, setProjectCollaborators] = useState<RemoteUserState[]>([]);

  const managerRef = useRef<CollaborationManager | null>(null);
  const currentProviderRef = useRef<YjsProvider | null>(null);

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
      return;
    }

    const manager = new CollaborationManager(projectId, currentUser);
    managerRef.current = manager;

    return () => {
      manager.closeAll();
      managerRef.current = null;
      currentProviderRef.current = null;
    };
  }, [enabled, projectId, currentUser]);

  // Handle file changes
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
    const handleAwarenessUpdate = (states: Map<number, any>) => {
      const users: RemoteUserState[] = [];

      states.forEach((state, clientId) => {
        if (clientId === provider.getAwareness().clientID) return; // Skip local user

        if (state.user) {
          users.push({
            user: state.user,
            cursor: state.cursor,
            selection: state.selection,
            currentFile: state.currentFile,
            clientId,
          });
        }
      });

      setRemoteUsers(users.filter((u) => u.currentFile === filePath));
      setProjectCollaborators(users);
    };

    // Initial awareness state
    handleAwarenessUpdate(provider.getAwareness().getStates());

    // Subscribe to awareness updates via provider options isn't possible after creation,
    // so we listen directly on the awareness instance
    const awareness = provider.getAwareness();
    const awarenessHandler = () => handleAwarenessUpdate(awareness.getStates());
    awareness.on('update', awarenessHandler);

    // Update our current file in awareness
    provider.updateCurrentFile(filePath);

    return () => {
      awareness.off('update', awarenessHandler);
    };
  }, [currentUser]);

  // Cursor update
  const updateCursor = useCallback((cursor: CursorPosition | null) => {
    currentProviderRef.current?.updateCursor(cursor);
  }, []);

  // Selection update
  const updateSelection = useCallback((selection: SelectionRange | null) => {
    currentProviderRef.current?.updateSelection(selection);
  }, []);

  // Get provider for a specific file
  const getProviderForFile = useCallback((filePath: string): YjsProvider | null => {
    if (!managerRef.current) return null;
    const { provider } = managerRef.current.getProvider(filePath);
    return provider;
  }, []);

  const value: CollaborationContextState = {
    connectionState,
    isSynced,
    currentUser,
    remoteUsers,
    projectCollaborators,
    currentProvider: currentProviderRef.current,
    setCurrentFile,
    updateCursor,
    updateSelection,
    getProviderForFile,
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}

/**
 * Hook to access collaboration context
 */
export function useCollaboration() {
  const context = useContext(CollaborationContext);

  if (!context) {
    // Return a no-op context if not within provider (collaboration disabled)
    return {
      connectionState: 'disconnected' as ConnectionState,
      isSynced: false,
      currentUser: null,
      remoteUsers: [],
      projectCollaborators: [],
      currentProvider: null,
      setCurrentFile: () => {},
      updateCursor: () => {},
      updateSelection: () => {},
      getProviderForFile: () => null,
    };
  }

  return context;
}

/**
 * Hook to get remote users in the current file
 */
export function useRemoteUsers(): RemoteUserState[] {
  const { remoteUsers } = useCollaboration();
  return remoteUsers;
}

/**
 * Hook to get all collaborators in the project
 */
export function useProjectCollaborators(): RemoteUserState[] {
  const { projectCollaborators } = useCollaboration();
  return projectCollaborators;
}

/**
 * Hook to get collaboration connection state
 */
export function useCollaborationConnection(): { state: ConnectionState; isSynced: boolean } {
  const { connectionState, isSynced } = useCollaboration();
  return { state: connectionState, isSynced };
}

/**
 * Hook to update cursor position (for CodeMirror integration)
 */
export function useCursorSync() {
  const { updateCursor, updateSelection } = useCollaboration();

  return {
    setCursor: updateCursor,
    setSelection: updateSelection,
  };
}

/**
 * Hook to get the current user's info
 */
export function useCurrentUser(): UserInfo | null {
  const { currentUser } = useCollaboration();
  return currentUser;
}
