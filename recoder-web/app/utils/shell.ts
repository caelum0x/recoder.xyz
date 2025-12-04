import type { WebContainer } from '@webcontainer/api';
import type { ITerminal } from '~/types/terminal';
import { withResolvers } from './promises';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || null;

export async function newShellProcess(webcontainer: WebContainer, terminal: ITerminal, projectId?: string) {
  // If Docker backend is configured and projectId provided, use Docker terminal
  if (DOCKER_URL && projectId) {
    return newDockerShellProcess(terminal, projectId);
  }

  // Otherwise use WebContainer
  return newWebContainerShellProcess(webcontainer, terminal);
}

/**
 * WebContainer shell process (original implementation)
 */
async function newWebContainerShellProcess(webcontainer: WebContainer, terminal: ITerminal) {
  const args: string[] = [];

  const process = await webcontainer.spawn('/bin/jsh', ['--osc', ...args], {
    terminal: {
      cols: terminal.cols ?? 80,
      rows: terminal.rows ?? 15,
    },
    env: {
      PATH: '/home/project/bin:/usr/local/bin:/usr/bin:/bin',
    },
  });

  const input = process.input.getWriter();
  const output = process.output;

  const jshReady = withResolvers<void>();

  let isInteractive = false;

  output.pipeTo(
    new WritableStream({
      write(data) {
        if (!isInteractive) {
          const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

          if (osc === 'interactive') {
            isInteractive = true;
            jshReady.resolve();
          }
        }

        terminal.write(data);
      },
    }),
  );

  terminal.onData((data) => {
    if (isInteractive) {
      input.write(data);
    }
  });

  await jshReady.promise;

  return process;
}

/**
 * Docker shell process via WebSocket
 */
async function newDockerShellProcess(terminal: ITerminal, projectId: string) {
  const wsUrl = DOCKER_URL!.replace('http', 'ws');
  const ws = new WebSocket(`${wsUrl}/terminal/${projectId}`);

  const ready = withResolvers<void>();

  ws.onopen = () => {
    console.log('🐳 Docker terminal connected');
    // Send initial newline to trigger prompt
    ws.send('\n');
    ready.resolve();
  };

  ws.onmessage = (event) => {
    terminal.write(event.data);
  };

  ws.onerror = (error) => {
    console.error('Docker terminal error:', error);
    terminal.write('\r\n\x1b[31mTerminal connection error\x1b[0m\r\n');
  };

  ws.onclose = () => {
    console.log('Docker terminal disconnected');
    terminal.write('\r\n\x1b[33mTerminal disconnected\x1b[0m\r\n');
  };

  terminal.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  await ready.promise;

  // Return a process-like object for compatibility
  return {
    exit: new Promise<number>(() => {}), // Never resolves (terminal stays open)
    kill: () => ws.close(),
    input: {
      getWriter: () => ({
        write: (data: string) => ws.send(data),
        close: () => ws.close(),
      }),
    },
    output: new ReadableStream({
      start(controller) {
        ws.onmessage = (e) => controller.enqueue(e.data);
        ws.onclose = () => controller.close();
      },
    }),
  };
}

/**
 * Check if Docker terminal is available
 */
export async function isDockerTerminalAvailable(projectId: string): Promise<boolean> {
  if (!DOCKER_URL) return false;

  try {
    const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
