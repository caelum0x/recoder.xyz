/**
 * Viral Growth Service for Recoder.ai DaaS Platform
 * Handles referral systems, sharing mechanics, and growth optimization
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';
import { projectService } from './project-service';
import { billingService } from './billing-service';

export interface ReferralProgram {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  
  // Reward structure
  referrerRewards: {
    credits: number;
    bonusTokens: number;
    subscriptionDiscount?: number; // percentage
    premiumFeatures?: string[];
    duration?: number; // days
  };
  
  refereeRewards: {
    credits: number;
    bonusTokens: number;
    subscriptionDiscount?: number;
    premiumFeatures?: string[];
    duration?: number;
  };
  
  // Conditions
  requirements: {
    minReferrals?: number;
    minRefereeActivity?: string; // 'signup' | 'first-project' | 'paid-subscription'
    timeLimit?: number; // days
  };
  
  // Tracking
  analytics: {
    totalReferrals: number;
    successfulReferrals: number;
    conversionRate: number;
    totalRewardsGiven: number;
  };
  
  createdAt: Date;
  expiresAt?: Date;
}

export interface UserReferral {
  id: string;
  referrerId: string;
  refereeId?: string;
  refereeEmail: string;
  
  // Referral details
  referralCode: string;
  programId: string;
  source: 'link' | 'email' | 'social' | 'direct';
  campaign?: string;
  
  // Status tracking
  status: 'pending' | 'signed_up' | 'active' | 'converted' | 'expired';
  clickedAt?: Date;
  signedUpAt?: Date;
  firstProjectAt?: Date;
  convertedAt?: Date;
  
  // Rewards
  referrerRewardGiven: boolean;
  refereeRewardGiven: boolean;
  rewardsValue: {
    referrer: number;
    referee: number;
  };
  
  metadata: {
    userAgent?: string;
    ip?: string;
    referrerUrl?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface SharingCampaign {
  id: string;
  userId: string;
  type: 'project' | 'profile' | 'achievement' | 'milestone';
  
  // Content details
  title: string;
  description: string;
  imageUrl?: string;
  targetUrl: string;
  
  // Sharing options
  platforms: Array<{
    platform: 'twitter' | 'linkedin' | 'facebook' | 'reddit' | 'hackernews';
    shareUrl: string;
    message: string;
    hashtags?: string[];
  }>;
  
  // Incentives
  rewards: {
    creditsPerShare: number;
    bonusForViralShares: number; // if share gets X clicks
    viralThreshold: number;
  };
  
  // Analytics
  analytics: {
    totalShares: number;
    platformBreakdown: Record<string, number>;
    totalClicks: number;
    conversionRate: number;
    viralShares: number;
    rewardsGiven: number;
  };
  
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export interface GrowthMetrics {
  referrals: {
    total: number;
    thisWeek: number;
    conversionRate: number;
    topReferrers: Array<{
      userId: string;
      username: string;
      referrals: number;
      conversions: number;
      rewards: number;
    }>;
  };
  
  sharing: {
    totalShares: number;
    totalClicks: number;
    platformBreakdown: Record<string, number>;
    viralContent: Array<{
      id: string;
      title: string;
      shares: number;
      clicks: number;
      virality: number;
    }>;
  };
  
  growth: {
    weeklyGrowthRate: number;
    k_factor: number; // viral coefficient
    churnRate: number;
    netGrowth: number;
  };
  
  campaigns: {
    active: number;
    totalReach: number;
    bestPerforming: Array<{
      id: string;
      name: string;
      performance: number;
      roi: number;
    }>;
  };
}

export class ViralGrowthService {
  private referralPrograms: Map<string, ReferralProgram> = new Map();
  private userReferrals: Map<string, UserReferral[]> = new Map(); // userId -> referrals
  private referralCodes: Map<string, string> = new Map(); // code -> userId
  private sharingCampaigns: Map<string, SharingCampaign> = new Map();
  private userShares: Map<string, string[]> = new Map(); // userId -> campaignIds

  constructor() {
    this.initializeViralGrowthService();
  }

  private initializeViralGrowthService(): void {
    logger.info('🚀 Initializing Viral Growth Service...');
    
    // Initialize default referral program
    this.initializeDefaultReferralProgram();
    
    // Initialize growth tracking
    this.initializeGrowthTracking();
    
    logger.info('✅ Viral Growth Service initialized');
  }

  /**
   * Create user referral code
   */
  async createUserReferralCode(userId: string): Promise<{ success: boolean; referralCode?: string; error?: string }> {
    try {
      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Generate unique referral code
      const referralCode = this.generateReferralCode(user.username);
      
      // Check if code already exists
      if (this.referralCodes.has(referralCode)) {
        const existingUserId = this.referralCodes.get(referralCode);
        if (existingUserId === userId) {
          return { success: true, referralCode };
        }
        // Generate alternative code
        const altCode = this.generateReferralCode(user.username + Math.floor(Math.random() * 1000));
        this.referralCodes.set(altCode, userId);
        return { success: true, referralCode: altCode };
      }

      this.referralCodes.set(referralCode, userId);
      
      logger.info(`🎯 Referral code created: ${referralCode} for ${user.username}`);
      
      return { success: true, referralCode };

    } catch (error: any) {
      logger.error('Create referral code failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process referral signup
   */
  async processReferralSignup(
    referralCode: string,
    newUserData: {
      userId: string;
      email: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; referral?: UserReferral; error?: string }> {
    try {
      const referrerId = this.referralCodes.get(referralCode);
      if (!referrerId) {
        return { success: false, error: 'Invalid referral code' };
      }

      const referrer = userService.getUserProfile(referrerId);
      if (!referrer) {
        return { success: false, error: 'Referrer not found' };
      }

      // Get default referral program
      const program = Array.from(this.referralPrograms.values())
        .find(p => p.isActive) || Array.from(this.referralPrograms.values())[0];

      if (!program) {
        return { success: false, error: 'No active referral program' };
      }

      // Create referral record
      const referralId = this.generateReferralId();
      const referral: UserReferral = {
        id: referralId,
        referrerId,
        refereeId: newUserData.userId,
        refereeEmail: newUserData.email,
        referralCode,
        programId: program.id,
        source: 'link',
        status: 'signed_up',
        signedUpAt: new Date(),
        referrerRewardGiven: false,
        refereeRewardGiven: false,
        rewardsValue: {
          referrer: 0,
          referee: 0
        },
        metadata: newUserData.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store referral
      if (!this.userReferrals.has(referrerId)) {
        this.userReferrals.set(referrerId, []);
      }
      this.userReferrals.get(referrerId)!.push(referral);

      // Give immediate signup rewards
      await this.giveSignupRewards(referral, program);

      // Update program analytics
      program.analytics.totalReferrals += 1;
      program.analytics.successfulReferrals += 1;

      logger.info(`🎉 Referral signup processed: ${newUserData.email} referred by ${referrer.username}`);

      return { success: true, referral };

    } catch (error: any) {
      logger.error('Process referral signup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create sharing campaign
   */
  async createSharingCampaign(
    userId: string,
    campaignData: {
      type: SharingCampaign['type'];
      title: string;
      description: string;
      targetUrl: string;
      imageUrl?: string;
      platforms: string[];
      expiresAt?: Date;
    }
  ): Promise<{ success: boolean; campaign?: SharingCampaign; error?: string }> {
    try {
      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const campaignId = this.generateCampaignId();
      
      // Generate platform-specific sharing URLs and messages
      const platforms = campaignData.platforms.map(platform => 
        this.generatePlatformShare(platform, campaignData, campaignId)
      );

      const campaign: SharingCampaign = {
        id: campaignId,
        userId,
        type: campaignData.type,
        title: campaignData.title,
        description: campaignData.description,
        imageUrl: campaignData.imageUrl,
        targetUrl: campaignData.targetUrl,
        platforms,
        rewards: {
          creditsPerShare: 10,
          bonusForViralShares: 50,
          viralThreshold: 100
        },
        analytics: {
          totalShares: 0,
          platformBreakdown: {},
          totalClicks: 0,
          conversionRate: 0,
          viralShares: 0,
          rewardsGiven: 0
        },
        isActive: true,
        createdAt: new Date(),
        expiresAt: campaignData.expiresAt
      };

      this.sharingCampaigns.set(campaignId, campaign);
      
      if (!this.userShares.has(userId)) {
        this.userShares.set(userId, []);
      }
      this.userShares.get(userId)!.push(campaignId);

      logger.info(`📢 Sharing campaign created: ${campaign.title} by ${user.username}`);

      return { success: true, campaign };

    } catch (error: any) {
      logger.error('Create sharing campaign failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Track sharing activity
   */
  async trackShare(
    campaignId: string,
    platform: string,
    metadata?: any
  ): Promise<{ success: boolean; reward?: number; error?: string }> {
    try {
      const campaign = this.sharingCampaigns.get(campaignId);
      if (!campaign) {
        return { success: false, error: 'Campaign not found' };
      }

      if (!campaign.isActive) {
        return { success: false, error: 'Campaign is not active' };
      }

      // Update analytics
      campaign.analytics.totalShares += 1;
      campaign.analytics.platformBreakdown[platform] = 
        (campaign.analytics.platformBreakdown[platform] || 0) + 1;

      // Give rewards
      const reward = campaign.rewards.creditsPerShare;
      campaign.analytics.rewardsGiven += reward;

      // Check for viral bonus
      if (campaign.analytics.totalClicks >= campaign.rewards.viralThreshold) {
        const viralBonus = campaign.rewards.bonusForViralShares;
        campaign.analytics.viralShares += 1;
        campaign.analytics.rewardsGiven += viralBonus;
        
        logger.info(`🔥 Viral bonus triggered for campaign: ${campaign.title}`);
        
        return { success: true, reward: reward + viralBonus };
      }

      logger.info(`📤 Share tracked: ${platform} for campaign ${campaign.title}`);

      return { success: true, reward };

    } catch (error: any) {
      logger.error('Track share failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's referral statistics
   */
  getUserReferralStats(userId: string): {
    referralCode?: string;
    totalReferrals: number;
    successfulReferrals: number;
    totalRewards: number;
    recentReferrals: UserReferral[];
  } {
    const referralCode = Array.from(this.referralCodes.entries())
      .find(([code, id]) => id === userId)?.[0];
    
    const userReferrals = this.userReferrals.get(userId) || [];
    const successfulReferrals = userReferrals.filter(r => 
      r.status === 'converted' || r.status === 'active'
    );
    
    const totalRewards = userReferrals.reduce((sum, r) => sum + r.rewardsValue.referrer, 0);

    return {
      referralCode,
      totalReferrals: userReferrals.length,
      successfulReferrals: successfulReferrals.length,
      totalRewards,
      recentReferrals: userReferrals
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10)
    };
  }

  /**
   * Get platform growth metrics
   */
  getGrowthMetrics(): GrowthMetrics {
    const allReferrals = Array.from(this.userReferrals.values()).flat();
    const allCampaigns = Array.from(this.sharingCampaigns.values());

    // Calculate referral metrics
    const weeklyReferrals = allReferrals.filter(r => 
      r.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    
    const conversions = allReferrals.filter(r => r.status === 'converted');
    const conversionRate = allReferrals.length > 0 ? 
      (conversions.length / allReferrals.length) * 100 : 0;

    // Top referrers
    const referrerStats = new Map<string, { referrals: number; conversions: number; rewards: number }>();
    allReferrals.forEach(referral => {
      const stats = referrerStats.get(referral.referrerId) || { referrals: 0, conversions: 0, rewards: 0 };
      stats.referrals += 1;
      if (referral.status === 'converted') stats.conversions += 1;
      stats.rewards += referral.rewardsValue.referrer;
      referrerStats.set(referral.referrerId, stats);
    });

    const topReferrers = Array.from(referrerStats.entries())
      .map(([userId, stats]) => {
        const user = userService.getUserProfile(userId);
        return {
          userId,
          username: user?.username || 'Unknown',
          ...stats
        };
      })
      .sort((a, b) => b.referrals - a.referrals)
      .slice(0, 10);

    // Sharing metrics
    const totalShares = allCampaigns.reduce((sum, c) => sum + c.analytics.totalShares, 0);
    const totalClicks = allCampaigns.reduce((sum, c) => sum + c.analytics.totalClicks, 0);
    
    const platformBreakdown: Record<string, number> = {};
    allCampaigns.forEach(campaign => {
      Object.entries(campaign.analytics.platformBreakdown).forEach(([platform, count]) => {
        platformBreakdown[platform] = (platformBreakdown[platform] || 0) + count;
      });
    });

    // Growth calculations
    const weeklyGrowthRate = (weeklyReferrals.length / Math.max(allReferrals.length - weeklyReferrals.length, 1)) * 100;
    const k_factor = conversionRate / 100; // Simplified K-factor calculation

    return {
      referrals: {
        total: allReferrals.length,
        thisWeek: weeklyReferrals.length,
        conversionRate,
        topReferrers
      },
      sharing: {
        totalShares,
        totalClicks,
        platformBreakdown,
        viralContent: allCampaigns
          .filter(c => c.analytics.viralShares > 0)
          .map(c => ({
            id: c.id,
            title: c.title,
            shares: c.analytics.totalShares,
            clicks: c.analytics.totalClicks,
            virality: c.analytics.viralShares
          }))
          .slice(0, 10)
      },
      growth: {
        weeklyGrowthRate,
        k_factor,
        churnRate: 5.2, // Mock data - in production, calculate from user activity
        netGrowth: weeklyGrowthRate - 5.2
      },
      campaigns: {
        active: allCampaigns.filter(c => c.isActive).length,
        totalReach: totalClicks,
        bestPerforming: allCampaigns
          .map(c => ({
            id: c.id,
            name: c.title,
            performance: c.analytics.totalShares,
            roi: c.analytics.totalClicks / Math.max(c.analytics.totalShares, 1)
          }))
          .sort((a, b) => b.performance - a.performance)
          .slice(0, 5)
      }
    };
  }

  private async giveSignupRewards(referral: UserReferral, program: ReferralProgram): Promise<void> {
    try {
      // Give referee rewards
      if (!referral.refereeRewardGiven && referral.refereeId) {
        // In production, integrate with billing service to give actual credits
        referral.refereeRewardGiven = true;
        referral.rewardsValue.referee = program.refereeRewards.credits;
        
        logger.info(`🎁 Referee rewards given: ${program.refereeRewards.credits} credits to ${referral.refereeEmail}`);
      }

      // Give referrer rewards (may be conditional based on program requirements)
      if (!referral.referrerRewardGiven) {
        referral.referrerRewardGiven = true;
        referral.rewardsValue.referrer = program.referrerRewards.credits;
        program.analytics.totalRewardsGiven += program.referrerRewards.credits;
        
        logger.info(`🎁 Referrer rewards given: ${program.referrerRewards.credits} credits to referrer`);
      }

      referral.updatedAt = new Date();

    } catch (error: any) {
      logger.error('Give signup rewards failed:', error);
    }
  }

  private generatePlatformShare(platform: string, campaignData: any, campaignId: string): any {
    const baseUrl = `https://recoder.ai/share/${campaignId}`;
    
    const templates = {
      twitter: {
        shareUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(campaignData.title)}&url=${encodeURIComponent(baseUrl)}`,
        message: `🚀 Check out my latest project: ${campaignData.title}\n\n${campaignData.description}\n\n#RecoderAI #CodeGeneration #AI`,
        hashtags: ['RecoderAI', 'CodeGeneration', 'AI']
      },
      linkedin: {
        shareUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(baseUrl)}`,
        message: `Excited to share my latest project: ${campaignData.title}. ${campaignData.description}`,
        hashtags: ['RecoderAI', 'Development']
      },
      facebook: {
        shareUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseUrl)}`,
        message: `Check out this amazing project: ${campaignData.title}`,
        hashtags: []
      },
      reddit: {
        shareUrl: `https://reddit.com/submit?url=${encodeURIComponent(baseUrl)}&title=${encodeURIComponent(campaignData.title)}`,
        message: campaignData.title,
        hashtags: []
      },
      hackernews: {
        shareUrl: `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(baseUrl)}&t=${encodeURIComponent(campaignData.title)}`,
        message: campaignData.title,
        hashtags: []
      }
    };

    return {
      platform: platform as any,
      ...(templates[platform as keyof typeof templates] || templates.twitter)
    };
  }

  private initializeDefaultReferralProgram(): void {
    const defaultProgram: ReferralProgram = {
      id: 'default_referral_2024',
      name: 'Recoder.ai Referral Program',
      description: 'Earn rewards by referring developers to Recoder.ai',
      isActive: true,
      referrerRewards: {
        credits: 100,
        bonusTokens: 5000,
        subscriptionDiscount: 20
      },
      refereeRewards: {
        credits: 50,
        bonusTokens: 2500,
        subscriptionDiscount: 10
      },
      requirements: {
        minRefereeActivity: 'signup'
      },
      analytics: {
        totalReferrals: 0,
        successfulReferrals: 0,
        conversionRate: 0,
        totalRewardsGiven: 0
      },
      createdAt: new Date()
    };

    this.referralPrograms.set(defaultProgram.id, defaultProgram);
    logger.info('🎯 Default referral program initialized');
  }

  private initializeGrowthTracking(): void {
    // Set up periodic analytics updates
    setInterval(() => {
      this.updateGrowthMetrics();
    }, 60 * 60 * 1000); // Update every hour
  }

  private updateGrowthMetrics(): void {
    // Update conversion rates and other calculated metrics
    this.referralPrograms.forEach(program => {
      const allReferrals = Array.from(this.userReferrals.values()).flat()
        .filter(r => r.programId === program.id);
      const conversions = allReferrals.filter(r => r.status === 'converted');
      
      program.analytics.conversionRate = allReferrals.length > 0 ? 
        (conversions.length / allReferrals.length) * 100 : 0;
    });
  }

  private generateReferralCode(username: string): string {
    const clean = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${clean.substring(0, 6)}${suffix}`.toUpperCase();
  }

  private generateReferralId(): string {
    return 'ref_' + Math.random().toString(36).substring(2, 11);
  }

  private generateCampaignId(): string {
    return 'camp_' + Math.random().toString(36).substring(2, 11);
  }
}

// Export singleton instance
export const viralGrowthService = new ViralGrowthService();