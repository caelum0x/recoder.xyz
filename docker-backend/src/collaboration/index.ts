/**
 * Collaboration Module Exports
 *
 * Real-time collaboration using Yjs CRDT for Google Docs-style
 * multi-user editing in the Recoder IDE.
 */

export {
  createCollaborationServer,
  getCollaborationStats,
  saveAllDocuments,
} from './yjs-server';

export {
  awarenessManager,
  awarenessHandlers,
  type UserInfo,
  type UserPresence,
  type ProjectPresence,
  type CursorPosition,
  type SelectionRange,
} from './awareness';

export {
  persistenceManager,
} from './persistence';
