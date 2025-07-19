/**
 * Analytics service for tracking downloads and usage metrics
 * Provides insights into CLI adoption, update patterns, and user behavior
 */

import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import geoip from 'geoip-lite';

export interface DownloadEvent {
  id: string;
  timestamp: number;
  version: string;
  platform: string;
  arch: string;
  channel: 'stable' | 'beta' | 'alpha';
  source: 'npm' | 'github' | 'homebrew' | 'chocolatey' | 'winget' | 'docker' | 'direct';
  userAgent: string;
  ipAddress: string;
  country?: string;
  region?: string;
  city?: string;
  referer?: string;
  sessionId?: string;
}

export interface UpdateCheckEvent {
  id: string;
  timestamp: number;
  currentVersion: string;
  requestedChannel: string;
  platform: string;
  arch: string;
  userAgent: string;
  ipAddress: string;
  country?: string;
  updateAvailable: boolean;
  latestVersion?: string;
}

export interface UsageEvent {
  id: string;
  timestamp: number;
  version: string;
  command: string;
  subcommand?: string;
  platform: string;
  arch: string;
  sessionId: string;
  duration?: number;
  success: boolean;
  error?: string;
  userId?: string; // Anonymous hashed ID
}

export interface AnalyticsMetrics {
  downloads: {
    total: number;
    byVersion: Record<string, number>;
    byPlatform: Record<string, number>;
    bySource: Record<string, number>;
    byCountry: Record<string, number>;
    trend: Array<{ date: string; count: number }>;
  };
  updates: {
    totalChecks: number;
    availableCount: number;
    adoptionRate: number;
    byVersion: Record<string, number>;
    trend: Array<{ date: string; checks: number; updates: number }>;
  };
  usage: {
    activeUsers: number;
    totalSessions: number;
    popularCommands: Record<string, number>;
    averageSessionDuration: number;
    errorRate: number;
    trend: Array<{ date: string; users: number; sessions: number }>;
  };
}

export class AnalyticsService {
  private readonly dataPath: string;
  private readonly privacyMode: boolean;

  constructor(dataPath?: string, privacyMode: boolean = true) {
    this.dataPath = dataPath || path.join(process.cwd(), 'data', 'analytics');
    this.privacyMode = privacyMode;
    this.ensureDataDirectory();
  }

  /**
   * Track download event
   */
  async trackDownload(req: Request, version: string, platform: string, arch: string, source: string): Promise<void> {
    const event: DownloadEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      version,
      platform,
      arch,
      channel: this.extractChannel(version),
      source: source as any,
      userAgent: req.headers['user-agent'] || 'unknown',
      ipAddress: this.getClientIP(req),
      referer: req.headers.referer,
    };

    // Add geo information if not in privacy mode
    if (!this.privacyMode) {
      const geo = geoip.lookup(event.ipAddress);
      if (geo) {
        event.country = geo.country;
        event.region = geo.region;
        event.city = geo.city;
      }
    } else {
      // Hash IP for privacy
      event.ipAddress = this.hashIP(event.ipAddress);
    }

