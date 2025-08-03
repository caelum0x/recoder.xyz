/**
 * Cross-Platform Synchronization
 * 
 * Sync settings, projects, and AI contexts across all recoder.xyz platforms
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { 
  SyncData, 
  ProjectSync, 
  SettingsSync, 
  AIContextSync, 
  AuthConfig,
  Platform 
} from './types';

export class CrossPlatformSync {
  private syncFile: string;
  private lastSyncData: SyncData | null = null;
  
  constructor(private config: AuthConfig) {
    this.syncFile = join(homedir(), '.recoder', 'sync_data.json');
  }

  /**
   * Sync data to server and other platforms
   */
  async syncToCloud(data: Partial<SyncData>): Promise<void> {
    if (!this.config.syncEnabled) {
      console.log('Sync is disabled');
      return;
    }

    try {
      const currentData = await this.loadLocalSyncData();
      const mergedData: SyncData = {
        userId: data.userId || currentData.userId,
        projects: [...(currentData.projects || []), ...(data.projects || [])],
        settings: { ...currentData.settings, ...data.settings },
        aiContexts: [...(currentData.aiContexts || []), ...(data.aiContexts || [])],
        lastSyncAt: new Date(),
      };

      // Remove duplicates
      mergedData.projects = this.deduplicateProjects(mergedData.projects);
      mergedData.aiContexts = this.deduplicateAIContexts(mergedData.aiContexts);

      // Save locally first
      await this.saveSyncData(mergedData);

      // Sync to server
      await this.uploadToServer(mergedData);

      console.log(`Synced data for user ${mergedData.userId} from ${this.config.platform}`);
    } catch (error) {
      console.error('Failed to sync to cloud:', error);
      throw new Error('Sync to cloud failed');
    }
  }

  /**
   * Download sync data from server
   */
  async syncFromCloud(userId: string): Promise<SyncData | null> {
    if (!this.config.syncEnabled) {
      return null;
    }

    try {
      const serverData = await this.downloadFromServer(userId);
      if (serverData) {
        // Merge with local data
        const localData = await this.loadLocalSyncData();
        const mergedData = this.mergeSyncData(localData, serverData);

        // Save merged data locally
        await this.saveSyncData(mergedData);
        
        this.lastSyncData = mergedData;
        return mergedData;
      }

      return null;
    } catch (error) {
      console.error('Failed to sync from cloud:', error);
      return null;
    }
  }

  /**
   * Get current sync data
   */
  async getCurrentSyncData(): Promise<SyncData | null> {
    if (this.lastSyncData) {
      return this.lastSyncData;
    }

    return this.loadLocalSyncData();
  }

  /**
   * Add project to sync
   */
  async addProject(project: Omit<ProjectSync, 'platform'>): Promise<void> {
    const projectSync: ProjectSync = {
      ...project,
      platform: this.config.platform,
    };

    try {
      const currentData = await this.loadLocalSyncData();
      currentData.projects = currentData.projects || [];
      
      // Remove existing project with same ID
      currentData.projects = currentData.projects.filter(p => p.id !== project.id);
      currentData.projects.push(projectSync);
      currentData.lastSyncAt = new Date();

      await this.saveSyncData(currentData);

      // Trigger sync to cloud
      if (this.config.syncEnabled) {
        await this.syncToCloud({ projects: [projectSync], userId: currentData.userId });
      }
    } catch (error) {
      console.error('Failed to add project to sync:', error);
    }
  }

  /**
   * Update settings sync
   */
  async updateSettings(settings: Partial<SettingsSync>): Promise<void> {
    try {
      const currentData = await this.loadLocalSyncData();
      currentData.settings = { ...currentData.settings, ...settings };
      currentData.lastSyncAt = new Date();

      await this.saveSyncData(currentData);

      // Trigger sync to cloud
      if (this.config.syncEnabled) {
        await this.syncToCloud({ settings: currentData.settings, userId: currentData.userId });
      }
    } catch (error) {
      console.error('Failed to update settings sync:', error);
    }
  }

  /**
   * Add AI context to sync
   */
  async addAIContext(context: Omit<AIContextSync, 'platform'>): Promise<void> {
    const contextSync: AIContextSync = {
      ...context,
      platform: this.config.platform,
    };

    try {
      const currentData = await this.loadLocalSyncData();
      currentData.aiContexts = currentData.aiContexts || [];
      currentData.aiContexts.push(contextSync);
      currentData.lastSyncAt = new Date();

      // Keep only recent contexts (last 100)
      currentData.aiContexts = currentData.aiContexts
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 100);

      await this.saveSyncData(currentData);

      // Trigger sync to cloud
      if (this.config.syncEnabled) {
        await this.syncToCloud({ aiContexts: [contextSync], userId: currentData.userId });
      }
    } catch (error) {
      console.error('Failed to add AI context to sync:', error);
    }
  }

  /**
   * Get projects for current platform
   */
  async getProjectsForPlatform(platform?: Platform): Promise<ProjectSync[]> {
    const data = await this.getCurrentSyncData();
    if (!data?.projects) {
      return [];
    }

    const targetPlatform = platform || this.config.platform;
    return data.projects.filter(p => p.platform === targetPlatform);
  }

  // Private methods

  private async loadLocalSyncData(): Promise<SyncData> {
    try {
      // Ensure config directory exists
      const configDir = join(homedir(), '.recoder');
      await fs.mkdir(configDir, { recursive: true });

      const data = await fs.readFile(this.syncFile, 'utf8');
      const syncData = JSON.parse(data);
      
      // Convert date strings back to Date objects
      return {
        ...syncData,
        lastSyncAt: new Date(syncData.lastSyncAt),
        projects: syncData.projects?.map((p: any) => ({
          ...p,
          lastModified: new Date(p.lastModified),
        })) || [],
        aiContexts: syncData.aiContexts?.map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
        })) || [],
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Return default empty sync data
        return {
          userId: '',
          projects: [],
          settings: {
            theme: 'auto',
            language: 'en',
            aiProviders: [],
            preferences: {},
          },
          aiContexts: [],
          lastSyncAt: new Date(),
        };
      }
      throw error;
    }
  }

  private async saveSyncData(data: SyncData): Promise<void> {
    try {
      const configDir = join(homedir(), '.recoder');
      await fs.mkdir(configDir, { recursive: true });

      // Convert Date objects to strings for JSON storage
      const syncDataForJson = {
        ...data,
        lastSyncAt: data.lastSyncAt.toISOString(),
        projects: data.projects.map(p => ({
          ...p,
          lastModified: p.lastModified.toISOString(),
        })),
        aiContexts: data.aiContexts.map(c => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        })),
      };

      await fs.writeFile(
        this.syncFile,
        JSON.stringify(syncDataForJson, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      console.error('Failed to save sync data:', error);
      throw error;
    }
  }

  private async uploadToServer(data: SyncData): Promise<void> {
    try {
      const response = await fetch(`${this.config.apiUrl}/sync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': this.config.platform,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Sync upload failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to upload to server:', error);
      throw error;
    }
  }

  private async downloadFromServer(userId: string): Promise<SyncData | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/sync/download/${userId}`, {
        method: 'GET',
        headers: {
          'X-Platform': this.config.platform,
        },
      });

      if (response.status === 404) {
        return null; // No sync data found
      }

      if (!response.ok) {
        throw new Error(`Sync download failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert date strings back to Date objects
      return {
        ...data,
        lastSyncAt: new Date(data.lastSyncAt),
        projects: data.projects?.map((p: any) => ({
          ...p,
          lastModified: new Date(p.lastModified),
        })) || [],
        aiContexts: data.aiContexts?.map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
        })) || [],
      };
    } catch (error) {
      console.error('Failed to download from server:', error);
      throw error;
    }
  }

  private mergeSyncData(local: SyncData, server: SyncData): SyncData {
    return {
      userId: local.userId || server.userId,
      projects: this.deduplicateProjects([...local.projects, ...server.projects]),
      settings: { ...local.settings, ...server.settings },
      aiContexts: this.deduplicateAIContexts([...local.aiContexts, ...server.aiContexts]),
      lastSyncAt: new Date(Math.max(local.lastSyncAt.getTime(), server.lastSyncAt.getTime())),
    };
  }

  private deduplicateProjects(projects: ProjectSync[]): ProjectSync[] {
    const seen = new Set<string>();
    return projects.filter(project => {
      if (seen.has(project.id)) {
        return false;
      }
      seen.add(project.id);
      return true;
    });
  }

  private deduplicateAIContexts(contexts: AIContextSync[]): AIContextSync[] {
    const seen = new Set<string>();
    return contexts.filter(context => {
      if (seen.has(context.id)) {
        return false;
      }
      seen.add(context.id);
      return true;
    });
  }
}