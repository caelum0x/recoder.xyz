/**
 * Plugin Event Bus - Centralized event management for plugins
 */

import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';

export interface PluginEventData {
  pluginId: string;
  timestamp: Date;
  data?: any;
}

export interface EventSubscription {
  eventType: string;
  pluginId: string;
  handler: (data: any) => Promise<void> | void;
}

export class PluginEventBus extends EventEmitter {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private eventHistory: Array<{ event: string; data: PluginEventData; timestamp: Date }> = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.setMaxListeners(100); // Allow many plugin subscriptions
  }

  /**
   * Subscribe to an event type
   */
  subscribe(eventType: string, pluginId: string, handler: (data: any) => Promise<void> | void): void {
    const subscription: EventSubscription = {
      eventType,
      pluginId,
      handler
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }

    this.subscriptions.get(eventType)!.push(subscription);

    // Set up EventEmitter listener
    this.on(eventType, async (data: PluginEventData) => {
      try {
        await handler(data);
      } catch (error) {
        Logger.error(`Error in plugin ${pluginId} event handler for ${eventType}:`, error);
        this.emit('pluginEventError', {
          pluginId,
          eventType,
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    Logger.debug(`Plugin ${pluginId} subscribed to event ${eventType}`);
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(eventType: string, pluginId: string): void {
    const subscriptions = this.subscriptions.get(eventType);
    if (!subscriptions) return;

    const filtered = subscriptions.filter(sub => sub.pluginId !== pluginId);
    
    if (filtered.length === 0) {
      this.subscriptions.delete(eventType);
      this.removeAllListeners(eventType);
    } else {
      this.subscriptions.set(eventType, filtered);
    }

    Logger.debug(`Plugin ${pluginId} unsubscribed from event ${eventType}`);
  }

  /**
   * Unsubscribe a plugin from all events
   */
  unsubscribeAll(pluginId: string): void {
    for (const [eventType, subscriptions] of this.subscriptions) {
      const filtered = subscriptions.filter(sub => sub.pluginId !== pluginId);
      
      if (filtered.length === 0) {
        this.subscriptions.delete(eventType);
        this.removeAllListeners(eventType);
      } else {
        this.subscriptions.set(eventType, filtered);
      }
    }

    Logger.debug(`Plugin ${pluginId} unsubscribed from all events`);
  }

  /**
   * Publish an event
   */
  publish(eventType: string, pluginId: string, data?: any): void {
    const eventData: PluginEventData = {
      pluginId,
      timestamp: new Date(),
      data
    };

    // Add to history
    this.addToHistory(eventType, eventData);

    // Emit event
    this.emit(eventType, eventData);

    Logger.debug(`Event ${eventType} published by plugin ${pluginId}`);
  }

  /**
   * Get event subscriptions for a plugin
   */
  getSubscriptions(pluginId: string): Array<{ eventType: string; count: number }> {
    const result: Array<{ eventType: string; count: number }> = [];

    for (const [eventType, subscriptions] of this.subscriptions) {
      const pluginSubs = subscriptions.filter(sub => sub.pluginId === pluginId);
      if (pluginSubs.length > 0) {
        result.push({ eventType, count: pluginSubs.length });
      }
    }

    return result;
  }

  /**
   * Get all active event types
   */
  getActiveEventTypes(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get event statistics
   */
  getEventStatistics(): {
    totalEventTypes: number;
    totalSubscriptions: number;
    eventHistory: number;
    subscriptionsByPlugin: Record<string, number>;
  } {
    let totalSubscriptions = 0;
    const subscriptionsByPlugin: Record<string, number> = {};

    for (const subscriptions of this.subscriptions.values()) {
      totalSubscriptions += subscriptions.length;
      
      for (const sub of subscriptions) {
        subscriptionsByPlugin[sub.pluginId] = (subscriptionsByPlugin[sub.pluginId] || 0) + 1;
      }
    }

    return {
      totalEventTypes: this.subscriptions.size,
      totalSubscriptions,
      eventHistory: this.eventHistory.length,
      subscriptionsByPlugin
    };
  }

  /**
   * Get recent event history
   */
  getEventHistory(limit = 50): Array<{ event: string; data: PluginEventData; timestamp: Date }> {
    return this.eventHistory
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    Logger.debug('Event history cleared');
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.subscriptions.clear();
    this.eventHistory = [];
    this.removeAllListeners();
    Logger.debug('Plugin event bus cleaned up');
  }

  // Private methods

  private addToHistory(eventType: string, data: PluginEventData): void {
    this.eventHistory.push({
      event: eventType,
      data,
      timestamp: new Date()
    });

    // Trim history if it gets too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }
}

// Common event types that plugins can use
export const CommonPluginEvents = {
  // System events
  SYSTEM_STARTUP: 'system:startup',
  SYSTEM_SHUTDOWN: 'system:shutdown',
  
  // Project events  
  PROJECT_OPENED: 'project:opened',
  PROJECT_CLOSED: 'project:closed',
  PROJECT_CHANGED: 'project:changed',
  
  // File events
  FILE_CREATED: 'file:created',
  FILE_MODIFIED: 'file:modified',
  FILE_DELETED: 'file:deleted',
  FILE_RENAMED: 'file:renamed',
  
  // Code generation events
  CODE_GENERATED: 'code:generated',
  CODE_ANALYZED: 'code:analyzed',
  CODE_FORMATTED: 'code:formatted',
  
  // Build events
  BUILD_STARTED: 'build:started',
  BUILD_COMPLETED: 'build:completed',
  BUILD_FAILED: 'build:failed',
  
  // Test events
  TEST_STARTED: 'test:started',
  TEST_COMPLETED: 'test:completed',
  TEST_FAILED: 'test:failed',
  
  // Deployment events
  DEPLOY_STARTED: 'deploy:started',
  DEPLOY_COMPLETED: 'deploy:completed',
  DEPLOY_FAILED: 'deploy:failed',
  
  // AI events
  AI_REQUEST_STARTED: 'ai:request:started',
  AI_REQUEST_COMPLETED: 'ai:request:completed',
  AI_REQUEST_FAILED: 'ai:request:failed',
  
  // Security events
  SECURITY_SCAN_COMPLETED: 'security:scan:completed',
  VULNERABILITY_FOUND: 'security:vulnerability:found',
  
  // Plugin events
  PLUGIN_INSTALLED: 'plugin:installed',
  PLUGIN_UNINSTALLED: 'plugin:uninstalled',
  PLUGIN_ACTIVATED: 'plugin:activated',
  PLUGIN_DEACTIVATED: 'plugin:deactivated',
  PLUGIN_ERROR: 'plugin:error'
} as const;