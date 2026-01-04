import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';
import { getCurrentUserId } from './user';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

export class TerminalStore {
  #terminals: Array<{ terminal: ITerminal; process: any }> = [];
  #projectId: string | null = null;
  #pendingTerminals: ITerminal[] = [];

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);
  highlightTerminal: WritableAtom<boolean> = import.meta.hot?.data.highlightTerminal ?? atom(false);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.highlightTerminal = this.highlightTerminal;
    }
  }

  async setProjectId(projectId: string) {
    this.#projectId = projectId;

    // Attach any pending terminals
    if (this.#pendingTerminals.length > 0) {
      for (const terminal of this.#pendingTerminals) {
        await this.#attachDockerTerminal(terminal);
      }
      this.#pendingTerminals = [];
    }
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  flashTerminalHighlight() {
    this.highlightTerminal.set(true);
    setTimeout(() => this.highlightTerminal.set(false), 3000);
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      if (this.#projectId) {
        await this.#attachDockerTerminal(terminal);
      } else {
        this.#pendingTerminals.push(terminal);
        terminal.write('\x1b[33mWaiting for project initialization...\x1b[0m\r\n');
      }
    } catch (error: any) {
      console.error('Failed to attach terminal:', error);
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
    }
  }

  async #attachDockerTerminal(terminal: ITerminal) {
    // Ensure container exists (include userId for Claude Code token injection)
    try {
      const userId = getCurrentUserId();
      const res = await fetch(`${DOCKER_URL}/api/container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.#projectId, userId }),
      });

      if (!res.ok) {
        throw new Error('Failed to create container: ' + await res.text());
      }
    } catch (e: any) {
      terminal.write(coloredText.red('Failed to initialize container: ' + e.message + '\r\n'));
      return;
    }

    const shellProcess = await newShellProcess(terminal, this.#projectId!);
    this.#terminals.push({ terminal, process: shellProcess });
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      if (process.resize) {
        process.resize({ cols, rows });
      }
    }
  }
}
