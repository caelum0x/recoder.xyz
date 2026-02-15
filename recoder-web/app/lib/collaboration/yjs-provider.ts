/**
 * Yjs WebSocket Provider for Real-time Collaboration
 *
 * Connects to the collaboration WebSocket server and provides
 * Yjs document synchronization with awareness support.
 */

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { getSessionToken, DOCKER_URL } from '../services/docker-api';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('YjsProvider');

// Message types for Yjs protocol
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// Connection states
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Reconnection configuration
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_JITTER = 0.3;

export interface UserInfo {
  id: string;
  name: string;
  email?: string;
  color: string;
  avatar?: string;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  anchor: CursorPosition;
  head: CursorPosition;
}

export interface YjsProviderOptions {
  projectId: string;
  filePath: string;
  user: UserInfo;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onAwarenessUpdate?: (states: Map<number, any>) => void;
  onSynced?: () => void;
  onError?: (error: Error) => void;
}

/**
 * WebSocket provider for Yjs documents with awareness support
 */
export class YjsProvider {
  private ws: WebSocket | null = null;
  private doc: Y.Doc;
  private awareness: awarenessProtocol.Awareness;
  private options: YjsProviderOptions;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private synced = false;
  private destroyed = false;
  private messageQueue: Uint8Array[] = [];

  constructor(doc: Y.Doc, options: YjsProviderOptions) {
    this.doc = doc;
    this.options = options;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- yjs version mismatch
    this.awareness = new awarenessProtocol.Awareness(doc as any);

    // Set up awareness with user info
    this.awareness.setLocalStateField('user', options.user);

    // Set up document update handler
    this.doc.on('update', this.handleDocumentUpdate);

    // Set up awareness update handler
    this.awareness.on('update', this.handleAwarenessUpdate);

    // Connect immediately
    this.connect();
  }

  /**
   * Get the Yjs document
   */
  getDoc(): Y.Doc {
    return this.doc;
  }

  /**
   * Get the awareness instance
   */
  getAwareness(): awarenessProtocol.Awareness {
    return this.awareness;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if document is synced
   */
  isSynced(): boolean {
    return this.synced;
  }

  /**
   * Connect to the collaboration server
   */
  connect(): void {
    if (this.destroyed || this.ws) return;

    this.setConnectionState('connecting');

    try {
      const token = getSessionToken();
      const wsProtocol = DOCKER_URL.startsWith('https') ? 'wss' : 'ws';
      const wsHost = DOCKER_URL.replace(/^https?:\/\//, '');

      const params = new URLSearchParams({
        projectId: this.options.projectId,
        file: this.options.filePath,
        ...(token ? { token } : {}),
      });

      const wsUrl = `${wsProtocol}://${wsHost}/collab?${params.toString()}`;

      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = this.handleOpen;
      this.ws.onmessage = this.handleMessage;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
    } catch (error: any) {
      logger.error('[YjsProvider] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the collaboration server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState('disconnected');
    this.synced = false;
  }

  /**
   * Destroy the provider and clean up resources
   */
  destroy(): void {
    this.destroyed = true;
    this.disconnect();

    this.doc.off('update', this.handleDocumentUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);

    // Remove local awareness state
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.awareness.clientID], this);

    this.awareness.destroy();
  }

  /**
   * Update local cursor position
   */
  updateCursor(cursor: CursorPosition | null): void {
    this.awareness.setLocalStateField('cursor', cursor);
  }

  /**
   * Update local selection
   */
  updateSelection(selection: SelectionRange | null): void {
    this.awareness.setLocalStateField('selection', selection);
  }

  /**
   * Update the file being edited (for multi-file awareness)
   */
  updateCurrentFile(filePath: string): void {
    this.awareness.setLocalStateField('currentFile', filePath);
  }

  /**
   * Get all remote awareness states
   */
  getRemoteStates(): Map<number, any> {
    const states = new Map(this.awareness.getStates());
    states.delete(this.awareness.clientID); // Remove local state
    return states;
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen = (): void => {
    logger.info('[YjsProvider] Connected');
    this.setConnectionState('connected');
    this.reconnectAttempts = 0;

    // Send sync step 1 (our state vector)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- yjs version mismatch between y-protocols and yjs
    syncProtocol.writeSyncStep1(encoder, this.doc as any);
    this.send(encoding.toUint8Array(encoder));

    // Send our awareness state
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID])
    );
    this.send(encoding.toUint8Array(awarenessEncoder));

    // Flush message queue
    for (const message of this.messageQueue) {
      this.send(message);
    }
    this.messageQueue = [];
  };

