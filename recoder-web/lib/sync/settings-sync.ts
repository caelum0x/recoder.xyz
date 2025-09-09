/**
 * Settings and Preferences Synchronization System
 * Handles real-time sync of user settings across all platforms
 */

import { Redis } from 'ioredis';
import { WebSocket } from 'ws';

export interface UserSettingsState {
  userId: string;
  lastModified: string;
  modifiedBy: {
    platform: string;
    sessionId: string;
  };
  version: number;
  
  // Editor Settings
  editor: {
    theme: 'light' | 'dark' | 'auto';
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    insertSpaces: boolean;
    wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
    minimap: boolean;
    lineNumbers: 'on' | 'off' | 'relative' | 'interval';
    cursorStyle: 'line' | 'block' | 'underline';
    cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
    autoSave: 'off' | 'afterDelay' | 'onWindowChange' | 'onFocusChange';
    formatOnSave: boolean;
    formatOnType: boolean;
    formatOnPaste: boolean;
  };

  // AI Settings
  ai: {
    preferredModels: string[];
    consensusMode: boolean;
    autoSuggestions: boolean;
    suggestionDelay: number;
    maxTokens: number;
    temperature: number;
    enableCodeCompletion: boolean;
    enableChatAssistant: boolean;
    enableCodeReview: boolean;
    contextWindow: number;
    customPrompts: {
      id: string;
      name: string;
      prompt: string;
      category: string;
    }[];
  };

  // Notification Settings
  notifications: {
    email: {
      enabled: boolean;
      projectUpdates: boolean;
      deploymentStatus: boolean;
      collaborationInvites: boolean;
      securityAlerts: boolean;
      marketingEmails: boolean;
      weeklyDigest: boolean;
    };
    push: {
      enabled: boolean;
      projectUpdates: boolean;
      deploymentStatus: boolean;
      collaborationInvites: boolean;
      mentions: boolean;
      securityAlerts: boolean;
    };
    inApp: {
      enabled: boolean;
      sound: boolean;
      desktop: boolean;
      projectUpdates: boolean;
      deploymentStatus: boolean;
      collaborationInvites: boolean;
      mentions: boolean;
    };
    quietHours: {
      enabled: boolean;
      startTime: string; // HH:MM format
      endTime: string;   // HH:MM format
      timezone: string;
    };
  };

  // Privacy Settings
  privacy: {
    profileVisibility: 'public' | 'private' | 'team';
    projectVisibility: 'public' | 'private' | 'team';
    analyticsOptOut: boolean;
    dataCollection: boolean;
    telemetryOptOut: boolean;
    thirdPartyIntegrations: boolean;
    marketingCommunications: boolean;
  };

  // Collaboration Settings
  collaboration: {
    defaultProjectVisibility: 'public' | 'private' | 'team';
    allowGuestAccess: boolean;
    requireApprovalForSharing: boolean;
    defaultRole: 'viewer' | 'editor' | 'admin';
    enableRealTimeCollaboration: boolean;
    showPresenceIndicators: boolean;
    enableVoiceChat: boolean;
    enableVideoChat: boolean;
    enableScreenSharing: boolean;
  };

  // Workspace Settings
  workspace: {
    defaultLanguage: string;
    defaultFramework: string;
    autoBackup: boolean;
    backupInterval: number; // minutes
    maxBackups: number;
    enableVersionControl: boolean;
    enableAutoCommit: boolean;
    commitMessageTemplate: string;
    enableLinting: boolean;
    enableFormatting: boolean;
    enableTesting: boolean;
  };

