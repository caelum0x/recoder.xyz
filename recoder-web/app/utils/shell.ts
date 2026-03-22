import type { ITerminal } from '~/types/terminal';
import { withResolvers } from './promises';
import { getSessionToken } from '~/lib/services/docker-api';
import { updateTerminalStatus } from '~/lib/stores/connection';

let DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && DOCKER_URL.includes('localhost')) {
  DOCKER_URL = 'https://docker.recoder.xyz';
}

let terminalCounter = 0;

// Command completion marker - used to know when commands finish
const COMMAND_DONE_MARKER = '###COMMAND_DONE###';

// Connection reliability constants
const HEARTBEAT_INTERVAL = 30000; // Send ping every 30 seconds
const HEARTBEAT_TIMEOUT = 10000;  // Expect pong within 10 seconds (server now handles JSON pings)
const RECONNECT_INITIAL_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_MAX_ATTEMPTS = 5;

export interface ShellProcess {
  terminalId: string;
  kill: () => void;
  resize: (size: { cols: number; rows: number }) => void;
  sendCommand: (command: string) => Promise<void>;
  clear: () => void;
  killProcess: () => void;
  onCommandComplete: (callback: () => void) => () => void;
  reconnect: () => Promise<void>;
  isConnected: () => boolean;
}

