/**
 * Plugin Analytics Tracker - Tracks plugin usage and performance metrics
 */

import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';

export interface PluginUsageMetrics {
  pluginId: string;
  installDate: Date;
  lastUsed: Date;
  activationCount: number;
  deactivationCount: number;
  totalActiveTime: number; // milliseconds
  commandsExecuted: number;
  errorsEncountered: number;
  performanceMetrics: {
    averageActivationTime: number;
    averageCommandExecutionTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  eventMetrics: {
    eventsPublished: number;
    eventsSubscribed: number;
    eventHandlingErrors: number;
  };
}

export interface SystemAnalytics {
  totalPlugins: number;
  activePlugins: number;
  totalUsageTime: number;
  totalCommands: number;
  totalErrors: number;
  mostUsedPlugins: Array<{ pluginId: string; usageTime: number }>;
  errorReport: Array<{ pluginId: string; errorCount: number; lastError: Date }>;
  performanceSummary: {
    averageMemoryUsage: number;
    averageCpuUsage: number;
    totalMemoryUsed: number;
  };
}

export class PluginAnalyticsTracker extends EventEmitter {
  private metrics: Map<string, PluginUsageMetrics> = new Map();
  private activationTimes: Map<string, Date> = new Map();
  private commandStartTimes: Map<string, Date> = new Map();
  private flushInterval: NodeJS.Timer | null = null;
  private metricsBuffer: Array<{ timestamp: Date; type: string; data: any }> = [];

  constructor(
    private config: {
      flushIntervalMs?: number;
      maxBufferSize?: number;
      enablePerformanceTracking?: boolean;
    } = {}
  ) {
    super();
    
    this.config = {
      flushIntervalMs: 60000, // 1 minute
      maxBufferSize: 1000,
      enablePerformanceTracking: true,
      ...config
    };

    this.setupPeriodicFlush();
  }

  /**
   * Track plugin installation
   */
  trackInstall(pluginId: string): void {
    const now = new Date();
    
    if (!this.metrics.has(pluginId)) {
      this.metrics.set(pluginId, this.createInitialMetrics(pluginId, now));
    }

    this.addToBuffer('install', { pluginId, timestamp: now });
    this.emit('pluginInstalled', { pluginId, timestamp: now });
    
    Logger.debug(`Tracked plugin installation: ${pluginId}`);
  }

  /**
   * Track plugin uninstallation
   */
  trackUninstall(pluginId: string): void {
    const now = new Date();
    
    // Remove from active tracking
    this.activationTimes.delete(pluginId);
    this.commandStartTimes.delete(pluginId);
    
    this.addToBuffer('uninstall', { pluginId, timestamp: now });
    this.emit('pluginUninstalled', { pluginId, timestamp: now });
    
    Logger.debug(`Tracked plugin uninstallation: ${pluginId}`);
  }

  /**
   * Track plugin activation
   */
  trackActivation(pluginId: string): void {
    const now = new Date();
    const metrics = this.getOrCreateMetrics(pluginId);
    
    metrics.activationCount++;
    metrics.lastUsed = now;
    this.activationTimes.set(pluginId, now);
    
    // Track performance if enabled
    if (this.config.enablePerformanceTracking) {
      this.trackActivationPerformance(pluginId, now);
    }
    
    this.addToBuffer('activation', { pluginId, timestamp: now });
    this.emit('pluginActivated', { pluginId, timestamp: now });
    
    Logger.debug(`Tracked plugin activation: ${pluginId}`);
  }

  /**
   * Track plugin deactivation
   */
  trackDeactivation(pluginId: string): void {
    const now = new Date();
    const metrics = this.getOrCreateMetrics(pluginId);
    
    metrics.deactivationCount++;
    
    // Calculate active time
    const activationTime = this.activationTimes.get(pluginId);
    if (activationTime) {
      const activeTime = now.getTime() - activationTime.getTime();
      metrics.totalActiveTime += activeTime;
      this.activationTimes.delete(pluginId);
    }
    
    this.addToBuffer('deactivation', { pluginId, timestamp: now });
    this.emit('pluginDeactivated', { pluginId, timestamp: now });
    
    Logger.debug(`Tracked plugin deactivation: ${pluginId}`);
  }

  /**
   * Track plugin reload
   */
  trackReload(pluginId: string): void {
    const now = new Date();
    
    // Treat as deactivation followed by activation
    this.trackDeactivation(pluginId);
    this.trackActivation(pluginId);
    
    this.addToBuffer('reload', { pluginId, timestamp: now });
    this.emit('pluginReloaded', { pluginId, timestamp: now });
    
    Logger.debug(`Tracked plugin reload: ${pluginId}`);
  }

