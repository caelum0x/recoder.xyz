/**
 * Responsive Design Service
 * PRODUCTION FEATURE: Enterprise responsive design optimization
 * Advanced device-specific UI optimization that competitors lack
 */ 

import { prisma } from '../database/prisma';
import { Logger } from 'recoder-shared';

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'tv' | 'watch';
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ResponsiveBreakpoint {
  name: Breakpoint;
  minWidth: number;
  maxWidth?: number;
  columns: number;
  gutter: number;
  margin: number;
}

export interface ResponsiveConfig {
  id?: string;
  name: string;
  description?: string;
  breakpoints: Record<Breakpoint, {
    minWidth: number;
    maxWidth?: number;
    columns: number;
    gutter: number;
    margin: number;
  }>;
  gridColumns: Record<Breakpoint, number>;
  gridGutters: Record<Breakpoint, number>;
  typographyScale: Record<Breakpoint, {
    baseFontSize: number;
    lineHeight: number;
    scale: number;
  }>;
  spacingScale: Record<Breakpoint, {
    unit: number; // Base spacing unit
    scale: number[];
  }>;
  componentRules: Record<string, Record<Breakpoint, any>>;
  isDefault: boolean;
  isActive: boolean;
}

export interface DeviceAnalytics {
  deviceType: DeviceType;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  pixelRatio?: number;
  userAgent?: string;
  browserName?: string;
  browserVersion?: string;
  platform?: string;
  sessionId: string;
  userId?: string;
  pageUrl?: string;
  component?: string;
  loadTime?: number;
  renderTime?: number;
  interactionTime?: number;
  breakpointUsed?: Breakpoint;
  layoutShifts?: number;
  scrollDepth?: number;
}

export interface ResponsiveInsights {
  popularDevices: Array<{
    deviceType: DeviceType;
    count: number;
    percentage: number;
    averageScreenSize: { width: number; height: number };
  }>;
  breakpointUsage: Record<Breakpoint, {
    usage: number;
    performance: {
      averageLoadTime: number;
      averageRenderTime: number;
      layoutShifts: number;
    };
  }>;
  performanceByDevice: Record<DeviceType, {
    averageLoadTime: number;
    averageRenderTime: number;
    averageInteractionTime: number;
    layoutShifts: number;
  }>;
  recommendations: string[];
}

export class ResponsiveDesignService {
  private defaultConfigs: Map<string, ResponsiveConfig> = new Map();

