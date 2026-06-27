/**
 * Compose CLI args immutably. Drivers build a base arg list, then layer headless-mode,
 * model, and policy-derived flags on top. This helper keeps composition explicit and
 * order-stable so recorded fixtures stay deterministic.
 */
export class ArgBuilder {
  private constructor(private readonly args: readonly string[]) {}

  static create(initial: readonly string[] = []): ArgBuilder {
    return new ArgBuilder([...initial]);
  }

  add(...args: string[]): ArgBuilder {
    return new ArgBuilder([...this.args, ...args]);
  }

  addIf(condition: boolean, ...args: string[]): ArgBuilder {
    return condition ? this.add(...args) : this;
  }

  addFlag(flag: string, value?: string): ArgBuilder {
    return value === undefined ? this.add(flag) : this.add(flag, value);
  }

  addFlagIf(condition: boolean, flag: string, value?: string): ArgBuilder {
    return condition ? this.addFlag(flag, value) : this;
  }

  build(): string[] {
    return [...this.args];
  }
}
