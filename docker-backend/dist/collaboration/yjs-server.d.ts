/**
 * Yjs WebSocket Server for Real-time Collaboration
 *
 * Provides CRDT-based document synchronization using Yjs.
 * Supports multiple documents per project with per-user awareness.
 */
import { WebSocketServer } from 'ws';
import http from 'http';
/**
 * Create and configure the Yjs WebSocket server
 */
export declare function createCollaborationServer(server: http.Server, path?: string): WebSocketServer;
/**
 * Get stats about active collaboration sessions
 */
export declare function getCollaborationStats(): {
    totalDocuments: number;
    totalConnections: number;
    documents: Array<{
        key: string;
        connections: number;
        lastActivity: number;
    }>;
};
/**
 * Force save all documents (for graceful shutdown)
 */
export declare function saveAllDocuments(): Promise<void>;
