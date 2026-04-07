/**
 * Database Connection Manager
 * Manages secure database connections with encryption for credentials
 *
 * SECURITY FEATURES:
 * - Credentials are encrypted at rest using AES-256-GCM
 * - Connection strings are never logged or exposed
 * - Connections are pooled and properly cleaned up
 * - Input validation on all parameters
 */
import { PostgresDriver } from './drivers/postgresql.js';
import { SqliteDriver } from './drivers/sqlite.js';
export type DatabaseType = 'postgresql' | 'sqlite';
export interface DatabaseConnection {
    id: string;
    projectId: string;
    type: DatabaseType;
    name: string;
    driver: PostgresDriver | SqliteDriver;
    createdAt: number;
    lastUsed: number;
}
export interface EncryptedCredentials {
    iv: string;
    authTag: string;
    encrypted: string;
}
export interface PostgresConnectionParams {
    type: 'postgresql';
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    name?: string;
}
export interface SqliteConnectionParams {
    type: 'sqlite';
    filename: string;
    readonly?: boolean;
    name?: string;
}
export type ConnectionParams = PostgresConnectionParams | SqliteConnectionParams;
/**
 * Encrypt sensitive data (like passwords)
 * SECURITY: Uses AES-256-GCM for authenticated encryption
 */
export declare function encryptCredential(plaintext: string): EncryptedCredentials;
/**
 * Decrypt sensitive data
 * SECURITY: Verifies authentication tag to detect tampering
 */
export declare function decryptCredential(credentials: EncryptedCredentials): string;
declare class ConnectionManager {
    private connections;
    private cleanupInterval;
    constructor();
    /**
     * Create a new database connection
     * SECURITY: Validates all inputs and encrypts credentials
     */
    connect(projectId: string, params: ConnectionParams, basePath?: string): Promise<{
        success: boolean;
        connectionId?: string;
        error?: string;
    }>;
    /**
     * Disconnect a database connection
     */
    disconnect(connectionId: string, projectId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get a connection by ID
     * SECURITY: Verifies project ownership
     */
    getConnection(connectionId: string, projectId: string): DatabaseConnection | null;
    /**
     * Get all connections for a project
     */
    getProjectConnections(projectId: string): DatabaseConnection[];
    /**
     * Disconnect all connections for a project
     */
    disconnectProject(projectId: string): Promise<void>;
    /**
     * Cleanup idle connections
     */
    private cleanupIdleConnections;
    /**
     * Get connection statistics
     */
    getStats(): {
        totalConnections: number;
        connectionsByType: Record<DatabaseType, number>;
        connectionsByProject: Record<string, number>;
    };
    /**
     * Shutdown all connections
     */
    shutdown(): Promise<void>;
}
export declare const connectionManager: ConnectionManager;
export { ConnectionManager };