  // Accessibility Settings
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    screenReaderOptimized: boolean;
    keyboardNavigation: boolean;
    focusIndicators: boolean;
    textScaling: number; // 0.8 to 2.0
    colorBlindnessSupport: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
    customColorScheme?: {
      background: string;
      foreground: string;
      accent: string;
    };
  };

  // Integrations Settings
  integrations: {
    github: {
      enabled: boolean;
      autoSync: boolean;
      defaultBranch: string;
      autoCreatePR: boolean;
    };
    vercel: {
      enabled: boolean;
      autoDeployment: boolean;
      environmentVariables: Record<string, string>;
    };
    aws: {
      enabled: boolean;
      defaultRegion: string;
      autoBackup: boolean;
    };
    slack: {
      enabled: boolean;
      notifications: boolean;
      channel: string;
    };
    discord: {
      enabled: boolean;
      notifications: boolean;
      webhookUrl: string;
    };
  };

  // Keyboard Shortcuts
  shortcuts: {
    [command: string]: string[];
  };

  // Custom Settings (platform-specific)
  custom: Record<string, any>;
}

export interface SettingsSyncEvent {
  type: 'settings_updated' | 'settings_reset' | 'settings_imported' | 'settings_exported';
  userId: string;
  sessionId: string;
  platform: string;
  timestamp: string;
  data: {
    section?: keyof UserSettingsState;
    changes: Partial<UserSettingsState>;
    previousVersion: number;
    newVersion: number;
  };
}

