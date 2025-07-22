/**
 * Simple spinner utility
 */

import chalk from 'chalk';

export interface Spinner {
  start(): this;
  stop(): void;
  succeed(text?: string): void;
  fail(text?: string): void;
}

class SimpleSpinner implements Spinner {
  private interval?: NodeJS.Timeout;
  private text: string;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;

  constructor(text: string) {
    this.text = text;
  }

  start(): this {
    process.stdout.write('\n');
    this.interval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(this.frames[this.currentFrame])} ${this.text}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
    return this;
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      process.stdout.write('\r' + ' '.repeat(this.text.length + 2) + '\r');
    }
  }

  succeed(text?: string): void {
    this.stop();
    process.stdout.write(`${chalk.green('✅')} ${text || this.text}\n`);
  }

  fail(text?: string): void {
    this.stop();
    process.stdout.write(`${chalk.red('❌')} ${text || this.text}\n`);
  }
}

export function spinner(text: string): Spinner {
  return new SimpleSpinner(text);
}