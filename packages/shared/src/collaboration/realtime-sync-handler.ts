// @ts-nocheck — server-only module; excluded from frontend type checking
/**
 * Real-Time Sync Handler
 * KILLER FEATURE: Google Docs-level real-time synchronization for code
 * Integrates CodeSyncEngine with WebSocket collaboration
 */

import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { Logger } from '../utils/logger';
import { CodeSyncEngine, CodeOperation, CodeDocument, ConflictResolution } from './code-sync-engine';
import { CollaborationUser } from './websocket-server';

export interface SyncMessage {
  type: 'operation' | 'cursor_position' | 'selection_change' | 'file_open' | 'file_close' | 'sync_request';
  payload: any;
  userId: string;
  sessionId: string;
  timestamp: Date;
}

export interface CursorPosition {
  userId: string;
  fileId: string;
  line: number;
  column: number;
  timestamp: Date;
}

export interface TextSelection {
  userId: string;
  fileId: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  timestamp: Date;
}

export interface UserFileActivity {
  userId: string;
  sessionId: string;
  openFiles: string[]; // document IDs
  activeFile?: string; // currently focused document ID
  cursors: Map<string, CursorPosition>; // documentId -> cursor position
  selections: Map<string, TextSelection>; // documentId -> text selection
}

export class RealtimeSyncHandler extends EventEmitter {
  private syncEngine: CodeSyncEngine;
  private connections: Map<string, WebSocket> = new Map(); // userId -> WebSocket
  private userActivities: Map<string, UserFileActivity> = new Map(); // userId -> activity
  private documentSubscribers: Map<string, Set<string>> = new Map(); // documentId -> Set<userId>
  private typingIndicators: Map<string, Set<string>> = new Map(); // documentId -> Set<userId> currently typing

  constructor(syncEngine: CodeSyncEngine) {
    super();
    this.syncEngine = syncEngine;
    this.setupSyncEngineHandlers();
    this.startTypingIndicatorCleanup();
  }

  // Connection Management

  addConnection(userId: string, ws: WebSocket): void {
    this.connections.set(userId, ws);

    // Initialize user activity
    this.userActivities.set(userId, {
      userId,
      sessionId: '',
      openFiles: [],
      cursors: new Map(),
      selections: new Map()
    });

    ws.on('message', (data: string) => {
      try {
        const message: SyncMessage = JSON.parse(data);
        message.userId = userId;
        message.timestamp = new Date();
        this.handleSyncMessage(message);
      } catch (error) {
        Logger.error('Failed to parse sync message:', error);
      }
    });

    ws.on('close', () => {
      this.removeConnection(userId);
    });

    Logger.info(`Real-time sync connection added for user: ${userId}`);
  }

  removeConnection(userId: string): void {
    this.connections.delete(userId);
    
    const activity = this.userActivities.get(userId);
    if (activity) {
      // Remove user from all document subscriptions
      activity.openFiles.forEach(documentId => {
        const subscribers = this.documentSubscribers.get(documentId);
        if (subscribers) {
          subscribers.delete(userId);
          if (subscribers.size === 0) {
            this.documentSubscribers.delete(documentId);
          }
        }
        
        // Remove from typing indicators
        const typingUsers = this.typingIndicators.get(documentId);
        if (typingUsers) {
          typingUsers.delete(userId);
          if (typingUsers.size === 0) {
            this.typingIndicators.delete(documentId);
          }
        }
      });
    }

    this.userActivities.delete(userId);
    Logger.info(`Real-time sync connection removed for user: ${userId}`);
  }

  // Message Handling

  private handleSyncMessage(message: SyncMessage): void {
    switch (message.type) {
      case 'operation':
        this.handleOperationMessage(message);
        break;
      case 'cursor_position':
        this.handleCursorPosition(message);
        break;
      case 'selection_change':
        this.handleSelectionChange(message);
        break;
      case 'file_open':
        this.handleFileOpen(message);
        break;
      case 'file_close':
        this.handleFileClose(message);
        break;
      case 'sync_request':
        this.handleSyncRequest(message);
        break;
      default:
        Logger.warn(`Unknown sync message type: ${message.type}`);
    }
  }

