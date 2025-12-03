import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';
import { installGlobalPackages, getTerminalWelcomeMessage } from '~/lib/webcontainer/package-manager';

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #globalPackagesInstalled: boolean = false;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);
  highlightTerminal: WritableAtom<boolean> = import.meta.hot?.data.highlightTerminal ?? atom(false);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.highlightTerminal = this.highlightTerminal;
    }
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  /**
   * Highlight terminal to draw attention (e.g., when new output arrives)
   * Automatically fades after 3 seconds
   */
  flashTerminalHighlight() {
    this.highlightTerminal.set(true);

    // Auto-fade after 3 seconds
    setTimeout(() => {
      this.highlightTerminal.set(false);
    }, 3000);
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      // Show welcome message
      terminal.write(getTerminalWelcomeMessage());

      // Install global packages on first terminal attach
      if (!this.#globalPackagesInstalled) {
        const webcontainer = await this.#webcontainer;

        // Install in background
        installGlobalPackages(webcontainer)
          .then(() => {
            terminal.write('\x1b[1;32m✅ recoder-code CLI installed! Try: recoder-code --help\x1b[0m\n\n');
          })
          .catch((error) => {
            terminal.write(coloredText.yellow('⚠️ recoder-code installation failed. You can install manually:\n'));
            terminal.write('   npm install recoder-code\n\n');
          });

        this.#globalPackagesInstalled = true;
      }

      const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }
}
