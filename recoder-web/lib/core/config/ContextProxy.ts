/**
 * Context proxy for configuration management
 */
import { homedir } from 'os';
import { join } from 'path';

export class ContextProxy {
  private config: Record<string, any> = {};
  
  public globalStorageUri = {
    fsPath: join(homedir(), '.recoder')
  };

  constructor(initialConfig: Record<string, any> = {}) {
    this.config = { ...initialConfig };
  }

  get(key: string): any {
    return this.config[key];
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }

  has(key: string): boolean {
    return key in this.config;
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }

  static get instance(): ContextProxy {
    if (!this._instance) {
      this._instance = new ContextProxy();
    }
    return this._instance;
  }

  private static _instance: ContextProxy;
}