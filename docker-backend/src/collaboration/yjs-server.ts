/**
 * Yjs WebSocket Server for Real-time Collaboration
 *
 * Provides CRDT-based document synchronization using Yjs.
 * Supports multiple documents per project with per-user awareness.
 */

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { persistenceManager } from './persistence';
import { awarenessManager, type UserInfo } from './awareness';
import { buildInternalServiceHeaders } from '../public-api/byok-provider-keys.js';

// Message types for Yjs protocol
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;

// Rate limiting configuration
const SYNC_RATE_LIMIT_MS = 50; // Max 20 sync messages per second per client
const MAX_PENDING_MESSAGES = 100;

interface AuthenticatedConnection {
  ws: WebSocket;
  userId: string;
  projectId: string;
  docName: string;
  user: UserInfo;
  lastSyncTime: number;
  pendingMessages: number;
  authenticated: boolean;
}

interface YjsDocument {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Map<WebSocket, AuthenticatedConnection>;
  lastActivity: number;
}

// App API URL for auth verification
const APP_API_URL = process.env.APP_API_URL || 'https://recoder.xyz';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

// Document cache with automatic cleanup
const documents = new Map<string, YjsDocument>();
const IDLE_DOCUMENT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Verify session token with the main app API
 */
async function verifySessionToken(token: string): Promise<{ userId: string; email?: string; name?: string } | null> {
  if (!token) {
    return null;
  }

  try {
    const pathname = '/api/auth/verify-token';
    const body = JSON.stringify({ token });
    const response = await fetch(`${APP_API_URL}${pathname}`, {
      method: 'POST',
      headers: buildInternalServiceHeaders({
        method: 'POST',
        pathname,
        body,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
      body,
    });

    if (!response.ok) {
      console.log(`[Collab] Auth verification failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { success?: boolean; user?: { id: string; email?: string; name?: string } };
    if (data.success && data.user?.id) {
      return { userId: data.user.id, email: data.user.email, name: data.user.name };
    }
    return null;
  } catch (error: any) {
    console.error(`[Collab] Error verifying session: ${error.message}`);
    return null;
  }
}

/**
 * Check if user has access to the project (owner or collaborator)
 */
async function checkProjectAccess(userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId) {
    return false;
  }

  // In migration mode without strict auth, allow access
  if (!REQUIRE_AUTH) {
    console.warn(`[Collab] WARNING: Allowing project access without verification (migration mode)`);
    return true;
  }

  if (!INTERNAL_SERVICE_KEY) {
    return false;
  }

  try {
    // First check ownership
    const ownershipPath = '/api/project/verify-ownership';
    const ownershipBody = JSON.stringify({ userId, projectId });
    const ownershipResponse = await fetch(`${APP_API_URL}${ownershipPath}`, {
      method: 'POST',
      headers: buildInternalServiceHeaders({
        method: 'POST',
        pathname: ownershipPath,
        body: ownershipBody,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
      body: ownershipBody,
    });

    if (ownershipResponse.ok) {
      const data = await ownershipResponse.json() as { isOwner: boolean };
      if (data.isOwner) {
        return true;
      }
    }

    // Then check collaboration access
    const collabPath = '/api/project/verify-collaborator';
    const collabBody = JSON.stringify({ userId, projectId });
    const collabResponse = await fetch(`${APP_API_URL}${collabPath}`, {
      method: 'POST',
      headers: buildInternalServiceHeaders({
        method: 'POST',
        pathname: collabPath,
        body: collabBody,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
      body: collabBody,
    });

    if (collabResponse.ok) {
      const data = await collabResponse.json() as { isCollaborator: boolean };
      return data.isCollaborator === true;
    }

    return false;
  } catch (error: any) {
    console.error(`[Collab] Error checking project access: ${error.message}`);
    return false;
  }
}

/**
 * Get or create a Yjs document for a specific file
 */
function getDocument(projectId: string, filePath: string): YjsDocument {
  const docKey = `${projectId}:${filePath}`;

  let yjsDoc = documents.get(docKey);
  if (!yjsDoc) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    yjsDoc = {
      doc,
      awareness,
      connections: new Map(),
      lastActivity: Date.now(),
    };

    documents.set(docKey, yjsDoc);

    // Load persisted document state
    persistenceManager.loadDocument(projectId, filePath, doc).catch((err) => {
      console.error(`[Collab] Failed to load document ${docKey}:`, err.message);
    });

    // Set up persistence on document updates
    doc.on('update', async (update: Uint8Array, origin: any) => {
      yjsDoc!.lastActivity = Date.now();

      // Don't persist updates that originated from persistence loading
      if (origin !== 'persistence') {
        await persistenceManager.saveDocument(projectId, filePath, doc);
      }
    });

    // Clean up awareness on removal
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
      const message = encoding.toUint8Array(encoder);

      // Broadcast awareness update to all connected clients
      yjsDoc!.connections.forEach((conn, ws) => {
        if (ws.readyState === WebSocket.OPEN && conn.authenticated) {
          ws.send(message);
        }
      });
    });

    console.log(`[Collab] Created document: ${docKey}`);
  }

  yjsDoc.lastActivity = Date.now();
  return yjsDoc;
}

/**
 * Clean up idle documents
 */
function cleanupIdleDocuments() {
  const now = Date.now();

  documents.forEach((yjsDoc, docKey) => {
    // Don't cleanup documents with active connections
    if (yjsDoc.connections.size > 0) {
      yjsDoc.lastActivity = now;
      return;
    }

    if (now - yjsDoc.lastActivity > IDLE_DOCUMENT_TIMEOUT) {
      // Save before cleanup
      const [projectId, filePath] = docKey.split(':');
      persistenceManager.saveDocument(projectId, filePath, yjsDoc.doc).then(() => {
        yjsDoc.doc.destroy();
        documents.delete(docKey);
        console.log(`[Collab] Cleaned up idle document: ${docKey}`);
      }).catch((err) => {
        console.error(`[Collab] Error saving document before cleanup: ${err.message}`);
      });
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupIdleDocuments, 5 * 60 * 1000);

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(conn: AuthenticatedConnection, message: Uint8Array) {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  const yjsDoc = documents.get(`${conn.projectId}:${conn.docName}`);
  if (!yjsDoc) {
    console.warn(`[Collab] Document not found for message`);
    return;
  }

  switch (messageType) {
    case MESSAGE_SYNC: {
      // Rate limiting check
      const now = Date.now();
      if (now - conn.lastSyncTime < SYNC_RATE_LIMIT_MS) {
        conn.pendingMessages++;
        if (conn.pendingMessages > MAX_PENDING_MESSAGES) {
          console.warn(`[Collab] Rate limit exceeded for user ${conn.userId}`);
          conn.ws.close(4008, 'Rate limit exceeded');
          return;
        }
      } else {
        conn.lastSyncTime = now;
        conn.pendingMessages = 0;
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);

      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, yjsDoc.doc, conn);

      // Broadcast sync messages to other clients
      if (syncMessageType === syncProtocol.messageYjsSyncStep2 || syncMessageType === syncProtocol.messageYjsUpdate) {
        const broadcastEncoder = encoding.createEncoder();
        encoding.writeVarUint(broadcastEncoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(broadcastEncoder, decoding.readVarUint8Array(decoder));
        const broadcastMessage = encoding.toUint8Array(broadcastEncoder);

        yjsDoc.connections.forEach((otherConn, otherWs) => {
          if (otherWs !== conn.ws && otherWs.readyState === WebSocket.OPEN && otherConn.authenticated) {
            otherWs.send(broadcastMessage);
          }
        });
      }

      // Send response if encoder has content
      if (encoding.length(encoder) > 1) {
        conn.ws.send(encoding.toUint8Array(encoder));
      }
      break;
    }

    case MESSAGE_AWARENESS: {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(yjsDoc.awareness, update, conn);

      // Update global awareness manager
      const awarenessState = yjsDoc.awareness.getLocalState();
      if (awarenessState) {
        awarenessManager.updatePresence(conn.projectId, conn.userId, {
          clientId: yjsDoc.awareness.clientID,
          cursor: awarenessState.cursor,
          selection: awarenessState.selection,
        });
      }
      break;
    }

    default:
      console.warn(`[Collab] Unknown message type: ${messageType}`);
  }
}

/**
 * Send initial sync to a new connection
 */
function sendInitialSync(conn: AuthenticatedConnection, yjsDoc: YjsDocument) {
  // Send sync step 1 (document state vector)
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, yjsDoc.doc);
  conn.ws.send(encoding.toUint8Array(encoder));

  // Send current awareness states
  const awarenessStates = yjsDoc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(yjsDoc.awareness, Array.from(awarenessStates.keys()))
    );
    conn.ws.send(encoding.toUint8Array(awarenessEncoder));
  }
}

/**
 * Create and configure the Yjs WebSocket server
 */
export function createCollaborationServer(server: http.Server, path: string = '/collab'): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    if (!url.pathname.startsWith(path)) {
      return;
    }

    // Extract parameters from URL
    const projectId = url.searchParams.get('projectId');
    const filePath = url.searchParams.get('file');
    const token = url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');

    if (!projectId || !filePath) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Verify authentication
    let user: { userId: string; email?: string; name?: string } | null = null;

    if (token) {
      user = await verifySessionToken(token);
    }

    if (!user && REQUIRE_AUTH) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // In migration mode, allow anonymous users
    if (!user && !REQUIRE_AUTH) {
      console.warn(`[Collab] WARNING: Anonymous connection to ${projectId}/${filePath}`);
      user = { userId: 'anonymous-' + Math.random().toString(36).substring(7) };
    }

    // Verify project access
    const hasAccess = await checkProjectAccess(user!.userId, projectId);
    if (!hasAccess) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // Accept the WebSocket connection
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, { projectId, filePath, user });
    });
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage, params: { projectId: string; filePath: string; user: { userId: string; email?: string; name?: string } }) => {
    const { projectId, filePath, user } = params;

    console.log(`[Collab] New connection: ${user.userId} -> ${projectId}/${filePath}`);

    // Get or create the document
    const yjsDoc = getDocument(projectId, filePath);

    // Create user info for awareness
    const userInfo: UserInfo = {
      id: user.userId,
      name: user.name || user.email?.split('@')[0] || 'Anonymous',
      email: user.email,
      color: generateUserColor(user.userId),
      avatar: user.email ? `https://www.gravatar.com/avatar/${hashEmail(user.email)}?d=identicon&s=32` : undefined,
    };

    // Create connection object
    const conn: AuthenticatedConnection = {
      ws,
      userId: user.userId,
      projectId,
      docName: filePath,
      user: userInfo,
      lastSyncTime: 0,
      pendingMessages: 0,
      authenticated: true,
    };

    // Register connection
    yjsDoc.connections.set(ws, conn);

    // Register with global awareness manager
    awarenessManager.addUser(projectId, userInfo);

    // Set up awareness for this client
    yjsDoc.awareness.setLocalStateField('user', userInfo);

    // Send initial sync
    sendInitialSync(conn, yjsDoc);

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        handleMessage(conn, new Uint8Array(data));
      } catch (error: any) {
        console.error(`[Collab] Error handling message:`, error.message);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(`[Collab] Connection closed: ${user.userId} -> ${projectId}/${filePath}`);

      // Remove from document connections
      yjsDoc.connections.delete(ws);

      // Remove awareness state
      awarenessProtocol.removeAwarenessStates(yjsDoc.awareness, [yjsDoc.awareness.clientID], conn);

      // Remove from global awareness manager
      awarenessManager.removeUser(projectId, user.userId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[Collab] WebSocket error for ${user.userId}:`, error.message);
    });
  });

  console.log(`[Collab] Yjs collaboration server ready on ${path}`);
  return wss;
}

/**
 * Generate a consistent color for a user based on their ID
 */
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

/**
 * Simple hash for gravatar
 */
function hashEmail(email: string): string {
  let hash = 0;
  const normalized = email.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const chr = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, '0');
}

/**
 * Get stats about active collaboration sessions
 */
export function getCollaborationStats() {
  const stats: {
    totalDocuments: number;
    totalConnections: number;
    documents: Array<{
      key: string;
      connections: number;
      lastActivity: number;
    }>;
  } = {
    totalDocuments: documents.size,
    totalConnections: 0,
    documents: [],
  };

  documents.forEach((yjsDoc, key) => {
    stats.totalConnections += yjsDoc.connections.size;
    stats.documents.push({
      key,
      connections: yjsDoc.connections.size,
      lastActivity: yjsDoc.lastActivity,
    });
  });

  return stats;
}

/**
 * Force save all documents (for graceful shutdown)
 */
export async function saveAllDocuments(): Promise<void> {
  const savePromises: Promise<void>[] = [];

  documents.forEach((yjsDoc, docKey) => {
    const [projectId, filePath] = docKey.split(':');
    savePromises.push(
      persistenceManager.saveDocument(projectId, filePath, yjsDoc.doc).catch((err) => {
        console.error(`[Collab] Error saving document ${docKey}:`, err.message);
      })
    );
  });

  await Promise.all(savePromises);
  console.log(`[Collab] Saved ${savePromises.length} documents`);
}