    await this.saveEvent('downloads', event);
  }

  /**
   * Track update check event
   */
  async trackUpdateCheck(req: Request, data: any): Promise<void> {
    const event: UpdateCheckEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      currentVersion: data.currentVersion,
      requestedChannel: data.channel,
      platform: data.platform,
      arch: data.arch,
      userAgent: req.headers['user-agent'] || 'unknown',
      ipAddress: this.privacyMode ? this.hashIP(this.getClientIP(req)) : this.getClientIP(req),
      updateAvailable: false, // Will be set when response is generated
    };

    // Add geo information if not in privacy mode
    if (!this.privacyMode) {
      const geo = geoip.lookup(this.getClientIP(req));
      if (geo) {
        event.country = geo.country;
      }
    }

    await this.saveEvent('updates', event);
  }

  /**
   * Track usage event
   */
  async trackUsage(data: UsageEvent): Promise<void> {
    // Hash user ID for privacy
    if (data.userId && this.privacyMode) {
      data.userId = this.hashUserId(data.userId);
    }

    await this.saveEvent('usage', data);
  }

  /**
   * Get analytics metrics
   */
  async getMetrics(timeRange: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<AnalyticsMetrics> {
    const now = Date.now();
    const timeRanges = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };
    
    const since = now - timeRanges[timeRange];
    
    const [downloads, updates, usage] = await Promise.all([
      this.getDownloadMetrics(since),
      this.getUpdateMetrics(since),
      this.getUsageMetrics(since),
    ]);

    return { downloads, updates, usage };
  }

  /**
   * Get download metrics
   */
  private async getDownloadMetrics(since: number): Promise<AnalyticsMetrics['downloads']> {
    const events = await this.loadEvents<DownloadEvent>('downloads', since);
    
    const byVersion: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    events.forEach(event => {
      // Count by version
      byVersion[event.version] = (byVersion[event.version] || 0) + 1;
      
      // Count by platform
      byPlatform[event.platform] = (byPlatform[event.platform] || 0) + 1;
      
      // Count by source
      bySource[event.source] = (bySource[event.source] || 0) + 1;
      
      // Count by country (if available)
      if (event.country) {
        byCountry[event.country] = (byCountry[event.country] || 0) + 1;
      }
      
      // Count by day
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    // Generate trend data
    const trend = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      total: events.length,
      byVersion,
      byPlatform,
      bySource,
      byCountry,
      trend,
    };
  }

  /**
   * Get update metrics
   */
  private async getUpdateMetrics(since: number): Promise<AnalyticsMetrics['updates']> {
    const events = await this.loadEvents<UpdateCheckEvent>('updates', since);
    
    const byVersion: Record<string, number> = {};
    const dailyStats: Record<string, { checks: number; updates: number }> = {};
    
    let availableCount = 0;

    events.forEach(event => {
      // Count by version
      byVersion[event.currentVersion] = (byVersion[event.currentVersion] || 0) + 1;
      
      // Count available updates
      if (event.updateAvailable) {
        availableCount++;
      }
      
      // Daily statistics
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { checks: 0, updates: 0 };
      }
      dailyStats[date].checks++;
      if (event.updateAvailable) {
        dailyStats[date].updates++;
      }
    });

    const adoptionRate = events.length > 0 ? (availableCount / events.length) * 100 : 0;

    const trend = Object.entries(dailyStats)
      .map(([date, stats]) => ({ date, checks: stats.checks, updates: stats.updates }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalChecks: events.length,
      availableCount,
      adoptionRate,
      byVersion,
      trend,
    };
  }

  /**
   * Get usage metrics
   */
  private async getUsageMetrics(since: number): Promise<AnalyticsMetrics['usage']> {
    const events = await this.loadEvents<UsageEvent>('usage', since);
    
    const popularCommands: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    const uniqueSessions = new Set<string>();
    const dailyStats: Record<string, { users: Set<string>; sessions: Set<string> }> = {};
    
    let totalDuration = 0;
    let durationsCount = 0;
    let errorCount = 0;

    events.forEach(event => {
      // Count commands
      const commandKey = event.subcommand ? `${event.command} ${event.subcommand}` : event.command;
      popularCommands[commandKey] = (popularCommands[commandKey] || 0) + 1;
      
      // Track users and sessions
      if (event.userId) {
        uniqueUsers.add(event.userId);
      }
      uniqueSessions.add(event.sessionId);
      
      // Calculate duration
      if (event.duration) {
        totalDuration += event.duration;
        durationsCount++;
      }
      
      // Count errors
      if (!event.success) {
        errorCount++;
      }
      
      // Daily stats
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { users: new Set(), sessions: new Set() };
      }
      if (event.userId) {
        dailyStats[date].users.add(event.userId);
      }
      dailyStats[date].sessions.add(event.sessionId);
    });

    const averageSessionDuration = durationsCount > 0 ? totalDuration / durationsCount : 0;
    const errorRate = events.length > 0 ? (errorCount / events.length) * 100 : 0;

    const trend = Object.entries(dailyStats)
      .map(([date, stats]) => ({
        date,
        users: stats.users.size,
        sessions: stats.sessions.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      activeUsers: uniqueUsers.size,
      totalSessions: uniqueSessions.size,
      popularCommands,
      averageSessionDuration,
      errorRate,
      trend,
    };
  }

  /**
   * Generate analytics report
   */
  async generateReport(timeRange: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<string> {
    const metrics = await this.getMetrics(timeRange);
    
    const report = [
      `# CodeCraft CLI Analytics Report`,
      `Generated: ${new Date().toISOString()}`,
      `Time Range: Last ${timeRange}`,
      '',
      '## Downloads',
      `Total Downloads: ${metrics.downloads.total.toLocaleString()}`,
      '',
      '### Top Versions:',
      ...Object.entries(metrics.downloads.byVersion)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([version, count]) => `- ${version}: ${count.toLocaleString()}`),
      '',
      '### By Platform:',
      ...Object.entries(metrics.downloads.byPlatform)
        .sort(([,a], [,b]) => b - a)
        .map(([platform, count]) => `- ${platform}: ${count.toLocaleString()}`),
      '',
      '### By Source:',
      ...Object.entries(metrics.downloads.bySource)
        .sort(([,a], [,b]) => b - a)
        .map(([source, count]) => `- ${source}: ${count.toLocaleString()}`),
      '',
      '## Updates',
      `Total Update Checks: ${metrics.updates.totalChecks.toLocaleString()}`,
      `Updates Available: ${metrics.updates.availableCount.toLocaleString()}`,
      `Adoption Rate: ${metrics.updates.adoptionRate.toFixed(1)}%`,
      '',
      '## Usage',
      `Active Users: ${metrics.usage.activeUsers.toLocaleString()}`,
      `Total Sessions: ${metrics.usage.totalSessions.toLocaleString()}`,
      `Average Session Duration: ${(metrics.usage.averageSessionDuration / 1000).toFixed(1)}s`,
      `Error Rate: ${metrics.usage.errorRate.toFixed(1)}%`,
      '',
      '### Popular Commands:',
      ...Object.entries(metrics.usage.popularCommands)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([command, count]) => `- ${command}: ${count.toLocaleString()}`),
    ].join('\n');

    return report;
  }

  /**
   * Save event to storage
   */
  private async saveEvent(type: string, event: any): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const fileName = `${type}-${date}.jsonl`;
    const filePath = path.join(this.dataPath, fileName);
    
    const eventLine = JSON.stringify(event) + '\n';
    await fs.appendFile(filePath, eventLine);
  }

  /**
   * Load events from storage
   */
  private async loadEvents<T>(type: string, since: number): Promise<T[]> {
    const events: T[] = [];
    const files = await fs.readdir(this.dataPath);
    
    for (const file of files) {
      if (file.startsWith(`${type}-`) && file.endsWith('.jsonl')) {
        const filePath = path.join(this.dataPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        const lines = content.trim().split('\n').filter(line => line);
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as T;
            if ((event as any).timestamp >= since) {
              events.push(event);
            }
          } catch (error) {
            // Skip invalid lines
          }
        }
      }
    }
    
    return events;
  }

  /**
   * Ensure data directory exists
   */
  private async ensureDataDirectory(): Promise<void> {
    await fs.mkdir(this.dataPath, { recursive: true });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return createHash('sha1')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Extract channel from version string
   */
  private extractChannel(version: string): 'stable' | 'beta' | 'alpha' {
    if (version.includes('alpha')) return 'alpha';
    if (version.includes('beta')) return 'beta';
    return 'stable';
  }

  /**
   * Get client IP address
   */
  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           '0.0.0.0';
  }

  /**
   * Hash IP address for privacy
   */
  private hashIP(ip: string): string {
    return createHash('sha256').update(ip + 'salt').digest('hex').substring(0, 16);
  }

  /**
   * Hash user ID for privacy
   */
  private hashUserId(userId: string): string {
    return createHash('sha256').update(userId + 'user-salt').digest('hex').substring(0, 16);
  }
}