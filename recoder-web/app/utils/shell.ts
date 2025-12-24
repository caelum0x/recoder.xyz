import type { ITerminal } from '~/types/terminal';
import { withResolvers } from './promises';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

export async function newShellProcess(terminal: ITerminal, projectId: string) {
  const wsUrl = DOCKER_URL.replace('http', 'ws');
  const wsEndpoint = `${wsUrl}/terminal/${projectId}`;
  
  const ws = new WebSocket(wsEndpoint);
  ws.binaryType = 'arraybuffer';

  const ready = withResolvers<void>();

  ws.onopen = () => {
    ready.resolve();
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      terminal.write(new TextDecoder().decode(event.data));
    } else {
      terminal.write(event.data);
    }
  };

  ws.onerror = () => {
    terminal.write('\r\n\x1b[31mTerminal connection error\x1b[0m\r\n');
  };

  ws.onclose = () => {
    terminal.write('\r\n\x1b[33mTerminal disconnected\x1b[0m\r\n');
  };

  terminal.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  await ready.promise;

  return {
    kill: () => ws.close(),
  };
}
