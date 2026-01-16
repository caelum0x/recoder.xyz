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

/**
 * WebSocket RPC handler for structured terminal commands
 * Implements a simple JSON-RPC style protocol
 */
export class WebSocketRPC {
  private handlers = new Map<string, RPCHandler>();

  constructor(private ws: WebSocket) {}

  /**
   * Register a handler for an RPC method
   */
  register(method: string, handler: RPCHandler) {
    this.handlers.set(method, handler);
    console.log(`[RPC] Registered handler: ${method}`);
  }

  /**
   * Handle incoming message - check if it's an RPC request
   * Returns true if message was handled as RPC, false otherwise
   */
  async handleMessage(data: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(data);
      
      // Check if it's an RPC request (has id and method)
      if (parsed.id !== undefined && parsed.method) {
        const request = parsed as RPCRequest;
        console.log(`[RPC] >> request #${request.id} ${request.method}`, request.params);
        
        const handler = this.handlers.get(request.method);
        if (handler) {
          try {
            const result = await handler(request.params);
            this.sendResponse(request.id, result);
            console.log(`[RPC] << response #${request.id} ${request.method}`, result);
          } catch (error: any) {
            this.sendError(request.id, error.message);
            console.error(`[RPC] << error #${request.id} ${request.method}:`, error.message);
          }
        } else {
          this.sendError(request.id, `Unknown method: ${request.method}`);
        }
        return true;
      }
    } catch {
      // Not JSON, not an RPC message
    }
    return false;
  }

  private sendResponse(id: number, result: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      const response: RPCResponse = { id, result };
      this.ws.send(JSON.stringify(response));
    }
  }

  private sendError(id: number, error: string) {
    if (this.ws.readyState === WebSocket.OPEN) {
      const response: RPCResponse = { id, error };
      this.ws.send(JSON.stringify(response));
    }
  }

  /**
   * Send command completion signal to client
   */
  sendCommandComplete() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'command-complete', timestamp: Date.now() }));
    }
  }
}