  /**
   * Track plugin update
   */
  trackUpdate(pluginId: string, fromVersion: string, toVersion: string): void {
    const now = new Date();
    
    this.addToBuffer('update', { 
      pluginId, 
      fromVersion, 
      toVersion, 
      timestamp: now 
    });
    this.emit('pluginUpdated', { pluginId, fromVersion, toVersion, timestamp: now });
    
    Logger.debug(`Tracked plugin update: ${pluginId} (${fromVersion} → ${toVersion})`);
  }

  /**
   * Track command execution
   */
  trackCommandStart(pluginId: string, command: string): void {
    const now = new Date();
    const metrics = this.getOrCreateMetrics(pluginId);
    
    metrics.commandsExecuted++;
    metrics.lastUsed = now;
    
    this.commandStartTimes.set(`${pluginId}:${command}`, now);
    
    this.addToBuffer('commandStart', { pluginId, command, timestamp: now });
  }

  /**
   * Track command completion
   */
  trackCommandEnd(pluginId: string, command: string, success: boolean = true): void {
    const now = new Date();
    const startTime = this.commandStartTimes.get(`${pluginId}:${command}`);
    
    if (startTime && this.config.enablePerformanceTracking) {
      const executionTime = now.getTime() - startTime.getTime();
      this.updateCommandPerformance(pluginId, executionTime);
      this.commandStartTimes.delete(`${pluginId}:${command}`);
    }
    
    this.addToBuffer('commandEnd', { 
      pluginId, 
      command, 
      success, 
      timestamp: now 
    });
  }

  /**
   * Track plugin error
   */
  trackError(pluginId: string, error: any, context?: string): void {
    const now = new Date();
    const metrics = this.getOrCreateMetrics(pluginId);
    
    metrics.errorsEncountered++;
    
    this.addToBuffer('error', { 
      pluginId, 
      error: error.message || error.toString(), 
      context,
      timestamp: now 
    });
    this.emit('pluginError', { pluginId, error, context, timestamp: now });
    
    Logger.debug(`Tracked plugin error: ${pluginId} - ${error.message}`);
  }

  /**
   * Track event publishing
   */
  trackEventPublished(pluginId: string, eventType: string): void {
    const metrics = this.getOrCreateMetrics(pluginId);
    metrics.eventMetrics.eventsPublished++;
    
    this.addToBuffer('eventPublished', { pluginId, eventType, timestamp: new Date() });
  }

  /**
   * Track event subscription
   */
  trackEventSubscribed(pluginId: string, eventType: string): void {
    const metrics = this.getOrCreateMetrics(pluginId);
    metrics.eventMetrics.eventsSubscribed++;
    
    this.addToBuffer('eventSubscribed', { pluginId, eventType, timestamp: new Date() });
  }

  /**
   * Track event handling error
   */
  trackEventHandlingError(pluginId: string, eventType: string, error: any): void {
    const metrics = this.getOrCreateMetrics(pluginId);
    metrics.eventMetrics.eventHandlingErrors++;
    
    this.addToBuffer('eventHandlingError', { 
      pluginId, 
      eventType, 
      error: error.message || error.toString(),
      timestamp: new Date() 
    });
  }

  /**
   * Get metrics for a specific plugin
   */
  getPluginMetrics(pluginId: string): PluginUsageMetrics | undefined {
    return this.metrics.get(pluginId);
  }

  /**
   * Get metrics for all plugins
   */
  getAllMetrics(): PluginUsageMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get system analytics summary
   */
  getSystemAnalytics(): SystemAnalytics {
    const allMetrics = this.getAllMetrics();
    
    const totalUsageTime = allMetrics.reduce((sum, m) => sum + m.totalActiveTime, 0);
    const totalCommands = allMetrics.reduce((sum, m) => sum + m.commandsExecuted, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errorsEncountered, 0);
    
    const mostUsedPlugins = allMetrics
      .map(m => ({ pluginId: m.pluginId, usageTime: m.totalActiveTime }))
      .sort((a, b) => b.usageTime - a.usageTime)
      .slice(0, 10);
    
    const errorReport = allMetrics
      .filter(m => m.errorsEncountered > 0)
      .map(m => ({ 
        pluginId: m.pluginId, 
        errorCount: m.errorsEncountered, 
        lastError: m.lastUsed 
      }))
      .sort((a, b) => b.errorCount - a.errorCount);
    
    const avgMemory = allMetrics.length > 0 
      ? allMetrics.reduce((sum, m) => sum + m.performanceMetrics.memoryUsage, 0) / allMetrics.length
      : 0;
    
    const avgCpu = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.performanceMetrics.cpuUsage, 0) / allMetrics.length
      : 0;
    