  private handleOperationMessage(message: SyncMessage): void {
    const { operation, documentId } = message.payload;
    
    const codeOperation: CodeOperation = {
      id: operation.id,
      type: operation.type,
      position: operation.position,
      content: operation.content,
      length: operation.length,
      author: message.userId,
      timestamp: message.timestamp,
      sessionId: message.sessionId,
      fileId: documentId
    };

    // Submit operation to sync engine
    this.syncEngine.submitOperation(codeOperation);

    // Update typing indicators
    this.setUserTyping(documentId, message.userId, true);
    
    // Remove typing indicator after a delay
    setTimeout(() => {
      this.setUserTyping(documentId, message.userId, false);
    }, 2000);

    Logger.debug(`Code operation received from ${message.userId}: ${operation.type} at ${operation.position}`);
  }

  private handleCursorPosition(message: SyncMessage): void {
    const { documentId, line, column } = message.payload;
    
    const activity = this.userActivities.get(message.userId);
    if (activity) {
      const cursor: CursorPosition = {
        userId: message.userId,
        fileId: documentId,
        line,
        column,
        timestamp: message.timestamp
      };
      
      activity.cursors.set(documentId, cursor);
      activity.activeFile = documentId;
    }

    // Broadcast cursor position to other collaborators
    this.broadcastToDocument(documentId, {
      type: 'cursor_position',
      payload: {
        userId: message.userId,
        documentId,
        line,
        column,
        timestamp: message.timestamp
      }
    }, message.userId);
  }

  private handleSelectionChange(message: SyncMessage): void {
    const { documentId, start, end } = message.payload;
    
    const activity = this.userActivities.get(message.userId);
    if (activity) {
      const selection: TextSelection = {
        userId: message.userId,
        fileId: documentId,
        start,
        end,
        timestamp: message.timestamp
      };
      
      activity.selections.set(documentId, selection);
    }

    // Broadcast selection to other collaborators
    this.broadcastToDocument(documentId, {
      type: 'selection_change',
      payload: {
        userId: message.userId,
        documentId,
        start,
        end,
        timestamp: message.timestamp
      }
    }, message.userId);
  }

  private handleFileOpen(message: SyncMessage): void {
    const { documentId, filePath } = message.payload;
    
    const activity = this.userActivities.get(message.userId);
    if (activity) {
      if (!activity.openFiles.includes(documentId)) {
        activity.openFiles.push(documentId);
      }
      activity.activeFile = documentId;
      activity.sessionId = message.sessionId;
    }

    // Subscribe user to document updates
    let subscribers = this.documentSubscribers.get(documentId);
    if (!subscribers) {
      subscribers = new Set();
      this.documentSubscribers.set(documentId, subscribers);
    }
    subscribers.add(message.userId);

    // Join the document in sync engine
    this.syncEngine.joinDocument(documentId, message.userId);

    // Send current document state to user
    const document = this.syncEngine.getDocument(documentId);
    if (document) {
      this.sendToUser(message.userId, {
        type: 'document_state',
        payload: {
          documentId,
          content: document.content,
          version: document.version,
          collaborators: document.collaborators
        }
      });
    }

    // Broadcast user presence to other collaborators
    this.broadcastToDocument(documentId, {
      type: 'user_opened_file',
      payload: {
        userId: message.userId,
        documentId,
        filePath,
        timestamp: message.timestamp
      }
    }, message.userId);

    Logger.info(`User ${message.userId} opened file: ${filePath}`);
  }

  private handleFileClose(message: SyncMessage): void {
    const { documentId } = message.payload;
    
    const activity = this.userActivities.get(message.userId);
    if (activity) {
      activity.openFiles = activity.openFiles.filter(id => id !== documentId);
      if (activity.activeFile === documentId) {
        activity.activeFile = activity.openFiles[activity.openFiles.length - 1];
      }
      activity.cursors.delete(documentId);
      activity.selections.delete(documentId);
    }

    // Unsubscribe from document updates
    const subscribers = this.documentSubscribers.get(documentId);
    if (subscribers) {
      subscribers.delete(message.userId);
      if (subscribers.size === 0) {
        this.documentSubscribers.delete(documentId);
      }
    }

    // Leave the document in sync engine
    this.syncEngine.leaveDocument(documentId, message.userId);

    // Remove from typing indicators
    this.setUserTyping(documentId, message.userId, false);

    // Broadcast user leaving to other collaborators
    this.broadcastToDocument(documentId, {
      type: 'user_closed_file',
      payload: {
        userId: message.userId,
        documentId,
        timestamp: message.timestamp
      }
    }, message.userId);

    Logger.info(`User ${message.userId} closed document: ${documentId}`);
  }

