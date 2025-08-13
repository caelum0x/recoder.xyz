/**
 * Theme Preferences Service
 * PRODUCTION FEATURE: Enterprise theme management across all platforms
 * User preference synchronization that competitors don't provide
 */

import { PrismaClient } from '@prisma/client';
import { Logger } from '@recoder/shared';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Platform = 'web' | 'mobile' | 'extension' | 'desktop';

export interface ThemePreferences {
  userId: string;
  mode: ThemeMode;
  customColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  platform: Platform;
  syncAcrossPlatforms: boolean;
  lastUpdated: Date;
}

export interface ThemeSync {
  userId: string;
  preferences: Record<Platform, Partial<ThemePreferences>>;
  globalMode?: ThemeMode;
  customBranding?: {
    logoUrl?: string;
    companyName?: string;
    primaryColor?: string;
  };
}

export class ThemePreferencesService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get user theme preferences for a specific platform
   */
  public async getUserThemePreferences(userId: string, platform: Platform): Promise<ThemePreferences | null> {
    try {
      const preferences = await (this.prisma as any).userPreferences.findUnique({
        where: { userId },
        select: {
          themePreferences: true
        }
      });

      if (!preferences?.themePreferences) {
        return null;
      }

      const themeData = preferences.themePreferences as any;
      return {
        userId,
        mode: themeData.mode || 'system',
        customColors: themeData.customColors || {},
        platform,
        syncAcrossPlatforms: themeData.syncAcrossPlatforms !== false,
        lastUpdated: themeData.lastUpdated ? new Date(themeData.lastUpdated) : new Date()
      };

    } catch (error) {
      Logger.error('Failed to get user theme preferences:', error);
      return null;
    }
  }

  /**
   * Update user theme preferences
   */
  public async updateUserThemePreferences(preferences: ThemePreferences): Promise<boolean> {
    try {
      const themeData = {
        mode: preferences.mode,
        customColors: preferences.customColors || {},
        syncAcrossPlatforms: preferences.syncAcrossPlatforms,
        lastUpdated: new Date().toISOString(),
        platforms: {
          [preferences.platform]: {
            mode: preferences.mode,
            customColors: preferences.customColors,
            lastUpdated: new Date().toISOString()
          }
        }
      };

      await (this.prisma as any).userPreferences.upsert({
        where: { userId: preferences.userId },
        update: {
          themePreferences: themeData
        },
        create: {
          userId: preferences.userId,
          themePreferences: themeData
        }
      });

      Logger.info(`Updated theme preferences for user ${preferences.userId}`, {
        platform: preferences.platform,
        mode: preferences.mode,
        sync: preferences.syncAcrossPlatforms
      });

      return true;

    } catch (error) {
      Logger.error('Failed to update user theme preferences:', error);
      return false;
    }
  }

  /**
   * Sync theme preferences across all platforms for a user
   */
  public async syncThemeAcrossPlatforms(userId: string, sourcePreferences: ThemePreferences): Promise<ThemeSync> {
    try {
      if (!sourcePreferences.syncAcrossPlatforms) {
        throw new Error('User has disabled cross-platform sync');
      }

      const existingPrefs = await (this.prisma as any).userPreferences.findUnique({
        where: { userId },
        select: { themePreferences: true }
      });

      const currentThemeData = (existingPrefs?.themePreferences as any) || {};
      const platforms: Platform[] = ['web', 'mobile', 'extension', 'desktop'];

      // Update all platforms with the new preferences
      const syncData: ThemeSync = {
        userId,
        preferences: {
          web: {},
          mobile: {},
          extension: {},
          desktop: {}
        },
        globalMode: sourcePreferences.mode
      };

      platforms.forEach(platform => {
        syncData.preferences[platform] = {
          mode: sourcePreferences.mode,
          customColors: sourcePreferences.customColors,
          syncAcrossPlatforms: true,
          lastUpdated: new Date()
        };
      });

      // Update in database
      const updatedThemeData = {
        ...currentThemeData,
        mode: sourcePreferences.mode,
        customColors: sourcePreferences.customColors,
        syncAcrossPlatforms: true,
        lastUpdated: new Date().toISOString(),
        platforms: {
          ...currentThemeData.platforms,
          ...Object.fromEntries(
            platforms.map(platform => [
              platform,
              {
                mode: sourcePreferences.mode,
                customColors: sourcePreferences.customColors,
                lastUpdated: new Date().toISOString()
              }
            ])
          )
        }
      };

      await (this.prisma as any).userPreferences.upsert({
        where: { userId },
        update: {
          themePreferences: updatedThemeData
        },
        create: {
          userId,
          themePreferences: updatedThemeData
        }
      });

      Logger.info(`Synced theme preferences across platforms for user ${userId}`, {
        mode: sourcePreferences.mode,
        platforms: platforms.length
      });

      return syncData;

    } catch (error) {
      Logger.error('Failed to sync theme preferences:', error);
      throw error;
    }
  }

  /**
   * Get theme preferences for all platforms
   */
  public async getAllPlatformPreferences(userId: string): Promise<Record<Platform, ThemePreferences | null>> {
    try {
      const preferences = await (this.prisma as any).userPreferences.findUnique({
        where: { userId },
        select: { themePreferences: true }
      });

      const themeData = (preferences?.themePreferences as any) || {};
      const platforms: Platform[] = ['web', 'mobile', 'extension', 'desktop'];

      const result: Record<Platform, ThemePreferences | null> = {} as any;

      platforms.forEach(platform => {
        const platformData = themeData.platforms?.[platform];
        if (platformData) {
          result[platform] = {
            userId,
            mode: platformData.mode || themeData.mode || 'system',
            customColors: platformData.customColors || themeData.customColors || {},
            platform,
            syncAcrossPlatforms: themeData.syncAcrossPlatforms !== false,
            lastUpdated: platformData.lastUpdated ? new Date(platformData.lastUpdated) : new Date()
          };
        } else {
          result[platform] = null;
        }
      });

      return result;

    } catch (error) {
      Logger.error('Failed to get all platform preferences:', error);
      return {} as any;
    }
  }

  /**
   * Set enterprise custom branding theme
   */
  public async setEnterpriseTheme(
    userId: string,
    customBranding: {
      logoUrl?: string;
      companyName?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
    }
  ): Promise<boolean> {
    try {
      const existingPrefs = await (this.prisma as any).userPreferences.findUnique({
        where: { userId },
        select: { themePreferences: true }
      });

      const currentThemeData = (existingPrefs?.themePreferences as any) || {};

      const updatedThemeData = {
        ...currentThemeData,
        enterpriseBranding: {
          ...currentThemeData.enterpriseBranding,
          ...customBranding,
          lastUpdated: new Date().toISOString()
        },
        lastUpdated: new Date().toISOString()
      };

      await (this.prisma as any).userPreferences.upsert({
        where: { userId },
        update: {
          themePreferences: updatedThemeData
        },
        create: {
          userId,
          themePreferences: updatedThemeData
        }
      });

      Logger.info(`Set enterprise theme for user ${userId}`, {
        companyName: customBranding.companyName,
        primaryColor: customBranding.primaryColor
      });

      return true;

    } catch (error) {
      Logger.error('Failed to set enterprise theme:', error);
      return false;
    }
  }

  /**
   * Get enterprise branding theme
   */
  public async getEnterpriseTheme(userId: string): Promise<any | null> {
    try {
      const preferences = await (this.prisma as any).userPreferences.findUnique({
        where: { userId },
        select: { themePreferences: true }
      });

      const themeData = (preferences?.themePreferences as any) || {};
      return themeData.enterpriseBranding || null;

    } catch (error) {
      Logger.error('Failed to get enterprise theme:', error);
      return null;
    }
  }

  /**
   * Reset theme preferences to default
   */
  public async resetThemePreferences(userId: string, platform?: Platform): Promise<boolean> {
    try {
      if (platform) {
        // Reset specific platform
        const existingPrefs = await (this.prisma as any).userPreferences.findUnique({
          where: { userId },
          select: { themePreferences: true }
        });

        const currentThemeData = (existingPrefs?.themePreferences as any) || {};
        
        if (currentThemeData.platforms) {
          delete currentThemeData.platforms[platform];
        }

        await (this.prisma as any).userPreferences.update({
          where: { userId },
          data: {
            themePreferences: {
              ...currentThemeData,
              lastUpdated: new Date().toISOString()
            }
          }
        });

      } else {
        // Reset all theme preferences
        await (this.prisma as any).userPreferences.update({
          where: { userId },
          data: {
            themePreferences: {
              mode: 'system',
              syncAcrossPlatforms: true,
              lastUpdated: new Date().toISOString(),
              platforms: {}
            }
          }
        });
      }

      Logger.info(`Reset theme preferences for user ${userId}`, { platform });
      return true;

    } catch (error) {
      Logger.error('Failed to reset theme preferences:', error);
      return false;
    }
  }

  /**
   * Get theme analytics for enterprise dashboard
   */
  public async getThemeAnalytics(organizationId?: string): Promise<{
    totalUsers: number;
    themeDistribution: Record<ThemeMode, number>;
    platformUsage: Record<Platform, number>;
    customBrandingUsers: number;
  }> {
    try {
      const whereClause = organizationId 
        ? { user: { organizationId } }
        : {};

      const preferences = await (this.prisma as any).userPreferences.findMany({
        where: whereClause,
        select: {
          themePreferences: true,
          userId: true
        }
      });

      const analytics = {
        totalUsers: preferences.length,
        themeDistribution: { light: 0, dark: 0, system: 0 } as Record<ThemeMode, number>,
        platformUsage: { web: 0, mobile: 0, extension: 0, desktop: 0 } as Record<Platform, number>,
        customBrandingUsers: 0
      };

      preferences.forEach(pref => {
        const themeData = pref.themePreferences as any;
        if (themeData) {
          // Count theme mode distribution
          const mode = themeData.mode || 'system';
          analytics.themeDistribution[mode as ThemeMode]++;

          // Count platform usage
          if (themeData.platforms) {
            Object.keys(themeData.platforms).forEach(platform => {
              analytics.platformUsage[platform as Platform]++;
            });
          }

          // Count custom branding usage
          if (themeData.enterpriseBranding) {
            analytics.customBrandingUsers++;
          }
        }
      });

      return analytics;

    } catch (error) {
      Logger.error('Failed to get theme analytics:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    await this.prisma.$disconnect();
    Logger.info('Theme preferences service shut down');
  }
}

// Export singleton instance
export const themePreferencesService = new ThemePreferencesService();