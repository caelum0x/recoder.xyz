/**
 * Get WebSocket connection statistics
 * Can be used by other modules or exposed via API
 */
export declare function getWebSocketStats(): {
    activeConnections: number;
    byEndpoint: Record<string, number>;
    byProject: Record<string, number>;
    totalConnections: number;
    totalDisconnections: number;
    totalPingsSent: number;
    totalPongsReceived: number;
    totalTimeouts: number;
    connectionDetails: Array<{
        projectId: string;
        endpoint: string;
        userId?: string;
        uptimeSeconds: number;
        lastPongAgoSeconds: number;
    }>;
};
