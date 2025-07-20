/**
 * Configuration management utilities
 */

import Conf from 'conf';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { Logger } from '../../../shared/src/logger';

export interface RecoderConfig {
  // Authentication
  auth?: {
    token?: string;
    user?: {
      id: string;
      name: string;
      email: string;
      username: string;
      plan?: string;
      createdAt: string;
      lastLogin: string;
    };
    refreshToken?: string;
    expiresAt?: string;
  };

  // API Configuration
  api?: {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
  };

  // CLI Preferences
  preferences?: {
    defaultAgent?: string;
    defaultModel?: string;
    verboseLogging?: boolean;
    colorOutput?: boolean;
    autoUpdate?: boolean;
    analytics?: boolean;
  };

  // Project Defaults
  projects?: {
    defaultTemplate?: string;
    defaultOutputDir?: string;
    defaultFeatures?: string[];
    defaultIntegrations?: string[];
  };

  // Templates
  templates?: {
    localPath?: string;
    cacheTimeout?: number;
    autoUpdate?: boolean;
  };

  // Chat Settings
  chat?: {
    defaultModel?: string;
    maxTokens?: number;
    temperature?: number;
    streaming?: boolean;
    saveHistory?: boolean;
  };

  // Development
  development?: {
    watchMode?: boolean;
    autoValidate?: boolean;
    autoSync?: boolean;
    lintOnSave?: boolean;
  };
}

