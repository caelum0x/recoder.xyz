/**
 * recoder-herd — the Recoder agent herd in your terminal.
 *
 *   recoder-herd                     interactive view (digit keys attach)
 *   recoder-herd --once              print one frame and exit (scriptable)
 *   recoder-herd --backend URL      conductor backend (default $RECODER_BACKEND
 *                                    or http://127.0.0.1:3001)
 *
 * Auth: pass $RECODER_TOKEN when the backend requires it; solo-mode local
 * backends need none.
 */
import { fetchWorkspaces, HerdBackendError } from './client.js';
import { renderFrame } from './render.js';
import { runHerd } from './loop.js';

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const backend =
  flagValue('--backend') ?? process.env['RECODER_BACKEND'] ?? 'http://127.0.0.1:3001';
const token = process.env['RECODER_TOKEN'];

async function main(): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      'recoder-herd — every Recoder agent at a glance\n\n' +
        '  recoder-herd            interactive (digit keys attach, q quits)\n' +
        '  recoder-herd --once     print one frame and exit\n' +
        '  recoder-herd --backend <url>   conductor backend\n',
    );
    return;
  }

  if (args.includes('--once')) {
    try {
      const workspaces = await fetchWorkspaces(backend, token);
      process.stdout.write(`${renderFrame({ workspaces, backend })}\n`);
    } catch (err) {
      process.stderr.write(
        `${err instanceof HerdBackendError ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    }
    return;
  }

  await runHerd({ backend, token });
}

void main();
