/**
 * A minimal typed DI container.
 *
 * Register a value or a lazy factory under a {@link Token}; resolve it back with
 * full type inference. Factories run at most once (singleton) and may depend on
 * earlier registrations via the passed container. Phase 0 registers only the
 * foundation tokens (AppConfig, Logger); domains register their modules in later
 * phases. There are no top-level singletons — the container IS the composition
 * root's state.
 */
import type { Token } from '../shared/di-tokens.js';

type Factory<T> = (container: Container) => T;

interface Registration<T> {
  factory: Factory<T>;
  resolved: boolean;
  value?: T;
}

export class Container {
  private readonly registrations = new Map<symbol, Registration<unknown>>();

  /** Register an already-constructed value under a token. */
  registerValue<T>(token: Token<T>, value: T): this {
    this.registrations.set(token.symbol, { factory: () => value, resolved: true, value });
    return this;
  }

  /** Register a lazy singleton factory. Runs once on first resolve. */
  registerFactory<T>(token: Token<T>, factory: Factory<T>): this {
    if (this.registrations.has(token.symbol)) {
      throw new Error(`DI token already registered: ${token.description}`);
    }
    this.registrations.set(token.symbol, { factory: factory as Factory<unknown>, resolved: false });
    return this;
  }

  /** True if a token has been registered. */
  has<T>(token: Token<T>): boolean {
    return this.registrations.has(token.symbol);
  }

  /** Resolve a token to its typed value, constructing it if needed. */
  resolve<T>(token: Token<T>): T {
    const registration = this.registrations.get(token.symbol) as Registration<T> | undefined;
    if (!registration) {
      throw new Error(`DI token not registered: ${token.description}`);
    }
    if (!registration.resolved) {
      registration.value = registration.factory(this);
      registration.resolved = true;
    }
    return registration.value as T;
  }

  /** Resolve a token, or return undefined when it is not registered. */
  tryResolve<T>(token: Token<T>): T | undefined {
    return this.has(token) ? this.resolve(token) : undefined;
  }

  /** Number of registered tokens (diagnostics/tests). */
  get size(): number {
    return this.registrations.size;
  }
}

/** Construct an empty container. */
export function createContainer(): Container {
  return new Container();
}