export class SettingsSyncManager {
  private redis: Redis;
  private wsConnections: Map<string, Set<WebSocket>> = new Map();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_SETTINGS_DB || '2'),
      keyPrefix: 'recoder:settings:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettingsState> {
    const settingsData = await this.redis.get(`user:${userId}`);
    
    if (settingsData) {
      try {
        return JSON.parse(settingsData);
      } catch (error) {
        console.error('Failed to parse settings data:', error);
      }
    }

    // Return default settings if none exist
    return this.getDefaultSettings(userId);
  }

  /**
   * Update user settings
   */
  async updateUserSettings(
    userId: string,
    sessionId: string,
    platform: string,
    updates: Partial<UserSettingsState>,
    section?: keyof UserSettingsState
  ): Promise<UserSettingsState> {
    const currentSettings = await this.getUserSettings(userId);
    const previousVersion = currentSettings.version;

    // Merge updates with current settings
    const updatedSettings: UserSettingsState = {
      ...currentSettings,
      ...updates,
      userId,
      lastModified: new Date().toISOString(),
      modifiedBy: { platform, sessionId },
      version: previousVersion + 1,
    };

    // Store updated settings
    await this.redis.setex(
      `user:${userId}`,
      365 * 24 * 60 * 60, // 1 year TTL
      JSON.stringify(updatedSettings)
    );

    // Broadcast settings update event
    await this.broadcastSettingsEvent({
      type: 'settings_updated',
      userId,
      sessionId,
      platform,
      timestamp: new Date().toISOString(),
      data: {
        section,
        changes: updates,
        previousVersion,
        newVersion: updatedSettings.version,
      },
    });

    return updatedSettings;
  }

  /**
   * Update specific settings section
   */
  async updateSettingsSection<K extends keyof UserSettingsState>(
    userId: string,
    sessionId: string,
    platform: string,
    section: K,
    updates: Partial<UserSettingsState[K]>
  ): Promise<UserSettingsState[K]> {
    const currentSettings = await this.getUserSettings(userId);
    
    const updatedSection = {
      ...(currentSettings[section] as object),
      ...updates,
    } as UserSettingsState[K];

    await this.updateUserSettings(
      userId,
      sessionId,
      platform,
      { [section]: updatedSection } as Partial<UserSettingsState>,
      section
    );

    return updatedSection;
  }

  /**
   * Reset settings to defaults
   */
  async resetUserSettings(
    userId: string,
    sessionId: string,
    platform: string,
    section?: keyof UserSettingsState
  ): Promise<UserSettingsState> {
    const defaultSettings = this.getDefaultSettings(userId);
    
    if (section) {
      // Reset only specific section
      const currentSettings = await this.getUserSettings(userId);
      const resetSettings = {
        ...currentSettings,
        [section]: defaultSettings[section],
      };
      
      return await this.updateUserSettings(userId, sessionId, platform, resetSettings, section);
    } else {
      // Reset all settings
      await this.redis.setex(
        `user:${userId}`,
        365 * 24 * 60 * 60,
        JSON.stringify(defaultSettings)
      );

      await this.broadcastSettingsEvent({
        type: 'settings_reset',
        userId,
        sessionId,
        platform,
        timestamp: new Date().toISOString(),
        data: {
          changes: defaultSettings,
          previousVersion: 0,
          newVersion: 1,
        },
      });

      return defaultSettings;
    }
  }

  /**
   * Export user settings
   */
  async exportUserSettings(userId: string): Promise<UserSettingsState> {
    const settings = await this.getUserSettings(userId);
    
    await this.broadcastSettingsEvent({
      type: 'settings_exported',
      userId,
      sessionId: 'system',
      platform: 'api',
      timestamp: new Date().toISOString(),
      data: {
        changes: settings,
        previousVersion: settings.version,
        newVersion: settings.version,
      },
    });

    return settings;
  }

  /**
   * Import user settings
   */
  async importUserSettings(
    userId: string,
    sessionId: string,
    platform: string,
    settings: Partial<UserSettingsState>
  ): Promise<UserSettingsState> {
    const currentSettings = await this.getUserSettings(userId);
    
    const importedSettings: UserSettingsState = {
      ...this.getDefaultSettings(userId),
      ...settings,
      userId,
      lastModified: new Date().toISOString(),
      modifiedBy: { platform, sessionId },
      version: currentSettings.version + 1,
    };

    await this.redis.setex(
      `user:${userId}`,
      365 * 24 * 60 * 60,
      JSON.stringify(importedSettings)
    );

    await this.broadcastSettingsEvent({
      type: 'settings_imported',
      userId,
      sessionId,
      platform,
      timestamp: new Date().toISOString(),
      data: {
        changes: importedSettings,
        previousVersion: currentSettings.version,
        newVersion: importedSettings.version,
      },
    });

    return importedSettings;
  }

  /**
   * Register WebSocket connection for settings updates
   */
  registerSettingsWebSocket(userId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(userId)) {
      this.wsConnections.set(userId, new Set());
    }
    
    this.wsConnections.get(userId)!.add(ws);

    ws.on('close', () => {
      this.wsConnections.get(userId)?.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for user settings', userId, error);
      this.wsConnections.get(userId)?.delete(ws);
    });
  }

  /**
   * Broadcast settings event to all user connections
   */
  private async broadcastSettingsEvent(event: SettingsSyncEvent): Promise<void> {
    // Store event in Redis for replay
    await this.redis.lpush(
      `events:${event.userId}`,
      JSON.stringify(event)
    );
    
    // Keep only last 100 events per user
    await this.redis.ltrim(`events:${event.userId}`, 0, 99);

    // Broadcast to all user's WebSocket connections
    const connections = this.wsConnections.get(event.userId);
    if (connections) {
      const message = JSON.stringify(event);
      
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
          } catch (error) {
            console.error('Failed to send WebSocket message:', error);
            connections.delete(ws);
          }
        } else {
          connections.delete(ws);
        }
      }
    }
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(userId: string): UserSettingsState {
    return {
      userId,
      lastModified: new Date().toISOString(),
      modifiedBy: { platform: 'system', sessionId: 'init' },
      version: 1,
      
      editor: {
        theme: 'dark',
        fontSize: 14,
        fontFamily: 'Fira Code, Monaco, monospace',
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        minimap: true,
        lineNumbers: 'on',
        cursorStyle: 'line',
        cursorBlinking: 'blink',
        autoSave: 'afterDelay',
        formatOnSave: true,
        formatOnType: false,
        formatOnPaste: true,
      },

      ai: {
        preferredModels: ['claude-3-5-sonnet', 'gpt-4o'],
        consensusMode: true,
        autoSuggestions: true,
        suggestionDelay: 500,
        maxTokens: 4000,
        temperature: 0.7,
        enableCodeCompletion: true,
        enableChatAssistant: true,
        enableCodeReview: true,
        contextWindow: 8000,
        customPrompts: [],
      },

      notifications: {
        email: {
          enabled: true,
          projectUpdates: true,
          deploymentStatus: true,
          collaborationInvites: true,
          securityAlerts: true,
          marketingEmails: false,
          weeklyDigest: true,
        },
        push: {
          enabled: true,
          projectUpdates: true,
          deploymentStatus: true,
          collaborationInvites: true,
          mentions: true,
          securityAlerts: true,
        },
        inApp: {
          enabled: true,
          sound: true,
          desktop: true,
          projectUpdates: true,
          deploymentStatus: true,
          collaborationInvites: true,
          mentions: true,
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'UTC',
        },
      },

      privacy: {
        profileVisibility: 'public',
        projectVisibility: 'private',
        analyticsOptOut: false,
        dataCollection: true,
        telemetryOptOut: false,
        thirdPartyIntegrations: true,
        marketingCommunications: false,
      },

      collaboration: {
        defaultProjectVisibility: 'private',
        allowGuestAccess: false,
        requireApprovalForSharing: true,
        defaultRole: 'viewer',
        enableRealTimeCollaboration: true,
        showPresenceIndicators: true,
        enableVoiceChat: true,
        enableVideoChat: true,
        enableScreenSharing: true,
      },

      workspace: {
        defaultLanguage: 'typescript',
        defaultFramework: 'next',
        autoBackup: true,
        backupInterval: 30,
        maxBackups: 10,
        enableVersionControl: true,
        enableAutoCommit: false,
        commitMessageTemplate: 'feat: {description}',
        enableLinting: true,
        enableFormatting: true,
        enableTesting: true,
      },

      accessibility: {
        highContrast: false,
        reducedMotion: false,
        screenReaderOptimized: false,
        keyboardNavigation: true,
        focusIndicators: true,
        textScaling: 1.0,
        colorBlindnessSupport: 'none',
      },

      integrations: {
        github: {
          enabled: false,
          autoSync: false,
          defaultBranch: 'main',
          autoCreatePR: false,
        },
        vercel: {
          enabled: false,
          autoDeployment: false,
          environmentVariables: {},
        },
        aws: {
          enabled: false,
          defaultRegion: 'us-east-1',
          autoBackup: false,
        },
        slack: {
          enabled: false,
          notifications: false,
          channel: '',
        },
        discord: {
          enabled: false,
          notifications: false,
          webhookUrl: '',
        },
      },

      shortcuts: {
        'save': ['Ctrl+S', 'Cmd+S'],
        'copy': ['Ctrl+C', 'Cmd+C'],
        'paste': ['Ctrl+V', 'Cmd+V'],
        'undo': ['Ctrl+Z', 'Cmd+Z'],
        'redo': ['Ctrl+Y', 'Cmd+Shift+Z'],
        'find': ['Ctrl+F', 'Cmd+F'],
        'replace': ['Ctrl+H', 'Cmd+Alt+F'],
        'newFile': ['Ctrl+N', 'Cmd+N'],
        'openFile': ['Ctrl+O', 'Cmd+O'],
        'closeFile': ['Ctrl+W', 'Cmd+W'],
        'aiAssistant': ['Ctrl+Space', 'Cmd+Space'],
        'aiConsensus': ['Ctrl+Shift+A', 'Cmd+Shift+A'],
        'toggleSidebar': ['Ctrl+B', 'Cmd+B'],
        'toggleTerminal': ['Ctrl+`', 'Cmd+`'],
        'formatDocument': ['Shift+Alt+F', 'Shift+Option+F'],
      },

      custom: {},
    };
  }

  /**
   * Get settings events
   */
  async getSettingsEvents(userId: string, limit: number = 50): Promise<SettingsSyncEvent[]> {
    const events = await this.redis.lrange(`events:${userId}`, 0, limit - 1);
    return events.map(event => JSON.parse(event));
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

// Export singleton instance
export const settingsSync = new SettingsSyncManager();
