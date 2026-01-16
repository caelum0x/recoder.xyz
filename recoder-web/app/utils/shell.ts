import type { ITerminal } from '~/types/terminal';
import { withResolvers } from './promises';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

let terminalCounter = 0;

// Command completion marker - used to know when commands finish
const COMMAND_DONE_MARKER = '###COMMAND_DONE###';

export interface ShellProcess {
  terminalId: string;
  kill: () => void;
  resize: (size: { cols: number; rows: number }) => void;
  sendCommand: (command: string) => Promise<void>;
  clear: () => void;
  killProcess: () => void;
  onCommandComplete: (callback: () => void) => () => void;
}

export async function newShellProcess(terminal: ITerminal, projectId: string, terminalId?: string): Promise<ShellProcess> {
  const wsUrl = DOCKER_URL.replace('http', 'ws');
  const id = terminalId || `term-${Date.now()}-${++terminalCounter}`;
  const wsEndpoint = `${wsUrl}/terminal/${projectId}?terminalId=${encodeURIComponent(id)}`;
  
  const ws = new WebSocket(wsEndpoint);
  ws.binaryType = 'arraybuffer';

  const ready = withResolvers<void>();
  let rpcId = 0;
  const pendingRpc = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  const commandCompleteCallbacks: (() => void)[] = [];

  ws.onopen = () => {
    ready.resolve();
  };

  ws.onmessage = (event) => {
    // Check for RPC response
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
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

  ws.onerror = () => {
    terminal.write('\r\n\x1b[31mTerminal connection error\x1b[0m\r\n');
  };

  ws.onclose = () => {
    terminal.write('\r\n\x1b[33mTerminal disconnected\x1b[0m\r\n');
  };

  const dataDisposable = terminal.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  await ready.promise;

  // RPC helper function
  const rpcRequest = async (method: string, params: any): Promise<any> => {
    const id = ++rpcId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRpc.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000);

      pendingRpc.set(id, { 
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); }
      });

      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  return {
    terminalId: id,
    kill: () => {
      dataDisposable.dispose();
      ws.close();
    },
    resize: (size: { cols: number; rows: number }) => {
      if (ws.readyState === WebSocket.OPEN) {
        rpcRequest('terminal.resize', size).catch(console.error);
      }
    },
    sendCommand: async (command: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Wrap command with completion marker
        ws.send(`${command}; echo "${COMMAND_DONE_MARKER}"\n`);
      }
    },
    clear: () => {
      if (ws.readyState === WebSocket.OPEN) {
        rpcRequest('terminal.clear', {}).catch(console.error);
      }
    },
    killProcess: () => {
      if (ws.readyState === WebSocket.OPEN) {
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
  };
}
