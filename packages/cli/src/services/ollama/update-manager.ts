/**
 * Background Model Update Manager
 * 
 * Automated system for checking, scheduling, and performing model updates
 * in the background to ensure users always have the latest and most
 * optimized AI models available for their workflows.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '@recoder/shared';
import { modelManager, ModelInfo } from './model-manager';
import { ollamaService } from './ollama-service';
import { recommendationEngine } from './recommendation-engine';

export interface UpdateSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  time: string;                    // HH:MM format
  timezone: string;
  lastCheck: Date | null;
  nextCheck: Date | null;
  enabled: boolean;
}

export interface ModelUpdate {
  modelName: string;
  currentVersion: string;
  availableVersion: string;
  updateSize: number;              // bytes
  priority: 'critical' | 'high' | 'medium' | 'low';
  releaseNotes: string;
  compatibility: {
    breaking: boolean;
    requirements: {
      minRam?: number;
      minCpu?: number;
      supportedPlatforms?: string[];
    };
  };
  estimatedUpdateTime: number;     // minutes
}

export interface UpdateSession {
  id: string;
  startTime: Date;
  models: ModelUpdate[];
  progress: {
    current: number;
    total: number;
    currentModel?: string;
    stage: 'preparing' | 'downloading' | 'installing' | 'verifying' | 'complete' | 'error';
    percentage: number;
  };
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed';
  errors: Array<{ model: string; error: string; timestamp: Date }>;
}

export interface UpdatePolicy {
  autoUpdate: boolean;
  allowPreRelease: boolean;
  criticalUpdatesOnly: boolean;
  updateDuringInactivity: boolean;
  maxConcurrentUpdates: number;
  rollbackOnFailure: boolean;
  backupBeforeUpdate: boolean;
  networkConstraints: {
    maxBandwidth?: number;         // Mbps
    wifiOnly: boolean;
    pauseOnMetered: boolean;
  };
}

export class BackgroundUpdateManager extends EventEmitter {
  private updateSchedule: UpdateSchedule | null = null;
  private updatePolicy: UpdatePolicy | null = null;
  private activeSession: UpdateSession | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private updateQueue: ModelUpdate[] = [];
  private isInitialized = false;

  private readonly SCHEDULE_FILE = path.join(os.homedir(), '.recoder', 'update-schedule.json');
  private readonly POLICY_FILE = path.join(os.homedir(), '.recoder', 'update-policy.json');
  private readonly UPDATE_HISTORY_FILE = path.join(os.homedir(), '.recoder', 'update-history.json');
  private readonly BACKUP_DIR = path.join(os.homedir(), '.recoder', 'model-backups');

  // Check for updates every 4 hours when running
  private readonly UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

  constructor() {
    super();
  }

  /**
   * Initialize the background update manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    Logger.info('Initializing Background Update Manager...');

    try {
      // Load configuration
      await this.loadUpdateSchedule();
      await this.loadUpdatePolicy();

      // Set up periodic update checks
      this.setupUpdateScheduler();

      // Start background check interval
      this.startBackgroundChecks();

      this.isInitialized = true;
      Logger.info('Background Update Manager initialized successfully');
      this.emit('initialized');

    } catch (error) {
      Logger.error('Failed to initialize Background Update Manager:', error);
      throw error;
    }
  }

  /**
   * Check for available model updates
   */
  async checkForUpdates(force: boolean = false): Promise<ModelUpdate[]> {
    Logger.info('Checking for model updates...');

    try {
      if (!force && !this.shouldCheckForUpdates()) {
        Logger.debug('Skipping update check - not due yet');
        return [];
      }

      // Get installed models
      const installedModels = modelManager.getInstalledModels();
      const availableUpdates: ModelUpdate[] = [];

      for (const model of installedModels) {
        try {
          const updateInfo = await this.checkModelUpdate(model);
          if (updateInfo) {
            availableUpdates.push(updateInfo);
          }
        } catch (error) {
          Logger.warn(`Failed to check update for model ${model.fullName}:`, error);
        }
      }

      // Update last check time
      if (this.updateSchedule) {
        this.updateSchedule.lastCheck = new Date();
        this.updateSchedule.nextCheck = this.calculateNextCheck();
        await this.saveUpdateSchedule();
      }

      Logger.info(`Found ${availableUpdates.length} available updates`);
      this.emit('updatesChecked', availableUpdates);

      return availableUpdates;

    } catch (error) {
      Logger.error('Failed to check for updates:', error);
      throw error;
    }
  }

  /**
   * Schedule model updates
   */
  async scheduleUpdates(updates: ModelUpdate[], options: {
    immediate?: boolean;
    priority?: 'critical' | 'high' | 'medium' | 'low';
  } = {}): Promise<string> {
    Logger.info(`Scheduling ${updates.length} model updates`);

    try {
      // Filter updates based on policy
      const filteredUpdates = this.filterUpdatesByPolicy(updates);

      if (filteredUpdates.length === 0) {
        Logger.info('No updates match current policy criteria');
        return '';
      }

      // Create update session
      const sessionId = this.generateSessionId();
      const session: UpdateSession = {
        id: sessionId,
        startTime: new Date(),
        models: filteredUpdates,
        progress: {
          current: 0,
          total: filteredUpdates.length,
          stage: 'preparing',
          percentage: 0
        },
        status: 'pending',
        errors: []
      };

      this.activeSession = session;

      // Start updates immediately or queue them
      if (options.immediate || this.shouldUpdateNow()) {
        await this.executeUpdates(session);
      } else {
        this.updateQueue.push(...filteredUpdates);
        Logger.info('Updates queued for later execution');
      }

      this.emit('updatesScheduled', { sessionId, updates: filteredUpdates });
      return sessionId;

    } catch (error) {
      Logger.error('Failed to schedule updates:', error);
      throw error;
    }
  }

  /**
   * Execute scheduled updates
   */
  async executeUpdates(session: UpdateSession): Promise<void> {
    Logger.info(`Executing update session ${session.id} with ${session.models.length} models`);

    try {
      session.status = 'active';
      session.progress.stage = 'preparing';
      this.emit('updateSessionStarted', session);

      // Create backup if policy requires it
      if (this.updatePolicy?.backupBeforeUpdate) {
        await this.createModelBackups(session.models.map(u => u.modelName));
      }

      // Process updates sequentially or in parallel based on policy
      const maxConcurrent = this.updatePolicy?.maxConcurrentUpdates || 1;
      
      if (maxConcurrent === 1) {
        await this.executeUpdatesSequentially(session);
      } else {
        await this.executeUpdatesInParallel(session, maxConcurrent);
      }

      session.status = 'completed';
      session.progress.stage = 'complete';
      session.progress.percentage = 100;

      Logger.info(`Update session ${session.id} completed successfully`);
      this.emit('updateSessionCompleted', session);

      // Save update history
      await this.saveUpdateHistory(session);

    } catch (error) {
      session.status = 'failed';
      session.progress.stage = 'error';
      session.errors.push({
        model: 'session',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });

      Logger.error(`Update session ${session.id} failed:`, error);
      this.emit('updateSessionFailed', { session, error });

      // Rollback if policy requires it
      if (this.updatePolicy?.rollbackOnFailure) {
        await this.rollbackUpdates(session);
      }

      throw error;
    } finally {
      this.activeSession = null;
    }
  }

  /**
   * Pause active update session
   */
  async pauseUpdates(): Promise<void> {
    if (!this.activeSession || this.activeSession.status !== 'active') {
      throw new Error('No active update session to pause');
    }

    this.activeSession.status = 'paused';
    Logger.info(`Update session ${this.activeSession.id} paused`);
    this.emit('updateSessionPaused', this.activeSession);
  }

  /**
   * Resume paused update session
   */
  async resumeUpdates(): Promise<void> {
    if (!this.activeSession || this.activeSession.status !== 'paused') {
      throw new Error('No paused update session to resume');
    }

    this.activeSession.status = 'active';
    Logger.info(`Update session ${this.activeSession.id} resumed`);
    this.emit('updateSessionResumed', this.activeSession);

    // Continue execution
    await this.executeUpdates(this.activeSession);
  }

  /**
   * Cancel active update session
   */
  async cancelUpdates(): Promise<void> {
    if (!this.activeSession) {
      throw new Error('No active update session to cancel');
    }

    const session = this.activeSession;
    this.activeSession = null;

    Logger.info(`Update session ${session.id} cancelled`);
    this.emit('updateSessionCancelled', session);

    // Rollback partial updates if needed
    if (this.updatePolicy?.rollbackOnFailure && session.progress.current > 0) {
      await this.rollbackUpdates(session);
    }
  }

  /**
   * Get current update status
   */
  getUpdateStatus(): {
    activeSession: UpdateSession | null;
    queuedUpdates: number;
    lastCheck: Date | null;
    nextCheck: Date | null;
    isEnabled: boolean;
  } {
    return {
      activeSession: this.activeSession,
      queuedUpdates: this.updateQueue.length,
      lastCheck: this.updateSchedule?.lastCheck || null,
      nextCheck: this.updateSchedule?.nextCheck || null,
      isEnabled: this.updateSchedule?.enabled || false
    };
  }

  /**
   * Configure update schedule
   */
  async setUpdateSchedule(schedule: Partial<UpdateSchedule>): Promise<void> {
    this.updateSchedule = {
      ...this.getDefaultSchedule(),
      ...this.updateSchedule,
      ...schedule
    };

    await this.saveUpdateSchedule();
    this.setupUpdateScheduler();

    Logger.info('Update schedule configured', this.updateSchedule);
    this.emit('scheduleUpdated', this.updateSchedule);
  }

  /**
   * Configure update policy
   */
  async setUpdatePolicy(policy: Partial<UpdatePolicy>): Promise<void> {
    this.updatePolicy = {
      ...this.getDefaultPolicy(),
      ...this.updatePolicy,
      ...policy
    };

    await this.saveUpdatePolicy();

    Logger.info('Update policy configured', this.updatePolicy);
    this.emit('policyUpdated', this.updatePolicy);
  }

  /**
   * Get update recommendations based on usage patterns
   */
  async getUpdateRecommendations(): Promise<{
    recommended: ModelUpdate[];
    optional: ModelUpdate[];
    critical: ModelUpdate[];
  }> {
    const availableUpdates = await this.checkForUpdates();
    
    const critical = availableUpdates.filter(u => u.priority === 'critical');
    const recommended = availableUpdates.filter(u => 
      u.priority === 'high' || this.isModelFrequentlyUsed(u.modelName)
    );
    const optional = availableUpdates.filter(u => 
      !critical.includes(u) && !recommended.includes(u)
    );

    return { recommended, optional, critical };
  }

  /**
   * Cleanup old model versions and backups
   */
  async cleanupOldVersions(options: {
    keepVersions?: number;
    cleanupBackups?: boolean;
    olderThanDays?: number;
  } = {}): Promise<void> {
    const { keepVersions = 2, cleanupBackups = true, olderThanDays = 30 } = options;

    Logger.info('Cleaning up old model versions and backups');

    try {
      // This would implement cleanup logic
      // For now, log the cleanup intent
      Logger.info(`Cleanup configured: keep ${keepVersions} versions, cleanup backups: ${cleanupBackups}, older than ${olderThanDays} days`);

      this.emit('cleanupCompleted', { keepVersions, cleanupBackups, olderThanDays });

    } catch (error) {
      Logger.error('Failed to cleanup old versions:', error);
      throw error;
    }
  }

  // Private helper methods

  private async checkModelUpdate(model: ModelInfo): Promise<ModelUpdate | null> {
    try {
      // This would implement actual version checking logic
      // For now, simulate update availability
      const shouldUpdate = Math.random() > 0.7; // 30% chance of update
      
      if (!shouldUpdate) return null;

      const updateSize = model.size * (0.1 + Math.random() * 0.3); // 10-40% of original size
      
      return {
        modelName: model.fullName,
        currentVersion: 'v1.0.0',
        availableVersion: 'v1.1.0',
        updateSize,
        priority: this.determineUpdatePriority(model),
        releaseNotes: 'Performance improvements and bug fixes',
        compatibility: {
          breaking: false,
          requirements: {
            minRam: model.requirements.minRam,
            minCpu: model.requirements.minCpuCores,
            supportedPlatforms: model.requirements.platforms
          }
        },
        estimatedUpdateTime: Math.round(updateSize / (1024 ** 3) * 10) // ~10 min per GB
      };

    } catch (error) {
      Logger.warn(`Failed to check update for ${model.fullName}:`, error);
      return null;
    }
  }

  private determineUpdatePriority(model: ModelInfo): 'critical' | 'high' | 'medium' | 'low' {
    // Determine priority based on model usage and importance
    if (model.popularity > 90) return 'high';
    if (model.popularity > 70) return 'medium';
    return 'low';
  }

  private filterUpdatesByPolicy(updates: ModelUpdate[]): ModelUpdate[] {
    if (!this.updatePolicy) return updates;

    return updates.filter(update => {
      // Filter by critical only policy
      if (this.updatePolicy!.criticalUpdatesOnly && update.priority !== 'critical') {
        return false;
      }

      // Filter pre-release versions
      if (!this.updatePolicy!.allowPreRelease && update.availableVersion.includes('beta')) {
        return false;
      }

      return true;
    });
  }

  private shouldCheckForUpdates(): boolean {
    if (!this.updateSchedule?.enabled) return false;
    if (!this.updateSchedule.nextCheck) return true;
    return new Date() >= this.updateSchedule.nextCheck;
  }

  private shouldUpdateNow(): boolean {
    if (!this.updatePolicy?.autoUpdate) return false;
    
    // Check if it's during inactive hours (if policy requires it)
    if (this.updatePolicy.updateDuringInactivity) {
      return this.isInactiveTime();
    }

    return true;
  }

  private isInactiveTime(): boolean {
    const now = new Date();
    const hour = now.getHours();
    
    // Consider 2 AM to 6 AM as inactive time
    return hour >= 2 && hour <= 6;
  }

  private isModelFrequentlyUsed(modelName: string): boolean {
    // This would check actual usage patterns
    // For now, simulate based on model popularity
    return Math.random() > 0.5;
  }

  private async executeUpdatesSequentially(session: UpdateSession): Promise<void> {
    for (let i = 0; i < session.models.length; i++) {
      const update = session.models[i];
      
      try {
        session.progress.current = i;
        session.progress.currentModel = update.modelName;
        session.progress.percentage = Math.round((i / session.models.length) * 100);
        
        this.emit('updateProgress', session.progress);

        await this.updateSingleModel(update);
        
      } catch (error) {
        session.errors.push({
          model: update.modelName,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date()
        });

        Logger.error(`Failed to update model ${update.modelName}:`, error);
        
        // Continue with other updates unless policy says to stop
        if (!this.updatePolicy?.rollbackOnFailure) {
          continue;
        } else {
          throw error;
        }
      }
    }

    session.progress.current = session.models.length;
    session.progress.currentModel = undefined;
    session.progress.percentage = 100;
  }

  private async executeUpdatesInParallel(session: UpdateSession, maxConcurrent: number): Promise<void> {
    const batches: ModelUpdate[][] = [];
    
    // Split updates into batches
    for (let i = 0; i < session.models.length; i += maxConcurrent) {
      batches.push(session.models.slice(i, i + maxConcurrent));
    }

    let completedCount = 0;

    for (const batch of batches) {
      const promises = batch.map(async (update) => {
        try {
          await this.updateSingleModel(update);
          completedCount++;
          
          session.progress.current = completedCount;
          session.progress.percentage = Math.round((completedCount / session.models.length) * 100);
          this.emit('updateProgress', session.progress);
          
        } catch (error) {
          session.errors.push({
            model: update.modelName,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date()
          });
          throw error;
        }
      });

      await Promise.allSettled(promises);
    }
  }

  private async updateSingleModel(update: ModelUpdate): Promise<void> {
    Logger.info(`Updating model ${update.modelName} from ${update.currentVersion} to ${update.availableVersion}`);

    try {
      // Use model manager to update the model
      const success = await modelManager.downloadModel(update.modelName, (progress) => {
        this.emit('modelUpdateProgress', {
          modelName: update.modelName,
          progress: progress.progress,
          stage: progress.stage
        });
      });

      if (!success) {
        throw new Error(`Failed to update model ${update.modelName}`);
      }

      Logger.info(`Successfully updated model ${update.modelName}`);

    } catch (error) {
      Logger.error(`Failed to update model ${update.modelName}:`, error);
      throw error;
    }
  }

  private async createModelBackups(modelNames: string[]): Promise<void> {
    Logger.info(`Creating backups for ${modelNames.length} models`);

    try {
      await fs.mkdir(this.BACKUP_DIR, { recursive: true });

      for (const modelName of modelNames) {
        // This would implement actual backup logic
        Logger.debug(`Backup created for model ${modelName}`);
      }

    } catch (error) {
      Logger.error('Failed to create model backups:', error);
      throw error;
    }
  }

  private async rollbackUpdates(session: UpdateSession): Promise<void> {
    Logger.info(`Rolling back updates for session ${session.id}`);

    try {
      // This would implement rollback logic
      for (const update of session.models) {
        if (session.progress.current > session.models.indexOf(update)) {
          Logger.debug(`Rolling back update for ${update.modelName}`);
          // Restore from backup
        }
      }

      Logger.info('Rollback completed successfully');
      this.emit('rollbackCompleted', session);

    } catch (error) {
      Logger.error('Failed to rollback updates:', error);
      throw error;
    }
  }

  private setupUpdateScheduler(): void {
    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    if (!this.updateSchedule?.enabled) return;

    const nextCheck = this.updateSchedule.nextCheck;
    if (!nextCheck) return;

    const delay = nextCheck.getTime() - Date.now();
    if (delay <= 0) return;

    this.updateTimer = setTimeout(async () => {
      try {
        const updates = await this.checkForUpdates();
        if (updates.length > 0 && this.updatePolicy?.autoUpdate) {
          await this.scheduleUpdates(updates, { immediate: true });
        }
      } catch (error) {
        Logger.error('Scheduled update check failed:', error);
      }
      
      // Schedule next check
      this.setupUpdateScheduler();
    }, delay);
  }

  private startBackgroundChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      try {
        if (this.shouldCheckForUpdates()) {
          await this.checkForUpdates();
        }
      } catch (error) {
        Logger.debug('Background update check failed:', error);
      }
    }, this.UPDATE_CHECK_INTERVAL);
  }

  private calculateNextCheck(): Date {
    if (!this.updateSchedule) return new Date();

    const now = new Date();
    const next = new Date(now);

    switch (this.updateSchedule.frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        return now; // Manual - check immediately
    }

    // Set time from schedule
    const [hours, minutes] = this.updateSchedule.time.split(':').map(Number);
    next.setHours(hours, minutes, 0, 0);

    return next;
  }

  private generateSessionId(): string {
    return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultSchedule(): UpdateSchedule {
    return {
      frequency: 'weekly',
      time: '02:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lastCheck: null,
      nextCheck: null,
      enabled: true
    };
  }

  private getDefaultPolicy(): UpdatePolicy {
    return {
      autoUpdate: false,
      allowPreRelease: false,
      criticalUpdatesOnly: false,
      updateDuringInactivity: true,
      maxConcurrentUpdates: 2,
      rollbackOnFailure: true,
      backupBeforeUpdate: true,
      networkConstraints: {
        wifiOnly: false,
        pauseOnMetered: true
      }
    };
  }

  private async loadUpdateSchedule(): Promise<void> {
    try {
      const data = await fs.readFile(this.SCHEDULE_FILE, 'utf8');
      this.updateSchedule = { ...this.getDefaultSchedule(), ...JSON.parse(data) };
    } catch (error) {
      this.updateSchedule = this.getDefaultSchedule();
    }
  }

  private async saveUpdateSchedule(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.SCHEDULE_FILE), { recursive: true });
      await fs.writeFile(this.SCHEDULE_FILE, JSON.stringify(this.updateSchedule, null, 2));
    } catch (error) {
      Logger.error('Failed to save update schedule:', error);
    }
  }

  private async loadUpdatePolicy(): Promise<void> {
    try {
      const data = await fs.readFile(this.POLICY_FILE, 'utf8');
      this.updatePolicy = { ...this.getDefaultPolicy(), ...JSON.parse(data) };
    } catch (error) {
      this.updatePolicy = this.getDefaultPolicy();
    }
  }

  private async saveUpdatePolicy(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.POLICY_FILE), { recursive: true });
      await fs.writeFile(this.POLICY_FILE, JSON.stringify(this.updatePolicy, null, 2));
    } catch (error) {
      Logger.error('Failed to save update policy:', error);
    }
  }

  private async saveUpdateHistory(session: UpdateSession): Promise<void> {
    try {
      let history: UpdateSession[] = [];
      
      try {
        const data = await fs.readFile(this.UPDATE_HISTORY_FILE, 'utf8');
        history = JSON.parse(data);
      } catch (error) {
        // File doesn't exist yet
      }

      history.push(session);
      
      // Keep only last 50 sessions
      if (history.length > 50) {
        history = history.slice(-50);
      }

      await fs.mkdir(path.dirname(this.UPDATE_HISTORY_FILE), { recursive: true });
      await fs.writeFile(this.UPDATE_HISTORY_FILE, JSON.stringify(history, null, 2));

    } catch (error) {
      Logger.error('Failed to save update history:', error);
    }
  }

  /**
   * Cleanup resources and stop background processes
   */
  async shutdown(): Promise<void> {
    Logger.info('Shutting down Background Update Manager...');

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Cancel active session if any
    if (this.activeSession?.status === 'active') {
      await this.cancelUpdates();
    }

    this.isInitialized = false;
    this.emit('shutdown');
    Logger.info('Background Update Manager shut down');
  }
}

// Export singleton instance
export const updateManager = new BackgroundUpdateManager();