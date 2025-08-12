/**
 * Collaboration Module Index
 * Exports all collaboration-related components
 */

// Core collaboration service
export { default as CollaborationService } from './collaboration-service';
export type { CollaborationServiceOptions, CollaborativeCodeGeneration } from './collaboration-service';

// WebSocket server
export { CollaborationServer } from './websocket-server';
export type { 
  CollaborationUser, 
  CollaborationSession, 
  CollaborationEvent,
  CodeChange,
  AISuggestion
} from './websocket-server';

// Session management
export { SessionManager } from './session-manager';
export type { 
  SessionPersistence,
  UserPresence,
  SessionInvite,
  SessionAnalytics
} from './session-manager';

// Redis persistence
export { RedisSessionPersistence } from './redis-session-persistence';

// Code synchronization
export { CodeSyncEngine } from './code-sync-engine';
export type {
  CodeOperation,
  CodeDocument,
  ConflictResolution,
  SyncState
} from './code-sync-engine';

// Real-time sync handler
export { RealtimeSyncHandler } from './realtime-sync-handler';
export type {
  SyncMessage,
  CursorPosition,
  TextSelection,
  UserFileActivity
} from './realtime-sync-handler';

// Re-export for easy access
export * from './collaboration-service';
export * from './websocket-server';
export * from './session-manager';
export * from './redis-session-persistence';
export * from './code-sync-engine';
export * from './realtime-sync-handler';