export async function newShellProcess(terminal: ITerminal, projectId: string, terminalId?: string): Promise<ShellProcess> {
  const wsUrl = DOCKER_URL.replace('http', 'ws');
  const id = terminalId || `term-${Date.now()}-${++terminalCounter}`;

  let ws: WebSocket | null = null;
  let dataDisposable: { dispose: () => void } | null = null;
  let rpcId = 0;
  const pendingRpc = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  const commandCompleteCallbacks: (() => void)[] = [];

  // Connection state
  let isKilled = false;
  let reconnectAttempts = 0;
  let reconnectDelay = RECONNECT_INITIAL_DELAY;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let heartbeatTimeout: NodeJS.Timeout | null = null;
  let lastPongTime = Date.now();

  // Helper to clear heartbeat timers
  const clearHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
  };

  // Helper to start heartbeat monitoring
  const startHeartbeat = () => {
    clearHeartbeat();
    lastPongTime = Date.now();

    heartbeatInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

          // Set timeout for pong response
          heartbeatTimeout = setTimeout(() => {
            const timeSinceLastPong = Date.now() - lastPongTime;

            if (timeSinceLastPong > HEARTBEAT_TIMEOUT && ws) {
              ws.close(4000, 'Heartbeat timeout');
            }
          }, HEARTBEAT_TIMEOUT);
        } catch {
          // Ping send failed, will retry on next interval
        }
      }
    }, HEARTBEAT_INTERVAL);
  };

  // RPC helper function
  const rpcRequest = async (method: string, params: any): Promise<any> => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    const reqId = ++rpcId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRpc.delete(reqId);
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000);

      pendingRpc.set(reqId, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); }
      });

      ws!.send(JSON.stringify({ id: reqId, method, params }));
    });
  };

  // Connect/reconnect function
  const connect = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (isKilled) {
        reject(new Error('Shell process has been killed'));
        return;
      }

      // Include auth token for cross-origin authentication
      const token = getSessionToken();
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const wsEndpoint = `${wsUrl}/terminal/${projectId}?terminalId=${encodeURIComponent(id)}${tokenParam}`;

      // Report connecting status
      updateTerminalStatus('connecting');

      const newWs = new WebSocket(wsEndpoint);
      newWs.binaryType = 'arraybuffer';

      newWs.onopen = () => {
        const wasReconnect = reconnectAttempts > 0;
        ws = newWs;
        reconnectAttempts = 0;
        reconnectDelay = RECONNECT_INITIAL_DELAY;
        updateTerminalStatus('connected');
        startHeartbeat();

        // Set up data handler if not already done
        if (!dataDisposable) {
          dataDisposable = terminal.onData((data) => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(data);
            }
          });
        }

        // On reconnect, notify file watcher to re-sync state
        if (wasReconnect) {
          window.dispatchEvent(new CustomEvent('recoder:file-resync'));
        }

        resolve();
      };

      newWs.onmessage = (event) => {
        // Check for RPC response or system messages
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);

            // Handle pong response for heartbeat
            if (msg.type === 'pong') {
              lastPongTime = Date.now();
              if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
              }
              return;
            }

            if (msg.id !== undefined && pendingRpc.has(msg.id)) {
              const { resolve, reject } = pendingRpc.get(msg.id)!;
              pendingRpc.delete(msg.id);
              if (msg.error) {
                reject(new Error(msg.error));
              } else {
                resolve(msg.result);
              }
              return;
            }
            // Check for command completion signal
            if (msg.type === 'command-complete') {
              commandCompleteCallbacks.forEach(cb => cb());
              return;
            }
          } catch {
            // Not JSON, write to terminal
          }
        }

        // Regular terminal output
        if (event.data instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(event.data);
          // Check for command completion marker in output
          if (text.includes(COMMAND_DONE_MARKER)) {
            // Remove the marker from display
            const cleanText = text.replace(new RegExp(COMMAND_DONE_MARKER + '\\r?\\n?', 'g'), '');
            if (cleanText) terminal.write(cleanText);
            commandCompleteCallbacks.forEach(cb => cb());
          } else {
            terminal.write(text);
          }
        } else {
          const text = event.data as string;
          if (text.includes(COMMAND_DONE_MARKER)) {
            const cleanText = text.replace(new RegExp(COMMAND_DONE_MARKER + '\\r?\\n?', 'g'), '');
            if (cleanText) terminal.write(cleanText);
            commandCompleteCallbacks.forEach(cb => cb());
          } else {
            terminal.write(text);
          }
        }
      };

      newWs.onerror = () => {
        // Handled by onclose
      };

      newWs.onclose = (event) => {
        clearHeartbeat();
        ws = null;

        if (isKilled) {
          updateTerminalStatus('disconnected');
          return;
        }

        // Normal close code, don't reconnect
        if (event.code === 1000) {
          terminal.write('\r\n\x1b[33mTerminal disconnected\x1b[0m\r\n');
          updateTerminalStatus('disconnected');
          return;
        }

        // Try to reconnect
        if (reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
          reconnectAttempts++;
          const jitter = reconnectDelay * (Math.random() * 0.25);
          const delay = Math.floor(reconnectDelay + jitter);

          terminal.write(`\r\n\x1b[33mConnection lost. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})...\x1b[0m\r\n`);
          updateTerminalStatus('reconnecting', { reconnectAttempt: reconnectAttempts });

          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY);

          setTimeout(() => {
            if (!isKilled) {
              connect().catch(() => {
                // Reconnection failed, will be handled by next onclose
              });
            }
          }, delay);
        } else {
          terminal.write('\r\n\x1b[31mTerminal connection failed after multiple attempts. Use reconnect to try again.\x1b[0m\r\n');
          updateTerminalStatus('error', { error: 'Max reconnection attempts reached' });
        }
      };

      // Handle initial connection failure (30s timeout to allow for container recovery and Docker operations)
      const connectionTimeout = setTimeout(() => {
        if (newWs.readyState !== WebSocket.OPEN) {
          newWs.close();
          reject(new Error('Connection timeout'));
        }
      }, 30000);

      newWs.addEventListener('open', () => clearTimeout(connectionTimeout), { once: true });
      newWs.addEventListener('error', () => {
        clearTimeout(connectionTimeout);
        reject(new Error('Connection error'));
      }, { once: true });
    });
  };

  // Listen for reconnect-all event
  const handleReconnectAll = () => {
    if (!isKilled && (!ws || ws.readyState !== WebSocket.OPEN)) {
      reconnectAttempts = 0;
      reconnectDelay = RECONNECT_INITIAL_DELAY;
      connect().catch(console.error);
    }
  };
  window.addEventListener('recoder:reconnect-all', handleReconnectAll);

  // Initial connection
  await connect();

  return {
    terminalId: id,
    kill: () => {
      isKilled = true;
      clearHeartbeat();
      window.removeEventListener('recoder:reconnect-all', handleReconnectAll);
      dataDisposable?.dispose();
      dataDisposable = null;
      ws?.close(1000, 'User closed terminal');
      ws = null;
    },
    resize: (size: { cols: number; rows: number }) => {
      if (ws?.readyState === WebSocket.OPEN) {
        rpcRequest('terminal.resize', size).catch(console.error);
      }
    },
    sendCommand: async (command: string) => {
      if (ws?.readyState === WebSocket.OPEN) {
        // Wrap command with completion marker
        ws.send(`${command}; echo "${COMMAND_DONE_MARKER}"\n`);
      }
    },
    clear: () => {
      if (ws?.readyState === WebSocket.OPEN) {
        rpcRequest('terminal.clear', {}).catch(console.error);
      }
    },
    killProcess: () => {
      if (ws?.readyState === WebSocket.OPEN) {
        // Send Ctrl+C
        ws.send('\x03');
      }
    },
    onCommandComplete: (callback: () => void) => {
      commandCompleteCallbacks.push(callback);
      return () => {
        const idx = commandCompleteCallbacks.indexOf(callback);
        if (idx >= 0) commandCompleteCallbacks.splice(idx, 1);
      };
    },
    reconnect: async () => {
      if (isKilled) {
        throw new Error('Shell process has been killed');
      }
      // Close existing connection
      ws?.close(1000, 'Manual reconnect');
      ws = null;
      // Reset reconnect state
      reconnectAttempts = 0;
      reconnectDelay = RECONNECT_INITIAL_DELAY;
      // Reconnect
      terminal.write('\r\n\x1b[36mReconnecting...\x1b[0m\r\n');
      await connect();
    },
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  };
}
