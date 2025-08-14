/**
 * Context Proxy for production engine configuration
 */

interface ContextConfig {
  workingDirectory?: string;
  projectName?: string;
  environment?: 'development' | 'production' | 'test';
  features?: Record<string, boolean>;
  settings?: Record<string, any>;
}

export class ContextProxy {
  private config: ContextConfig = {};

  constructor(initialConfig: ContextConfig = {}) {
    this.config = { ...initialConfig };
  }

  get(key: keyof ContextConfig): any {
    return this.config[key];
  }

  set(key: keyof ContextConfig, value: any): void {
    this.config[key] = value;
  }

  getWorkingDirectory(): string {
    return this.config.workingDirectory || process.cwd();
  }

  setWorkingDirectory(directory: string): void {
    this.config.workingDirectory = directory;
  }

  getProjectName(): string {
    return this.config.projectName || 'production-engine';
  }

  setProjectName(name: string): void {
    this.config.projectName = name;
  }

  getEnvironment(): string {
    return this.config.environment || 'development';
  }

  setEnvironment(env: 'development' | 'production' | 'test'): void {
    this.config.environment = env;
  }

  isFeatureEnabled(feature: string): boolean {
    return this.config.features?.[feature] || false;
  }

  enableFeature(feature: string): void {
    if (!this.config.features) {
      this.config.features = {};
    }
    this.config.features[feature] = true;
  }

  disableFeature(feature: string): void {
    if (!this.config.features) {
      this.config.features = {};
    }
    this.config.features[feature] = false;
  }

  getAllConfig(): ContextConfig {
    return { ...this.config };
  }
}

// Default export
export default new ContextProxy();