  /**
   * Handle WebSocket message event
   */
  private handleMessage = (event: MessageEvent): void => {
    const data = new Uint8Array(event.data);
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- yjs version mismatch
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc as any, this);

        // If we received sync step 2, we are now synced
        if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
          if (!this.synced) {
            this.synced = true;
            this.options.onSynced?.();
          }
        }

        // Send response if encoder has content
        if (encoding.length(encoder) > 1) {
          this.send(encoding.toUint8Array(encoder));
        }
        break;
      }

      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
        break;
      }

      default:
        logger.warn('[YjsProvider] Unknown message type:', messageType);
    }
  };

  /**
   * Handle WebSocket close event
   */
  private handleClose = (event: CloseEvent): void => {
    logger.info('[YjsProvider] Disconnected:', event.code, event.reason);
    this.ws = null;
    this.synced = false;

    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  };

  /**
   * Handle WebSocket error event
   */
  private handleError = (event: Event): void => {
    logger.error('[YjsProvider] WebSocket error:', event);
    this.options.onError?.(new Error('WebSocket connection error'));
  };

  /**
   * Handle document updates from Yjs
   */
  private handleDocumentUpdate = (update: Uint8Array, origin: any): void => {
    // Don't broadcast updates that came from the network
    if (origin === this) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);

    const message = encoding.toUint8Array(encoder);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(message);
    } else {
      this.messageQueue.push(message);
    }
  };

  /**
   * Handle awareness updates
   */
  private handleAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }): void => {
    const changedClients = added.concat(updated).concat(removed);

    if (changedClients.length === 0) return;

    // Notify listener
    this.options.onAwarenessUpdate?.(this.awareness.getStates());

    // Broadcast awareness update to server (only for local changes)
    const localChanges = changedClients.filter((id) => id === this.awareness.clientID);
    if (localChanges.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, localChanges)
      );
      this.send(encoding.toUint8Array(encoder));
    }
  };

  /**
   * Send a message through the WebSocket
   */
  private send(message: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;

    this.setConnectionState('reconnecting');

    // Exponential backoff with jitter
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );
    const jitter = delay * RECONNECT_JITTER * (Math.random() * 2 - 1);
    const finalDelay = Math.round(delay + jitter);

    logger.info(`[YjsProvider] Reconnecting in ${finalDelay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, finalDelay);
  }

  /**
   * Set connection state and notify listeners
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.options.onConnectionStateChange?.(state);
    }
  }
}

/**
 * Create a collaboration provider for a specific file
 */
export function createCollaborationProvider(
  projectId: string,
  filePath: string,
  user: UserInfo,
  options?: Partial<Omit<YjsProviderOptions, 'projectId' | 'filePath' | 'user'>>
): { doc: Y.Doc; provider: YjsProvider } {
  const doc = new Y.Doc();
  const provider = new YjsProvider(doc, {
    projectId,
    filePath,
    user,
    ...options,
  });

  return { doc, provider };
}

/**
 * Manager for multiple file collaboration sessions
 */
export class CollaborationManager {
  private providers = new Map<string, YjsProvider>();
  private projectId: string;
  private user: UserInfo;

  constructor(projectId: string, user: UserInfo) {
    this.projectId = projectId;
    this.user = user;
  }

  /**
   * Get or create a provider for a file
   */
  getProvider(filePath: string): { doc: Y.Doc; provider: YjsProvider } {
    const key = filePath;

    let provider = this.providers.get(key);
    if (provider) {
      return { doc: provider.getDoc(), provider };
    }

    const { doc, provider: newProvider } = createCollaborationProvider(
      this.projectId,
      filePath,
      this.user
    );

    this.providers.set(key, newProvider);
    return { doc, provider: newProvider };
  }

  /**
   * Close a specific file's collaboration session
   */
  closeFile(filePath: string): void {
    const provider = this.providers.get(filePath);
    if (provider) {
      provider.destroy();
      this.providers.delete(filePath);
    }
  }

  /**
   * Close all collaboration sessions
   */
  closeAll(): void {
    this.providers.forEach((provider) => provider.destroy());
    this.providers.clear();
  }

  /**
   * Get all active providers
   */
  getActiveProviders(): Map<string, YjsProvider> {
    return new Map(this.providers);
  }
}