class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: Conf<RecoderConfig>;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(os.homedir(), '.recoder');
    
    this.config = new Conf<RecoderConfig>({
      projectName: 'recoder',
      projectVersion: '1.0.0',
      cwd: this.configPath,
      configName: 'config',
      fileExtension: 'json',
      defaults: this.getDefaults(),
      schema: this.getSchema(),
    });
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private getDefaults(): RecoderConfig {
    return {
      api: {
        baseUrl: 'https://api.recoder.xyz',
        timeout: 30000,
        retries: 3,
      },
      preferences: {
        verboseLogging: false,
        colorOutput: true,
        autoUpdate: true,
        analytics: true,
      },
      projects: {
        defaultOutputDir: './generated',
        defaultFeatures: ['auth', 'database', 'api'],
        defaultIntegrations: [],
      },
      templates: {
        localPath: path.join(this.configPath, 'templates'),
        cacheTimeout: 3600000, // 1 hour
        autoUpdate: true,
      },
      chat: {
        defaultModel: 'gpt-4',
        maxTokens: 2048,
        temperature: 0.7,
        streaming: true,
        saveHistory: true,
      },
      development: {
        watchMode: false,
        autoValidate: true,
        autoSync: false,
        lintOnSave: true,
      },
    };
  }

  private getSchema(): any {
    return {
      auth: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              username: { type: 'string' },
              plan: { type: 'string' },
              createdAt: { type: 'string' },
              lastLogin: { type: 'string' },
            },
          },
          refreshToken: { type: 'string' },
          expiresAt: { type: 'string' },
        },
      },
      api: {
        type: 'object',
        properties: {
          baseUrl: { type: 'string' },
          timeout: { type: 'number', minimum: 1000 },
          retries: { type: 'number', minimum: 0, maximum: 10 },
        },
      },
      preferences: {
        type: 'object',
        properties: {
          defaultAgent: { type: 'string' },
          defaultModel: { type: 'string' },
          verboseLogging: { type: 'boolean' },
          colorOutput: { type: 'boolean' },
          autoUpdate: { type: 'boolean' },
          analytics: { type: 'boolean' },
        },
      },
      chat: {
        type: 'object',
        properties: {
          defaultModel: { type: 'string' },
          maxTokens: { type: 'number', minimum: 1, maximum: 100000 },
          temperature: { type: 'number', minimum: 0, maximum: 1 },
          streaming: { type: 'boolean' },
          saveHistory: { type: 'boolean' },
        },
      },
    };
  }

  public initialize(): void {
    try {
      // Ensure config directory exists
      fs.ensureDirSync(this.configPath);
      
      // Ensure templates directory exists
      const templatesPath = this.get('templates.localPath') as string;
      if (templatesPath) {
        fs.ensureDirSync(templatesPath);
      }

      Logger.info('Configuration initialized');
    } catch (error) {
      Logger.error(`Failed to initialize configuration: ${error}`);
    }
  }

  public get<T = any>(key: string): T {
    return this.config.get(key as any) as T;
  }

  public set(key: string, value: any): void {
    this.config.set(key as any, value);
  }

  public delete(key: string): void {
    this.config.delete(key as any);
  }

  public has(key: string): boolean {
    return this.config.has(key as any);
  }

  public clear(): void {
    this.config.clear();
  }

  public getAll(): RecoderConfig {
    return this.config.store;
  }

  public getConfigPath(): string {
    return this.config.path;
  }

  public loadFromFile(filePath: string): void {
    try {
      const customConfig = fs.readJsonSync(filePath);
      
      // Merge with existing config
      const currentConfig = this.getAll();
      const mergedConfig = this.deepMerge(currentConfig, customConfig);
      
      // Clear and set new config
      this.config.clear();
      Object.entries(mergedConfig).forEach(([key, value]) => {
        this.set(key, value);
      });

      Logger.info(`Configuration loaded from: ${filePath}`);
    } catch (error) {
      Logger.error(`Failed to load configuration from file: ${error}`);
      throw error;
    }
  }

  public saveToFile(filePath: string): void {
    try {
      const config = this.getAll();
      fs.writeJsonSync(filePath, config, { spaces: 2 });
      Logger.info(`Configuration saved to: ${filePath}`);
    } catch (error) {
      Logger.error(`Failed to save configuration to file: ${error}`);
      throw error;
    }
  }

  public reset(): void {
    this.config.clear();
    const defaults = this.getDefaults();
    Object.entries(defaults).forEach(([key, value]) => {
      this.set(key, value);
    });
    Logger.info('Configuration reset to defaults');
  }

  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.getAll();

    try {
      // Validate API configuration
      if (config.api?.timeout && config.api.timeout < 1000) {
        errors.push('API timeout must be at least 1000ms');
      }

      if (config.api?.retries && (config.api.retries < 0 || config.api.retries > 10)) {
        errors.push('API retries must be between 0 and 10');
      }

      // Validate chat configuration
      if (config.chat?.temperature && (config.chat.temperature < 0 || config.chat.temperature > 1)) {
        errors.push('Chat temperature must be between 0 and 1');
      }

      if (config.chat?.maxTokens && (config.chat.maxTokens < 1 || config.chat.maxTokens > 100000)) {
        errors.push('Chat maxTokens must be between 1 and 100000');
      }

      // Validate authentication
      if (config.auth?.token && config.auth?.expiresAt) {
        const expiresAt = new Date(config.auth.expiresAt);
        if (expiresAt < new Date()) {
          errors.push('Authentication token has expired');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`Configuration validation error: ${error}`);
      return { valid: false, errors };
    }
  }

  public migrate(): void {
    try {
      const currentVersion = this.get('version') || '0.0.0';
      const targetVersion = '1.0.0';

      if (currentVersion === targetVersion) {
        return;
      }

      Logger.info(`Migrating configuration from ${currentVersion} to ${targetVersion}`);

      // Add migration logic here for future versions
      this.set('version', targetVersion);

      Logger.info('Configuration migration completed');
    } catch (error) {
      Logger.error(`Configuration migration failed: ${error}`);
      throw error;
    }
  }

  public backup(): string {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.configPath, `config-backup-${timestamp}.json`);
      
      this.saveToFile(backupPath);
      return backupPath;
    } catch (error) {
      Logger.error(`Configuration backup failed: ${error}`);
      throw error;
    }
  }

  public restore(backupPath: string): void {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      this.loadFromFile(backupPath);
      Logger.info(`Configuration restored from: ${backupPath}`);
    } catch (error) {
      Logger.error(`Configuration restore failed: ${error}`);
      throw error;
    }
  }

  private deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) {
      return target;
    }

    if (Array.isArray(source)) {
      return source;
    }

    if (typeof source !== 'object') {
      return source;
    }

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  // Helper methods for common operations
  public isAuthenticated(): boolean {
    const token = this.get('auth.token');
    const expiresAt = this.get('auth.expiresAt');
    
    if (!token) return false;
    
    if (expiresAt) {
      return new Date(expiresAt) > new Date();
    }
    
    return true;
  }

  public getAuthToken(): string | null {
    return this.isAuthenticated() ? this.get('auth.token') : null;
  }

  public getCurrentUser(): any {
    return this.isAuthenticated() ? this.get('auth.user') : null;
  }

  public setAuthData(token: string, user: any, expiresAt?: string): void {
    this.set('auth', {
      token,
      user,
      expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    });
  }

  public clearAuth(): void {
    this.delete('auth');
  }

  public getApiConfig(): { baseUrl: string; timeout: number; retries: number } {
    return {
      baseUrl: this.get('api.baseUrl') || 'https://api.recoder.xyz',
      timeout: this.get('api.timeout') || 30000,
      retries: this.get('api.retries') || 3,
    };
  }

  public getChatConfig(): { model: string; maxTokens: number; temperature: number; streaming: boolean } {
    return {
      model: this.get('chat.defaultModel') || 'gpt-4',
      maxTokens: this.get('chat.maxTokens') || 2048,
      temperature: this.get('chat.temperature') || 0.7,
      streaming: this.get('chat.streaming') || true,
    };
  }

  public updatePreference(key: string, value: any): void {
    this.set(`preferences.${key}`, value);
  }

  public getPreference(key: string, defaultValue?: any): any {
    return this.get(`preferences.${key}`) || defaultValue;
  }
}

// Export singleton instance
export const ConfigManager = ConfigurationManager.getInstance();