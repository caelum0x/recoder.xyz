import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';

function getWsUrl(url: string): string {
  return url.replace('https://', 'wss://').replace('http://', 'ws://');
}

export class TerminalStore {
  #terminals: Array<{ terminal: ITerminal; ws?: WebSocket }> = [];
  #projectId: string | null = null;
  #containerReady = false;
  #resizeTimeout: ReturnType<typeof setTimeout> | null = null;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }

  setProjectId(projectId: string) {
    this.#projectId = projectId;
  }

  // Called when container is confirmed ready
  setContainerReady() {
    this.#containerReady = true;
    // Connect any waiting terminals
    for (const entry of this.#terminals) {
      if (!entry.ws) {
        this.#connectTerminal(entry.terminal);
      }
    }
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  attachTerminal(terminal: ITerminal) {
    const entry = { terminal, ws: undefined as WebSocket | undefined };
    this.#terminals.push(entry);

    if (!this.#projectId || !this.#containerReady) {
      return;
    }
    
    this.#connectTerminal(terminal);
  }

  #connectTerminal(terminal: ITerminal) {
    if (!this.#projectId) return;

    const wsUrl = `${getWsUrl(DOCKER_URL)}/terminal/${this.#projectId}`;
    console.log('🔌 [Terminal] Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    // Update the entry with the WebSocket
    const entry = this.#terminals.find(e => e.terminal === terminal);
    if (entry) entry.ws = ws;

    ws.onopen = () => {
      console.log('✅ [Terminal] Connected');
    };

    ws.onmessage = (event) => {
      // Filter out resize message echoes
      if (typeof event.data === 'string' && event.data.includes('"type":"resize"')) {
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        terminal.write(new TextDecoder().decode(event.data));
      } else {
        terminal.write(event.data);
      }
    };

    ws.onerror = () => {
      console.error('❌ [Terminal] Connection error');
    };

    ws.onclose = () => {
      console.log('🔌 [Terminal] Disconnected');
      // Auto-reconnect after 2 seconds if container is still ready
      if (this.#containerReady && entry) {
        entry.ws = undefined;
        setTimeout(() => {
          if (this.#containerReady) {
            this.#connectTerminal(terminal);
          }
        }, 2000);
      }
    };

    terminal.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  onTerminalResize(cols: number, rows: number) {
    // Debounce resize to prevent rapid-fire messages
    if (this.#resizeTimeout) clearTimeout(this.#resizeTimeout);
    this.#resizeTimeout = setTimeout(() => {
      for (const { ws } of this.#terminals) {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      }
    }, 100);
  }
}
