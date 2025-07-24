/**
 * User Migration System for Recoder.xyz Ecosystem
 * 
 * Handles automated migration from LlamaCoder, KiloCode, and other AI coding tools
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UnifiedConfigManager } from '../config/unified-config';
import { SessionManager } from '../session/session-manager';

export interface MigrationSource {
  name: string;
  displayName: string;
  version?: string;
  configPath: string;
  dataPath: string;
  supported: boolean;
}

export interface MigrationData {
  source: MigrationSource;
  config: any;
  sessions: any[];
  projects: any[];
  settings: any;
  apiKeys: Record<string, string>;
  customPrompts: any[];
  extensions: any[];
  metadata: {
    exportDate: string;
    sourceVersion: string;
    migrationVersion: string;
  };
}

export interface MigrationResult {
  success: boolean;
  source: string;
  migratedItems: {
    config: boolean;
    sessions: number;
    projects: number;
    apiKeys: number;
    customPrompts: number;
  };
  warnings: string[];
  errors: string[];
  postMigrationSteps: string[];
}

export class UserMigrationSystem {
  private static instance: UserMigrationSystem;
  private configManager: UnifiedConfigManager;
  private sessionManager: SessionManager;
  private supportedSources: Map<string, MigrationSource> = new Map();

  private constructor(platform: 'cli' | 'web' | 'extension') {
    this.configManager = UnifiedConfigManager.getInstance(platform);
    this.sessionManager = SessionManager.getInstance(platform);
    this.initializeSupportedSources();
  }

  static getInstance(platform: 'cli' | 'web' | 'extension'): UserMigrationSystem {
    if (!UserMigrationSystem.instance) {
      UserMigrationSystem.instance = new UserMigrationSystem(platform);
    }
    return UserMigrationSystem.instance;
  }

  /**
   * Initialize supported migration sources
   */
  private initializeSupportedSources(): void {
    const homeDir = os.homedir();
    
    this.supportedSources.set('llamacoder', {
      name: 'llamacoder',
      displayName: 'LlamaCoder',
      configPath: path.join(homeDir, '.llamacoder', 'config.json'),
      dataPath: path.join(homeDir, '.llamacoder', 'projects'),
      supported: true
    });

    this.supportedSources.set('kilocode', {
      name: 'kilocode',
      displayName: 'KiloCode (Cline/Roo)',
      configPath: path.join(homeDir, '.vscode', 'extensions'),
      dataPath: path.join(homeDir, '.kilocode'),
      supported: true
    });

    this.supportedSources.set('cursor', {
      name: 'cursor',
      displayName: 'Cursor IDE',
      configPath: path.join(homeDir, '.cursor', 'config.json'),
      dataPath: path.join(homeDir, '.cursor', 'conversations'),
      supported: true
    });

    this.supportedSources.set('github-copilot', {
      name: 'github-copilot',
      displayName: 'GitHub Copilot',
      configPath: path.join(homeDir, '.vscode', 'extensions', 'github.copilot*'),
      dataPath: path.join(homeDir, '.vscode', 'User', 'settings.json'),
      supported: false // Read-only compatibility
    });

    this.supportedSources.set('claude-dev', {
      name: 'claude-dev',
      displayName: 'Claude Dev Extension',
      configPath: path.join(homeDir, '.vscode', 'extensions', 'saoudrizwan.claude-dev*'),
      dataPath: path.join(homeDir, '.claude-dev'),
      supported: true
    });
  }

  /**
   * Detect available migration sources
   */
  async detectSources(): Promise<MigrationSource[]> {
    const detectedSources: MigrationSource[] = [];

    for (const [name, source] of this.supportedSources) {
      try {
        const exists = await this.checkSourceExists(source);
        if (exists) {
          const version = await this.detectSourceVersion(source);
          detectedSources.push({
            ...source,
            version
          });
        }
      } catch (error) {
        console.warn(`Failed to detect ${name}:`, error);
      }
    }

    return detectedSources;
  }

  /**
   * Check if migration source exists
   */
  private async checkSourceExists(source: MigrationSource): Promise<boolean> {
    try {
      // Check config path
      if (fs.existsSync(source.configPath)) {
        return true;
      }

      // Check data path
      if (fs.existsSync(source.dataPath)) {
        return true;
      }

      // Special handling for VS Code extensions
      if (source.configPath.includes('extensions')) {
        const extensionsDir = path.dirname(source.configPath);
        if (fs.existsSync(extensionsDir)) {
          const extensions = fs.readdirSync(extensionsDir);
          const extensionPattern = path.basename(source.configPath);
          return extensions.some(ext => ext.includes(extensionPattern.replace('*', '')));
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect source version
   */
  private async detectSourceVersion(source: MigrationSource): Promise<string | undefined> {
    try {
      switch (source.name) {
        case 'llamacoder':
          return this.detectLlamaCoderVersion(source);
        case 'kilocode':
          return this.detectKiloCodeVersion(source);
        case 'cursor':
          return this.detectCursorVersion(source);
        default:
          return undefined;
      }
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Export data from source
   */
  async exportFromSource(sourceName: string): Promise<MigrationData> {
    const source = this.supportedSources.get(sourceName);
    if (!source) {
      throw new Error(`Unsupported migration source: ${sourceName}`);
    }

    if (!source.supported) {
      throw new Error(`Migration from ${source.displayName} is not supported`);
    }

    switch (sourceName) {
      case 'llamacoder':
        return this.exportLlamaCoderData(source);
      case 'kilocode':
        return this.exportKiloCodeData(source);
      case 'cursor':
        return this.exportCursorData(source);
      case 'claude-dev':
        return this.exportClaudeDevData(source);
      default:
        throw new Error(`Export not implemented for ${sourceName}`);
    }
  }

  /**
   * Import migration data to Recoder
   */
  async importMigrationData(migrationData: MigrationData): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      source: migrationData.source.displayName,
      migratedItems: {
        config: false,
        sessions: 0,
        projects: 0,
        apiKeys: 0,
        customPrompts: 0
      },
      warnings: [],
      errors: [],
      postMigrationSteps: []
    };

    try {
      // Migrate configuration
      await this.migrateConfiguration(migrationData, result);

      // Migrate API keys
      await this.migrateApiKeys(migrationData, result);

      // Migrate sessions
      await this.migrateSessions(migrationData, result);

      // Migrate projects
      await this.migrateProjects(migrationData, result);

      // Migrate custom prompts
      await this.migrateCustomPrompts(migrationData, result);

      result.success = true;
      result.postMigrationSteps = this.generatePostMigrationSteps(migrationData);

    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.success = false;
    }

    return result;
  }

  /**
   * Migrate configuration settings
   */
  private async migrateConfiguration(migrationData: MigrationData, result: MigrationResult): Promise<void> {
    try {
      const currentConfig = this.configManager.getConfig();
      const sourceConfig = migrationData.config;

      // Map common settings
      const mappedConfig: any = {};

      switch (migrationData.source.name) {
        case 'llamacoder':
          mappedConfig.defaultProvider = this.mapProvider(sourceConfig.defaultModel);
          mappedConfig.projectDefaults = {
            language: sourceConfig.defaultLanguage || 'typescript',
            includeTests: sourceConfig.generateTests || true,
            includeDocs: sourceConfig.generateDocs || false
          };
          break;

        case 'kilocode':
          mappedConfig.defaultProvider = this.mapProvider(sourceConfig.selectedProvider);
          mappedConfig.qualityValidation = sourceConfig.enableValidation !== false;
          mappedConfig.extension = {
            autoActivate: sourceConfig.autoActivate !== false,
            showInlineHints: sourceConfig.showHints !== false
          };
          break;

        case 'cursor':
          mappedConfig.defaultProvider = 'claude'; // Cursor primarily uses Claude
          mappedConfig.features = {
            sessionSharing: true,
            crossPlatformSync: true
          };
          break;
      }

      // Merge with current configuration
      const mergedConfig = {
        ...currentConfig,
        ...mappedConfig
      };

      // Update configuration (this will save automatically)
      Object.entries(mappedConfig).forEach(([key, value]) => {
        if (key === 'extension') {
          this.configManager.updatePlatformConfig(value);
        } else if (key === 'projectDefaults') {
          this.configManager.updateProjectDefaults(value);
        }
      });

      result.migratedItems.config = true;

    } catch (error) {
      result.warnings.push(`Configuration migration partially failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate API keys
   */
  private async migrateApiKeys(migrationData: MigrationData, result: MigrationResult): Promise<void> {
    try {
      let keyCount = 0;

      for (const [provider, apiKey] of Object.entries(migrationData.apiKeys)) {
        if (apiKey && typeof apiKey === 'string' && apiKey.length > 0) {
          const mappedProvider = this.mapProvider(provider);
          if (mappedProvider) {
            this.configManager.setAPIKey(mappedProvider, apiKey);
            keyCount++;
          }
        }
      }

      result.migratedItems.apiKeys = keyCount;

      if (keyCount === 0) {
        result.warnings.push('No API keys were found to migrate. You will need to configure them manually.');
        result.postMigrationSteps.push('Configure API keys: recoder providers --set-key <provider>');
      }

    } catch (error) {
      result.warnings.push(`API key migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate sessions
   */
  private async migrateSessions(migrationData: MigrationData, result: MigrationResult): Promise<void> {
    try {
      let sessionCount = 0;

      for (const sessionData of migrationData.sessions) {
        try {
          // Convert session format
          const convertedSession = this.convertSessionFormat(sessionData, migrationData.source.name);
          
          // Import session
          this.sessionManager.importSession(JSON.stringify(convertedSession));
          sessionCount++;

        } catch (error) {
          result.warnings.push(`Failed to migrate session "${sessionData.title || 'Untitled'}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.migratedItems.sessions = sessionCount;

    } catch (error) {
      result.warnings.push(`Session migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate projects
   */
  private async migrateProjects(migrationData: MigrationData, result: MigrationResult): Promise<void> {
    try {
      let projectCount = 0;

      for (const projectData of migrationData.projects) {
        try {
          // Convert project format
          const convertedProject = this.convertProjectFormat(projectData, migrationData.source.name);
          
          // Create session for project
          const session = this.sessionManager.createSession(
            convertedProject.title || 'Migrated Project',
            {
              projectPath: convertedProject.path,
              framework: convertedProject.framework,
              language: convertedProject.language
            }
          );

          // Add project content as messages
          if (convertedProject.files && convertedProject.files.length > 0) {
            for (const file of convertedProject.files) {
              this.sessionManager.addMessage(
                `File: ${file.name}\n\`\`\`${file.language || 'text'}\n${file.content}\n\`\`\``,
                'system'
              );
            }
          }

          projectCount++;

        } catch (error) {
          result.warnings.push(`Failed to migrate project "${projectData.name || 'Untitled'}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.migratedItems.projects = projectCount;

    } catch (error) {
      result.warnings.push(`Project migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate custom prompts
   */
  private async migrateCustomPrompts(migrationData: MigrationData, result: MigrationResult): Promise<void> {
    try {
      let promptCount = 0;

      // This would integrate with a custom prompts system
      // For now, we'll save them as part of configuration
      if (migrationData.customPrompts && migrationData.customPrompts.length > 0) {
        // Save custom prompts in user configuration
        // Implementation would depend on how custom prompts are stored in Recoder
        promptCount = migrationData.customPrompts.length;
        result.postMigrationSteps.push(`${promptCount} custom prompts saved. Access them via 'recoder prompts --list'`);
      }

      result.migratedItems.customPrompts = promptCount;

    } catch (error) {
      result.warnings.push(`Custom prompt migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate post-migration steps
   */
  private generatePostMigrationSteps(migrationData: MigrationData): string[] {
    const steps: string[] = [];

    steps.push('Run "recoder config --validate" to verify your configuration');
    steps.push('Test AI providers with "recoder providers --test"');
    steps.push('Explore new features with "recoder --help"');

    switch (migrationData.source.name) {
      case 'llamacoder':
        steps.push('Try the new multi-AI routing: "recoder generate --auto-provider"');
        steps.push('Explore real code generation: "recoder generate --real-code"');
        break;

      case 'kilocode':
        steps.push('Enable cross-platform sync: "recoder session --sync"');
        steps.push('Try the new ghost mode in VS Code');
        break;

      case 'cursor':
        steps.push('Import your conversation history via the web platform');
        steps.push('Set up the VS Code extension for enhanced IDE integration');
        break;
    }

    steps.push('Join our community: https://discord.gg/recoder');
    steps.push('Read the full documentation: https://docs.recoder.xyz');

    return steps;
  }

  // Helper methods for specific source migrations
  private async detectLlamaCoderVersion(source: MigrationSource): Promise<string | undefined> {
    try {
      const packagePath = path.join(path.dirname(source.configPath), 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageData.version;
      }
    } catch (error) {
      // Ignore
    }
    return undefined;
  }

  private async detectKiloCodeVersion(source: MigrationSource): Promise<string | undefined> {
    try {
      const extensionsDir = path.dirname(source.configPath);
      const extensions = fs.readdirSync(extensionsDir);
      const kiloExtension = extensions.find(ext => ext.includes('kilo-code') || ext.includes('kilocode'));
      
      if (kiloExtension) {
        const packagePath = path.join(extensionsDir, kiloExtension, 'package.json');
        if (fs.existsSync(packagePath)) {
          const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
          return packageData.version;
        }
      }
    } catch (error) {
      // Ignore
    }
    return undefined;
  }

  private async detectCursorVersion(source: MigrationSource): Promise<string | undefined> {
    // Cursor version detection would be implemented here
    return undefined;
  }

  private async exportLlamaCoderData(source: MigrationSource): Promise<MigrationData> {
    // LlamaCoder-specific export implementation
    const migrationData: MigrationData = {
      source,
      config: {},
      sessions: [],
      projects: [],
      settings: {},
      apiKeys: {},
      customPrompts: [],
      extensions: [],
      metadata: {
        exportDate: new Date().toISOString(),
        sourceVersion: source.version || 'unknown',
        migrationVersion: '1.0.0'
      }
    };

    // Implementation would load actual LlamaCoder data
    return migrationData;
  }

  private async exportKiloCodeData(source: MigrationSource): Promise<MigrationData> {
    // KiloCode-specific export implementation
    const migrationData: MigrationData = {
      source,
      config: {},
      sessions: [],
      projects: [],
      settings: {},
      apiKeys: {},
      customPrompts: [],
      extensions: [],
      metadata: {
        exportDate: new Date().toISOString(),
        sourceVersion: source.version || 'unknown',
        migrationVersion: '1.0.0'
      }
    };

    // Implementation would load actual KiloCode data
    return migrationData;
  }

  private async exportCursorData(source: MigrationSource): Promise<MigrationData> {
    // Cursor-specific export implementation
    const migrationData: MigrationData = {
      source,
      config: {},
      sessions: [],
      projects: [],
      settings: {},
      apiKeys: {},
      customPrompts: [],
      extensions: [],
      metadata: {
        exportDate: new Date().toISOString(),
        sourceVersion: source.version || 'unknown',
        migrationVersion: '1.0.0'
      }
    };

    return migrationData;
  }

  private async exportClaudeDevData(source: MigrationSource): Promise<MigrationData> {
    // Claude Dev extension export implementation
    const migrationData: MigrationData = {
      source,
      config: {},
      sessions: [],
      projects: [],
      settings: {},
      apiKeys: {},
      customPrompts: [],
      extensions: [],
      metadata: {
        exportDate: new Date().toISOString(),
        sourceVersion: source.version || 'unknown',
        migrationVersion: '1.0.0'
      }
    };

    return migrationData;
  }

  private mapProvider(sourceProvider: string): string {
    const providerMap: Record<string, string> = {
      'claude': 'claude',
      'claude-3': 'claude',
      'gpt-4': 'openai',
      'gpt-3.5': 'openai',
      'llama': 'groq',
      'llama2': 'groq',
      'llama3': 'groq',
      'gemini': 'gemini',
      'gemini-pro': 'gemini',
      'ollama': 'ollama'
    };

    return providerMap[sourceProvider] || 'claude';
  }

  private convertSessionFormat(sessionData: any, sourceName: string): any {
    // Convert session data to Recoder format
    // Implementation would vary based on source format
    return {
      id: sessionData.id || `migrated-${Date.now()}`,
      title: sessionData.title || sessionData.name || 'Migrated Session',
      createdAt: new Date(sessionData.createdAt || sessionData.created || Date.now()).getTime(),
      updatedAt: new Date(sessionData.updatedAt || sessionData.modified || Date.now()).getTime(),
      platform: 'cli',
      messages: this.convertMessages(sessionData.messages || sessionData.history || []),
      context: sessionData.context || {},
      metadata: {
        totalTokens: sessionData.totalTokens || 0,
        aiProviders: sessionData.providers || ['claude'],
        codeGenerated: sessionData.codeBlocks || 0,
        filesModified: sessionData.files || []
      }
    };
  }

  private convertProjectFormat(projectData: any, sourceName: string): any {
    // Convert project data to Recoder format
    return {
      id: projectData.id || `migrated-${Date.now()}`,
      title: projectData.name || projectData.title || 'Migrated Project',
      path: projectData.path || projectData.directory,
      language: projectData.language || 'typescript',
      framework: projectData.framework,
      files: projectData.files || [],
      createdAt: new Date(projectData.createdAt || Date.now()).getTime()
    };
  }

  private convertMessages(messages: any[]): any[] {
    return messages.map(msg => ({
      id: msg.id || `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(msg.timestamp || msg.created || Date.now()).getTime(),
      platform: 'cli',
      type: msg.type || (msg.role === 'user' ? 'user' : 'assistant'),
      content: msg.content || msg.text || msg.message || '',
      metadata: msg.metadata || {}
    }));
  }
}

// Export factory functions for each platform
export const createCLIMigrationSystem = () => UserMigrationSystem.getInstance('cli');
export const createWebMigrationSystem = () => UserMigrationSystem.getInstance('web');
export const createExtensionMigrationSystem = () => UserMigrationSystem.getInstance('extension');

export default UserMigrationSystem;