    const totalMemory = allMetrics.reduce((sum, m) => sum + m.performanceMetrics.memoryUsage, 0);
    
    return {
      totalPlugins: allMetrics.length,
      activePlugins: this.activationTimes.size,
      totalUsageTime,
      totalCommands,
      totalErrors,
      mostUsedPlugins,
      errorReport,
      performanceSummary: {
        averageMemoryUsage: avgMemory,
        averageCpuUsage: avgCpu,
        totalMemoryUsed: totalMemory
      }
    };
  }

  /**
   * Export analytics data
   */
  exportData(): {
    metrics: PluginUsageMetrics[];
    buffer: Array<{ timestamp: Date; type: string; data: any }>;
    systemAnalytics: SystemAnalytics;
  } {
    return {
      metrics: this.getAllMetrics(),
      buffer: [...this.metricsBuffer],
      systemAnalytics: this.getSystemAnalytics()
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.activationTimes.clear();
    this.commandStartTimes.clear();
    this.metricsBuffer = [];
    
    this.emit('metricsCleared', { timestamp: new Date() });
    Logger.debug('Plugin analytics metrics cleared');
  }

  /**
   * Flush metrics buffer
   */
  async flush(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;
    
    const bufferToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];
    
    this.emit('metricsFlush', {
      count: bufferToFlush.length,
      timestamp: new Date()
    });
    
    Logger.debug(`Flushed ${bufferToFlush.length} analytics events`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    await this.flush();
    this.removeAllListeners();
    
    Logger.debug('Plugin analytics tracker cleaned up');
  }

  // Private methods

  private createInitialMetrics(pluginId: string, installDate: Date): PluginUsageMetrics {
    return {
      pluginId,
      installDate,
      lastUsed: installDate,
      activationCount: 0,
      deactivationCount: 0,
      totalActiveTime: 0,
      commandsExecuted: 0,
      errorsEncountered: 0,
      performanceMetrics: {
        averageActivationTime: 0,
        averageCommandExecutionTime: 0,
        memoryUsage: 0,
        cpuUsage: 0
      },
      eventMetrics: {
        eventsPublished: 0,
        eventsSubscribed: 0,
        eventHandlingErrors: 0
      }
    };
  }

  private getOrCreateMetrics(pluginId: string): PluginUsageMetrics {
    if (!this.metrics.has(pluginId)) {
      this.metrics.set(pluginId, this.createInitialMetrics(pluginId, new Date()));
    }
    return this.metrics.get(pluginId)!;
  }

  private addToBuffer(type: string, data: any): void {
    this.metricsBuffer.push({
      timestamp: new Date(),
      type,
      data
    });

    // Trim buffer if it gets too large
    if (this.metricsBuffer.length > (this.config.maxBufferSize || 1000)) {
      this.metricsBuffer = this.metricsBuffer.slice(-500); // Keep last 500 events
    }
  }

  private trackActivationPerformance(pluginId: string, startTime: Date): void {
    // In a real implementation, this would measure actual performance metrics
    const metrics = this.getOrCreateMetrics(pluginId);
    
    // Simulate performance tracking
    const mockActivationTime = Math.random() * 1000; // 0-1000ms
    const mockMemoryUsage = Math.random() * 100; // 0-100MB
    const mockCpuUsage = Math.random() * 50; // 0-50%
    
    // Update running averages
    const activationCount = metrics.activationCount || 1;
    metrics.performanceMetrics.averageActivationTime = 
      (metrics.performanceMetrics.averageActivationTime * (activationCount - 1) + mockActivationTime) / activationCount;
    
    metrics.performanceMetrics.memoryUsage = mockMemoryUsage;
    metrics.performanceMetrics.cpuUsage = mockCpuUsage;
  }

  private updateCommandPerformance(pluginId: string, executionTime: number): void {
    const metrics = this.getOrCreateMetrics(pluginId);
    const commandCount = metrics.commandsExecuted || 1;
    
    metrics.performanceMetrics.averageCommandExecutionTime = 
      (metrics.performanceMetrics.averageCommandExecutionTime * (commandCount - 1) + executionTime) / commandCount;
  }

  private setupPeriodicFlush(): void {
    if (this.config.flushIntervalMs && this.config.flushIntervalMs > 0) {
      this.flushInterval = setInterval(async () => {
        try {
          await this.flush();
        } catch (error) {
          Logger.error('Error during periodic metrics flush:', error);
        }
      }, this.config.flushIntervalMs);
    }
  }
}