import * as readline from 'node:readline';
import type { CommandApprovalPrompt } from './command-gate';

/**
 * The inline approval UI for a terminal runtime.
 *
 * Recoder's product surface is a terminal (see repo AGENTS.md: "the product is
 * a terminal"), so the smallest honest "inline approval UI" for a risky
 * command is a prompt rendered right where the command would have run,
 * blocking only that one command — not a full-screen dialog, not a stub. It
 * shows the exact command, the risk tier, and the reason governance flagged
 * it, then reads a single-key decision from the same TTY the agent's session
 * is attached to.
 *
 * Desktop/Electron and web surfaces should implement the same
 * `CommandApprovalPrompt` contract with a modal/toast instead of a TTY prompt;
 * `CommandGate` does not care which implementation it is given.
 */
export function createTerminalApprovalPrompt(streams?: {
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
}): CommandApprovalPrompt {
  const input = streams?.input ?? process.stdin;
  const output = streams?.output ?? process.stderr;

  return (details) =>
    new Promise((resolve) => {
      output.write(
        '\n' +
          `[recoder governance] Command needs approval (tier: ${details.tier})\n` +
          `  $ ${details.command}\n` +
          `  reason: ${details.reason}\n` +
          `  request: ${details.requestId}\n` +
          'Approve? [y/N] ',
      );

      const rl = readline.createInterface({ input, output, terminal: false });
      rl.question('', (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        const approved = normalized === 'y' || normalized === 'yes';
        output.write(approved ? 'Approved.\n' : 'Rejected.\n');
        resolve(approved ? 'approved' : 'rejected');
      });
    });
}