  constructor() {
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs() {
    // Mobile-first responsive configuration (recommended)
    const mobileFirstConfig: ResponsiveConfig = {
      name: 'mobile-first',
      description: 'Mobile-first responsive design with progressive enhancement',
      breakpoints: {
        xs: { minWidth: 0, maxWidth: 575, columns: 4, gutter: 16, margin: 16 },
        sm: { minWidth: 576, maxWidth: 767, columns: 6, gutter: 20, margin: 24 },
        md: { minWidth: 768, maxWidth: 991, columns: 8, gutter: 24, margin: 32 },
        lg: { minWidth: 992, maxWidth: 1199, columns: 12, gutter: 32, margin: 40 },
        xl: { minWidth: 1200, maxWidth: 1399, columns: 12, gutter: 32, margin: 48 },
        '2xl': { minWidth: 1400, columns: 12, gutter: 40, margin: 64 }
      },
      gridColumns: {
        xs: 4, sm: 6, md: 8, lg: 12, xl: 12, '2xl': 12
      },
      gridGutters: {
        xs: 16, sm: 20, md: 24, lg: 32, xl: 32, '2xl': 40
      },
      typographyScale: {
        xs: { baseFontSize: 14, lineHeight: 1.4, scale: 1.125 },
        sm: { baseFontSize: 15, lineHeight: 1.45, scale: 1.125 },
        md: { baseFontSize: 16, lineHeight: 1.5, scale: 1.25 },
        lg: { baseFontSize: 16, lineHeight: 1.5, scale: 1.25 },
        xl: { baseFontSize: 17, lineHeight: 1.55, scale: 1.333 },
        '2xl': { baseFontSize: 18, lineHeight: 1.6, scale: 1.414 }
      },
      spacingScale: {
        xs: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24] },
        sm: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32] },
        md: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48] },
        lg: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] },
        xl: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96] },
        '2xl': { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128] }
      },
      componentRules: {
        'navigation': {
          xs: { layout: 'bottom-tab', height: '60px', sticky: true },
          sm: { layout: 'bottom-tab', height: '64px', sticky: true },
          md: { layout: 'top-bar', height: '72px', sticky: true },
          lg: { layout: 'top-bar', height: '80px', sticky: false },
          xl: { layout: 'top-bar', height: '80px', sticky: false },
          '2xl': { layout: 'top-bar', height: '88px', sticky: false }
        },
        'sidebar': {
          xs: { display: 'none' },
          sm: { display: 'none' },
          md: { display: 'drawer', width: '280px' },
          lg: { display: 'fixed', width: '320px' },
          xl: { display: 'fixed', width: '360px' },
          '2xl': { display: 'fixed', width: '400px' }
        },
        'content': {
          xs: { maxWidth: '100%', padding: '16px' },
          sm: { maxWidth: '100%', padding: '20px' },
          md: { maxWidth: '100%', padding: '24px' },
          lg: { maxWidth: '1200px', padding: '32px' },
          xl: { maxWidth: '1400px', padding: '40px' },
          '2xl': { maxWidth: '1600px', padding: '48px' }
        }
      },
      isDefault: true,
      isActive: true
    };

    this.defaultConfigs.set('mobile-first', mobileFirstConfig);

    // Desktop-first configuration (legacy support)
    const desktopFirstConfig: ResponsiveConfig = {
      name: 'desktop-first',
      description: 'Desktop-first responsive design with graceful degradation',
      breakpoints: {
        '2xl': { minWidth: 1400, columns: 12, gutter: 40, margin: 64 },
        xl: { minWidth: 1200, maxWidth: 1399, columns: 12, gutter: 32, margin: 48 },
        lg: { minWidth: 992, maxWidth: 1199, columns: 12, gutter: 32, margin: 40 },
        md: { minWidth: 768, maxWidth: 991, columns: 8, gutter: 24, margin: 32 },
        sm: { minWidth: 576, maxWidth: 767, columns: 6, gutter: 20, margin: 24 },
        xs: { minWidth: 0, maxWidth: 575, columns: 4, gutter: 16, margin: 16 }
      },
      gridColumns: {
        '2xl': 12, xl: 12, lg: 12, md: 8, sm: 6, xs: 4
      },
      gridGutters: {
        '2xl': 40, xl: 32, lg: 32, md: 24, sm: 20, xs: 16
      },
      typographyScale: {
        '2xl': { baseFontSize: 18, lineHeight: 1.6, scale: 1.414 },
        xl: { baseFontSize: 17, lineHeight: 1.55, scale: 1.333 },
        lg: { baseFontSize: 16, lineHeight: 1.5, scale: 1.25 },
        md: { baseFontSize: 16, lineHeight: 1.5, scale: 1.25 },
        sm: { baseFontSize: 15, lineHeight: 1.45, scale: 1.125 },
        xs: { baseFontSize: 14, lineHeight: 1.4, scale: 1.125 }
      },
      spacingScale: {
        '2xl': { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128] },
        xl: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96] },
        lg: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] },
        md: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48] },
        sm: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32] },
        xs: { unit: 4, scale: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24] }
      },
      componentRules: {
        'navigation': {
          '2xl': { layout: 'top-bar', height: '88px', sticky: false },
          xl: { layout: 'top-bar', height: '80px', sticky: false },
          lg: { layout: 'top-bar', height: '80px', sticky: false },
          md: { layout: 'top-bar', height: '72px', sticky: true },
          sm: { layout: 'bottom-tab', height: '64px', sticky: true },
          xs: { layout: 'bottom-tab', height: '60px', sticky: true }
        }
      },
      isDefault: false,
      isActive: true
    };

    this.defaultConfigs.set('desktop-first', desktopFirstConfig);

    Logger.info('Initialized default responsive configurations');
  }

  /**
   * Get responsive configuration by name
   */
  public async getResponsiveConfig(name?: string): Promise<ResponsiveConfig | null> {
    try {
      if (name && this.defaultConfigs.has(name)) {
        return this.defaultConfigs.get(name)!;
      }

      // Try to get from database
      const dbConfig = await prisma.responsiveConfig.findFirst({
        where: name ? { name } : { isDefault: true },
        orderBy: { createdAt: 'desc' }
      });

      if (dbConfig) {
        return {
          id: dbConfig.id,
          name: dbConfig.name,
          description: dbConfig.description || undefined,
          breakpoints: dbConfig.breakpoints as any,
          gridColumns: dbConfig.gridColumns as any,
          gridGutters: dbConfig.gridGutters as any,
          typographyScale: dbConfig.typographyScale as any,
          spacingScale: dbConfig.spacingScale as any,
          componentRules: dbConfig.componentRules as any,
          isDefault: dbConfig.isDefault,
          isActive: dbConfig.isActive
        };
      }

      // Return default mobile-first config
      return this.defaultConfigs.get('mobile-first')!;

    } catch (error) {
      Logger.error('Failed to get responsive config:', error);
      return this.defaultConfigs.get('mobile-first')!;
    }
  }

  /**
   * Save responsive configuration
   */
  public async saveResponsiveConfig(config: ResponsiveConfig): Promise<boolean> {
    try {
      // If setting as default, unset other defaults
      if (config.isDefault) {
        await prisma.responsiveConfig.updateMany({
          where: { isDefault: true },
          data: { isDefault: false }
        });
      }

      if (config.id) {
        // Update existing
        await prisma.responsiveConfig.update({
          where: { id: config.id },
          data: {
            name: config.name,
            description: config.description,
            breakpoints: config.breakpoints,
            gridColumns: config.gridColumns,
            gridGutters: config.gridGutters,
            typographyScale: config.typographyScale,
            spacingScale: config.spacingScale,
            componentRules: config.componentRules,
            isDefault: config.isDefault,
            isActive: config.isActive
          }
        });
      } else {
        // Create new
        await prisma.responsiveConfig.create({
          data: {
            name: config.name,
            description: config.description,
            breakpoints: config.breakpoints,
            gridColumns: config.gridColumns,
            gridGutters: config.gridGutters,
            typographyScale: config.typographyScale,
            spacingScale: config.spacingScale,
            componentRules: config.componentRules,
            isDefault: config.isDefault,
            isActive: config.isActive
          }
        });
      }

      Logger.info(`Saved responsive config: ${config.name}`);
      return true;

    } catch (error) {
      Logger.error('Failed to save responsive config:', error);
      return false;
    }
  }

  /**
   * Track device analytics
   */
  public async trackDeviceAnalytics(analytics: DeviceAnalytics): Promise<boolean> {
    try {
      await prisma.deviceAnalytics.create({
        data: {
          deviceType: analytics.deviceType,
          screenWidth: analytics.screenWidth,
          screenHeight: analytics.screenHeight,
          viewportWidth: analytics.viewportWidth,
          viewportHeight: analytics.viewportHeight,
          pixelRatio: analytics.pixelRatio,
          userAgent: analytics.userAgent,
          browserName: analytics.browserName,
          browserVersion: analytics.browserVersion,
          platform: analytics.platform,
          sessionId: analytics.sessionId,
          userId: analytics.userId,
          pageUrl: analytics.pageUrl,
          component: analytics.component,
          loadTime: analytics.loadTime,
          renderTime: analytics.renderTime,
          interactionTime: analytics.interactionTime,
          breakpointUsed: analytics.breakpointUsed,
          layoutShifts: analytics.layoutShifts,
          scrollDepth: analytics.scrollDepth
        }
      });

      return true;

    } catch (error) {
      Logger.error('Failed to track device analytics:', error);
      return false;
    }
  }

  /**
   * Get responsive design insights
   */
  public async getResponsiveInsights(dateRange?: { start: Date; end: Date }): Promise<ResponsiveInsights> {
    try {
      const whereClause = dateRange ? {
        timestamp: {
          gte: dateRange.start,
          lte: dateRange.end
        }
      } : {};

      // Get device usage statistics
      const deviceStats = await prisma.deviceAnalytics.groupBy({
        by: ['deviceType'],
        where: whereClause,
        _count: true,
        _avg: {
          screenWidth: true,
          screenHeight: true,
          loadTime: true,
          renderTime: true,
          interactionTime: true,
          layoutShifts: true
        }
      });

      const totalSessions = deviceStats.reduce((sum, stat) => sum + stat._count, 0);

      const popularDevices = deviceStats.map(stat => ({
        deviceType: stat.deviceType as DeviceType,
        count: stat._count,
        percentage: Math.round((stat._count / totalSessions) * 100),
        averageScreenSize: {
          width: Math.round(stat._avg.screenWidth || 0),
          height: Math.round(stat._avg.screenHeight || 0)
        }
      })).sort((a, b) => b.count - a.count);

      // Get breakpoint usage statistics
      const breakpointStats = await prisma.deviceAnalytics.groupBy({
        by: ['breakpointUsed'],
        where: {
          ...whereClause,
          breakpointUsed: { not: null }
        },
        _count: true,
        _avg: {
          loadTime: true,
          renderTime: true,
          layoutShifts: true
        }
      });

      const breakpointUsage: Record<string, any> = {};
      breakpointStats.forEach(stat => {
        if (stat.breakpointUsed) {
          breakpointUsage[stat.breakpointUsed] = {
            usage: stat._count,
            performance: {
              averageLoadTime: Math.round(stat._avg.loadTime || 0),
              averageRenderTime: Math.round(stat._avg.renderTime || 0),
              layoutShifts: Math.round(stat._avg.layoutShifts || 0)
            }
          };
        }
      });

      // Performance by device type
      const performanceByDevice: Record<string, any> = {};
      deviceStats.forEach(stat => {
        performanceByDevice[stat.deviceType] = {
          averageLoadTime: Math.round(stat._avg.loadTime || 0),
          averageRenderTime: Math.round(stat._avg.renderTime || 0),
          averageInteractionTime: Math.round(stat._avg.interactionTime || 0),
          layoutShifts: Math.round(stat._avg.layoutShifts || 0)
        };
      });

      // Generate recommendations
      const recommendations = this.generateResponsiveRecommendations(
        popularDevices,
        breakpointUsage,
        performanceByDevice,
        totalSessions
      );

      return {
        popularDevices,
        breakpointUsage: breakpointUsage as any,
        performanceByDevice: performanceByDevice as any,
        recommendations
      };

    } catch (error) {
      Logger.error('Failed to get responsive insights:', error);
      throw error;
    }
  }

  private generateResponsiveRecommendations(
    popularDevices: any[],
    breakpointUsage: Record<string, any>,
    performanceByDevice: Record<string, any>,
    totalSessions: number
  ): string[] {
    const recommendations: string[] = [];

    // Device-based recommendations
    const mobileUsage = popularDevices.find(d => d.deviceType === 'mobile')?.percentage || 0;
    const desktopUsage = popularDevices.find(d => d.deviceType === 'desktop')?.percentage || 0;

    if (mobileUsage > 60) {
      recommendations.push('High mobile usage detected - prioritize mobile-first design approach');
    }

    if (desktopUsage > 70) {
      recommendations.push('High desktop usage - ensure desktop experience is optimized');
    }

    // Performance-based recommendations
    const avgMobileLoadTime = performanceByDevice.mobile?.averageLoadTime || 0;
    const avgDesktopLoadTime = performanceByDevice.desktop?.averageLoadTime || 0;

    if (avgMobileLoadTime > 3000) {
      recommendations.push('Mobile load times are slow - optimize images and reduce bundle size');
    }

    if (avgDesktopLoadTime > 2000) {
      recommendations.push('Desktop load times could be improved - consider code splitting');
    }

    // Layout shift recommendations
    Object.entries(performanceByDevice).forEach(([deviceType, perf]) => {
      if (perf.layoutShifts > 0.1) {
        recommendations.push(`High layout shifts on ${deviceType} - review responsive image sizing and font loading`);
      }
    });

    // Breakpoint usage recommendations
    const unusedBreakpoints = Object.keys(this.defaultConfigs.get('mobile-first')!.breakpoints)
      .filter(bp => !breakpointUsage[bp] || breakpointUsage[bp].usage < totalSessions * 0.05);

    if (unusedBreakpoints.length > 0) {
      recommendations.push(`Consider removing unused breakpoints: ${unusedBreakpoints.join(', ')}`);
    }

    return recommendations.length > 0 ? recommendations : ['Responsive design is well optimized'];
  }

  /**
   * Detect device type from user agent
   */
  public detectDeviceType(userAgent: string): DeviceType {
    const ua = userAgent.toLowerCase();

    if (ua.includes('mobile') || ua.includes('android')) {
      return 'mobile';
    }
    
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    
    if (ua.includes('tv') || ua.includes('smart-tv')) {
      return 'tv';
    }
    
    if (ua.includes('watch')) {
      return 'watch';
    }
    
    return 'desktop';
  }

  /**
   * Determine breakpoint from viewport width
   */
  public getBreakpointFromWidth(width: number, configName?: string): Breakpoint {
    const config = this.defaultConfigs.get(configName || 'mobile-first')!;
    
    const breakpoints = Object.entries(config.breakpoints)
      .sort((a, b) => a[1].minWidth - b[1].minWidth);

    for (const [name, bp] of breakpoints.reverse()) {
      if (width >= bp.minWidth) {
        return name as Breakpoint;
      }
    }

    return 'xs';
  }

  /**
   * Generate CSS media queries for a configuration
   */
  public generateMediaQueries(configName?: string): Record<Breakpoint, string> {
    const config = this.defaultConfigs.get(configName || 'mobile-first')!;
    const mediaQueries: Record<string, string> = {};

    Object.entries(config.breakpoints).forEach(([name, bp]) => {
      if (bp.maxWidth) {
        mediaQueries[name] = `@media (min-width: ${bp.minWidth}px) and (max-width: ${bp.maxWidth}px)`;
      } else {
        mediaQueries[name] = `@media (min-width: ${bp.minWidth}px)`;
      }
    });

    return mediaQueries as any;
  }

  /**
   * Get all available responsive configurations
   */
  public async getAllConfigurations(): Promise<ResponsiveConfig[]> {
    try {
      const dbConfigs = await prisma.responsiveConfig.findMany({
        where: { isActive: true },
        orderBy: [
          { isDefault: 'desc' },
          { name: 'asc' }
        ]
      });

      const configs: ResponsiveConfig[] = [];

      // Add default configs
      for (const defaultConfig of Array.from(this.defaultConfigs.values())) {
        configs.push(defaultConfig);
      }

      // Add database configs
      dbConfigs.forEach(dbConfig => {
        // Skip if we already have this config from defaults
        if (!this.defaultConfigs.has(dbConfig.name)) {
          configs.push({
            id: dbConfig.id,
            name: dbConfig.name,
            description: dbConfig.description || undefined,
            breakpoints: dbConfig.breakpoints as any,
            gridColumns: dbConfig.gridColumns as any,
            gridGutters: dbConfig.gridGutters as any,
            typographyScale: dbConfig.typographyScale as any,
            spacingScale: dbConfig.spacingScale as any,
            componentRules: dbConfig.componentRules as any,
            isDefault: dbConfig.isDefault,
            isActive: dbConfig.isActive
          });
        }
      });

      return configs;

    } catch (error) {
      Logger.error('Failed to get all configurations:', error);
      return Array.from(this.defaultConfigs.values());
    }
  }

  public async shutdown(): Promise<void> {
    await prisma.$disconnect();
    Logger.info('Responsive design service shut down');
  }
}

// Export singleton instance
export const responsiveDesignService = new ResponsiveDesignService();