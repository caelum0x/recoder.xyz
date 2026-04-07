"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketRPC = void 0;
const ws_1 = __importDefault(require("ws"));
const DEFAULT_BATCH_CONFIG = {
    maxBatchSize: 50, // Flush after 50 messages
    maxWaitMs: 16, // ~60fps - flush every frame
    enabled: true,
};
/**
 * WebSocket RPC handler for structured terminal commands
 * Implements a simple JSON-RPC style protocol
 * PERFORMANCE: Includes message batching for high-frequency sends
 */
class WebSocketRPC {
    ws;
    handlers = new Map();
    // PERFORMANCE: Message batching state
    batchConfig;
    batchBuffer = [];
    batchTimer = null;
    lastFlushTime = 0;
    constructor(ws, batchConfig) {
        this.ws = ws;
        this.batchConfig = { ...DEFAULT_BATCH_CONFIG, ...batchConfig };
    }
    // PERFORMANCE: Batch multiple messages together
    queueMessage(message) {
        if (!this.batchConfig.enabled || this.ws.readyState !== ws_1.default.OPEN) {
            // Batching disabled or socket closed, send immediately
            if (this.ws.readyState === ws_1.default.OPEN) {
                this.ws.send(message);
            }
            return;
        }
        this.batchBuffer.push(message);
        // Force flush if batch is full
        if (this.batchBuffer.length >= this.batchConfig.maxBatchSize) {
            this.flushBatch();
            return;
        }
        // Schedule flush if not already scheduled
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.flushBatch(), this.batchConfig.maxWaitMs);
        }
    }
    // PERFORMANCE: Flush batched messages
    flushBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (this.batchBuffer.length === 0 || this.ws.readyState !== ws_1.default.OPEN) {
            return;
        }
        // Send as batch array if multiple messages, single if just one
        if (this.batchBuffer.length === 1) {
            this.ws.send(this.batchBuffer[0]);
        }
        else {
            // Wrap in batch format: { batch: [...messages] }
            this.ws.send(JSON.stringify({ batch: this.batchBuffer.map(m => JSON.parse(m)) }));
        }
        this.batchBuffer = [];
        this.lastFlushTime = Date.now();
    }
    // PERFORMANCE: Force flush on demand (e.g., before close)
    forceFlush() {
        this.flushBatch();
    }
    /**
     * Register a handler for an RPC method
     */
    register(method, handler) {
        this.handlers.set(method, handler);
        console.log(`[RPC] Registered handler: ${method}`);
    }
    /**
     * Handle incoming message - check if it's an RPC request
     * Returns true if message was handled as RPC, false otherwise
     */
    async handleMessage(data) {
        try {
            const parsed = JSON.parse(data);
            // Check if it's an RPC request (has id and method)
            if (parsed.id !== undefined && parsed.method) {
                const request = parsed;
                console.log(`[RPC] >> request #${request.id} ${request.method}`, request.params);
                const handler = this.handlers.get(request.method);
                if (handler) {
                    try {
                        const result = await handler(request.params);
                        this.sendResponse(request.id, result);
                        console.log(`[RPC] << response #${request.id} ${request.method}`, result);
                    }
                    catch (error) {
                        this.sendError(request.id, error.message);
                        console.error(`[RPC] << error #${request.id} ${request.method}:`, error.message);
                    }
                }
                else {
                    this.sendError(request.id, `Unknown method: ${request.method}`);
                }
                return true;
            }
        }
        catch {
            // Not JSON, not an RPC message
        }
        return false;
    }
    // PERFORMANCE: Use batched sending for responses
    sendResponse(id, result) {
        const response = { id, result };
        this.queueMessage(JSON.stringify(response));
    }
    // PERFORMANCE: Use batched sending for errors
    sendError(id, error) {
        const response = { id, error };
        this.queueMessage(JSON.stringify(response));
    }
    /**
     * Send command completion signal to client
     * PERFORMANCE: Uses message batching
     */
    sendCommandComplete() {
        this.queueMessage(JSON.stringify({ type: 'command-complete', timestamp: Date.now() }));
        // Force flush on command complete to ensure immediate delivery
        this.forceFlush();
    }
    /**
     * Send raw data (bypasses batching for low-latency needs)
     */
    sendImmediate(data) {
        if (this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(data);
        }
    }
    /**
     * Cleanup - call when closing connection
     */
    cleanup() {
        this.forceFlush();
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
    }
    /**
     * Get batching statistics
     */
    getBatchStats() {
        return {
            buffered: this.batchBuffer.length,
            lastFlushTime: this.lastFlushTime,
        };
    }
}
exports.WebSocketRPC = WebSocketRPC;
