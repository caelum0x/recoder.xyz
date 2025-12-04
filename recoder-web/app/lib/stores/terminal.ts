import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';
import { getTerminalWelcomeMessage } from '~/lib/webcontainer/package-manager';

// Docker backend - hardcoded for development
const DOCKER_URL = 'http://localhost:3100';

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: any }> = [];
  #globalPackagesInstalled: boolean = false;
  #projectId: string | null = null;
  #useDocker: boolean = false;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);
  highlightTerminal: WritableAtom<boolean> = import.meta.hot?.data.highlightTerminal ?? atom(false);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.highlightTerminal = this.highlightTerminal;
    }

    // Check if Docker is available
    this.#checkDockerAvailability();
  }

  async #checkDockerAvailability() {
    if (!DOCKER_URL) return;

    try {
      const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(2000) });
      this.#useDocker = res.ok;
      if (this.#useDocker) {
        console.log('🐳 Docker backend available');
      }
    } catch {
      this.#useDocker = false;
    }
  }

  setProjectId(projectId: string) {
    this.#projectId = projectId;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  flashTerminalHighlight() {
    this.highlightTerminal.set(true);
    setTimeout(() => {
      this.highlightTerminal.set(false);
    }, 3000);
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      // Show welcome message
      const welcomeMsg = this.#useDocker
        ? '\x1b[1;36m🐳 Recoder Docker Terminal\x1b[0m\n' +
          '\x1b[90mFull Node.js, Python, Rust, Go, Java, Ruby, PHP support\x1b[0m\n' +
          '\x1b[1;32m✅ recoder-code pre-installed\x1b[0m\n\n'
        : getTerminalWelcomeMessage();

      terminal.write(welcomeMsg);

      // Use Docker if available and projectId is set
      if (this.#useDocker && this.#projectId && DOCKER_URL) {
        await this.#attachDockerTerminal(terminal);
      } else {
        await this.#attachWebContainerTerminal(terminal);
      }
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
    }
  }

  async #attachDockerTerminal(terminal: ITerminal) {
    // Initialize container if needed
    await fetch(`${DOCKER_URL}/api/container`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: this.#projectId }),
    });

    const shellProcess = await newShellProcess(
      await this.#webcontainer, // Not used for Docker, but required for type
      terminal,
      this.#projectId!
    );

    this.#terminals.push({ terminal, process: shellProcess });
  }

  async #attachWebContainerTerminal(terminal: ITerminal) {
    // CLI installation disabled - was causing issues
    // Terminal now just starts the shell directly
    
    const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
    this.#terminals.push({ terminal, process: shellProcess });
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      if (process.resize) {
        process.resize({ cols, rows });
      }
    }
  }

  isUsingDocker(): boolean {
    return this.#useDocker;
  }
}
