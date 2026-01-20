/**
 * Collaboration Module Exports
 *
 * Real-time collaboration using Yjs CRDT for Google Docs-style
 * multi-user editing in the Recoder IDE.
 */

// Core Yjs provider
export {
  YjsProvider,
  CollaborationManager,
  createCollaborationProvider,
  type ConnectionState,
  type UserInfo,
  type CursorPosition,
  type SelectionRange,
  type YjsProviderOptions,
} from './yjs-provider';

// React context and hooks
export {
  CollaborationProvider,
  useCollaboration,
  useRemoteUsers,
  useProjectCollaborators,
  useCollaborationConnection,
  useCursorSync,
  useCurrentUser,
  type RemoteUserState,
} from './awareness-context';

// Awareness utilities
export {
  LocalAwarenessManager,
  generateUserColor,
  getLightColor,
  getUserInitials,
  getUserStatus,
  awarenessStatesToPresence,
  getUsersInFile,
  getGravatarUrl,
  createUserInfo,
  cursorEquals,
  selectionEquals,
  isEmptySelection,
  type PresenceStatus,
  type UserPresence,
  type AwarenessState,
} from './awareness';

// CodeMirror integration
export {
  createCollaborationExtensions,
  createCursorExtensions,
  type CollaborationConfig,
} from './codemirror-collab';
