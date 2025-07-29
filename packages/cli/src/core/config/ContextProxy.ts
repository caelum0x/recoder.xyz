/**
 * Context proxy for configuration management
 */

export interface ContextProxy {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  has(key: string): boolean
  delete(key: string): boolean
}

export class SimpleContextProxy implements ContextProxy {
  private data: Map<string, any> = new Map()

  get<T>(key: string): T | undefined {
    return this.data.get(key)
  }

  set<T>(key: string, value: T): void {
    this.data.set(key, value)
  }

  has(key: string): boolean {
    return this.data.has(key)
  }

  delete(key: string): boolean {
    return this.data.delete(key)
  }
}

// Default instance
export const contextProxy = new SimpleContextProxy()