  private handleSyncRequest(message: SyncMessage): void {
    const { documentId, clientVersion } = message.payload;
    
    const document = this.syncEngine.getDocument(documentId);
    if (!document) {
      this.sendToUser(message.userId, {
        type: 'sync_error',
        payload: { error: 'Document not found', documentId }
      });
      return;
    }

    // Send missing operations since client version
    const missingOperations = document.operations.slice(clientVersion);
    
    this.sendToUser(message.userId, {
      type: 'sync_response',
      payload: {
        documentId,
        serverVersion: document.version,
        operations: missingOperations,
        currentContent: document.content
      }
    });

    Logger.debug(`Sync request processed for user ${message.userId}, document ${documentId}`);
  }

  // Typing Indicators

  private setUserTyping(documentId: string, userId: string, isTyping: boolean): void {
    let typingUsers = this.typingIndicators.get(documentId);
    if (!typingUsers) {
      typingUsers = new Set();
      this.typingIndicators.set(documentId, typingUsers);
    }

    if (isTyping) {
      typingUsers.add(userId);
    } else {
      typingUsers.delete(userId);
    }

    // Broadcast typing status to other collaborators
    this.broadcastToDocument(documentId, {
      type: 'typing_indicator',
      payload: {
        userId,
        documentId,
        isTyping,
        typingUsers: Array.from(typingUsers),
        timestamp: new Date()
      }
    }, userId);
  }

  private startTypingIndicatorCleanup(): void {
    // Clean up stale typing indicators every 5 seconds
    setInterval(() => {
      const now = Date.now();
      const timeout = 5000; // 5 seconds

      for (const [documentId, typingUsers] of this.typingIndicators.entries()) {
        for (const userId of typingUsers) {
          const activity = this.userActivities.get(userId);
          if (!activity) {
            // User disconnected, remove from typing
            this.setUserTyping(documentId, userId, false);
          }
        }
      }
    }, 5000);
  }

  // Broadcasting

  private broadcastToDocument(documentId: string, message: any, excludeUserId?: string): void {
    const subscribers = this.documentSubscribers.get(documentId);
    if (!subscribers) return;

    for (const userId of subscribers) {
      if (excludeUserId && userId === excludeUserId) continue;
      this.sendToUser(userId, message);
    }
  }

  private sendToUser(userId: string, message: any): void {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Sync Engine Event Handlers

  private setupSyncEngineHandlers(): void {
    this.syncEngine.on('document-changed', (data) => {
      const { document, operations } = data;
      
      this.broadcastToDocument(document.id, {
        type: 'document_updated',
        payload: {
          documentId: document.id,
          version: document.version,
          operations,
          content: document.content,
          lastModifiedBy: document.lastModifiedBy,
          timestamp: new Date()
        }
      });
    });

    this.syncEngine.on('conflicts-resolved', (data) => {
      const { documentId, resolution, conflicts } = data;
      
      this.broadcastToDocument(documentId, {
        type: 'conflicts_resolved',
        payload: {
          documentId,
          resolution,
          conflicts,
          timestamp: new Date()
        }
      });

      Logger.info(`Broadcast conflict resolution for document ${documentId}`);
    });

    this.syncEngine.on('ai-conflict-resolution', (data) => {
      const { documentId, resolution } = data;
      
      this.broadcastToDocument(documentId, {
        type: 'ai_conflict_resolved',
        payload: {
          documentId,
          resolution,
          message: 'AI assistant automatically resolved code conflicts',
          timestamp: new Date()
        }
      });

      Logger.info(`AI resolved conflicts for document ${documentId}`);
    });
  }

  // Public API

  createDocument(sessionId: string, filePath: string, content: string, createdBy: string): CodeDocument {
    return this.syncEngine.createDocument(sessionId, filePath, content, createdBy);
  }

  getDocumentAnalytics(documentId: string) {
    return this.syncEngine.getDocumentAnalytics(documentId);
  }

  getUserActivity(userId: string): UserFileActivity | null {
    return this.userActivities.get(userId) || null;
  }

  getDocumentCollaborators(documentId: string): string[] {
    const subscribers = this.documentSubscribers.get(documentId);
    return subscribers ? Array.from(subscribers) : [];
  }

  getAllActivities() {
    return Array.from(this.userActivities.values());
  }

  // Shutdown

  async shutdown(): Promise<void> {
    Logger.info('Shutting down realtime sync handler...');
    
    // Close all WebSocket connections
    for (const ws of this.connections.values()) {
      ws.close();
    }
    
    this.connections.clear();
    this.userActivities.clear();
    this.documentSubscribers.clear();
    this.typingIndicators.clear();
    
    await this.syncEngine.shutdown();
    
    Logger.info('Realtime sync handler shut down');
  }
}

// Export types
// Types are already exported as interfaces above