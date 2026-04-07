import WebSocket from 'ws';
export interface RPCRequest {
    id: number;
    method: string;
    params: any;
}
export interface RPCResponse {
    id: number;
    result?: any;
    error?: string;
}
type RPCHandler = (params: any) => Promise<any> | any;
interface BatchConfig {
    maxBatchSize: number;
    maxWaitMs: number;
    enabled: boolean;
}
/**
 * WebSocket RPC handler for structured terminal commands
 * Implements a simple JSON-RPC style protocol
 * PERFORMANCE: Includes message batching for high-frequency sends
 */
export declare class WebSocketRPC {
    private ws;
    private handlers;
    private batchConfig;
    private batchBuffer;
    private batchTimer;
    private lastFlushTime;
    constructor(ws: WebSocket, batchConfig?: Partial<BatchConfig>);
    private queueMessage;
    private flushBatch;
    forceFlush(): void;
    /**
     * Register a handler for an RPC method
     */
    register(method: string, handler: RPCHandler): void;
    /**
     * Handle incoming message - check if it's an RPC request
     * Returns true if message was handled as RPC, false otherwise
     */
    handleMessage(data: string): Promise<boolean>;
    private sendResponse;
    private sendError;
    /**
     * Send command completion signal to client
     * PERFORMANCE: Uses message batching
     */
    sendCommandComplete(): void;
    /**
     * Send raw data (bypasses batching for low-latency needs)
     */
    sendImmediate(data: string | Buffer): void;
    /**
     * Cleanup - call when closing connection
     */
    cleanup(): void;
    /**
     * Get batching statistics
     */
    getBatchStats(): {
        buffered: number;
        lastFlushTime: number;
    };
}
export {};
