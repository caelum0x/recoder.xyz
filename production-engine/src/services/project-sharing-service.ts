/**
 * Project Sharing and Social Features Service for Recoder.ai DaaS Platform
 * Handles project sharing, social interactions, and community features
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';
import { projectService, DeveloperProject } from './project-service';

export interface ShareConfiguration {
  id: string;
  projectId: string;
  ownerId: string;
  shareType: 'public' | 'link' | 'team' | 'users';
  
  // Share settings
  permissions: {
    canView: boolean;
    canFork: boolean;
    canComment: boolean;
    canSuggestEdits: boolean;
    canDownload: boolean;
  };
  
  // Access control
  allowedUsers?: string[]; // userIds
  allowedTeams?: string[]; // teamIds
  publicUrl?: string;
  shareUrl: string;
  accessCode?: string;
  
  // Restrictions
  expiresAt?: Date;
  maxViews?: number;
  currentViews: number;
  requireAuth: boolean;
  allowAnonymous: boolean;
  
  // Analytics
  analytics: {
    totalViews: number;
    uniqueViewers: number;
    forks: number;
    comments: number;
    downloads: number;
    shares: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectComment {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  avatar?: string;
  
  // Comment content
  content: string;
  type: 'general' | 'code' | 'suggestion' | 'bug' | 'question';
  
  // Location context
  file?: string;
  line?: number;
  codeSnippet?: string;
  
  // Thread
  parentId?: string; // For replies
  threadId: string;
  
  // Status
  status: 'active' | 'resolved' | 'hidden' | 'flagged';
  resolvedBy?: string;
  resolvedAt?: Date;
  
  // Social features
  reactions: Array<{
    userId: string;
    emoji: string;
    timestamp: Date;
  }>;
  
  mentions: string[]; // userIds mentioned
  
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialActivity {
  id: string;
  userId: string;
  type: 'project_created' | 'project_liked' | 'project_forked' | 'project_commented' | 'user_followed' | 'team_joined';
  
  // Activity data
  data: {
    projectId?: string;
    projectName?: string;
    targetUserId?: string;
    targetUsername?: string;
    teamId?: string;
    teamName?: string;
    comment?: string;
  };
  
  // Visibility
  visibility: 'public' | 'followers' | 'private';
  
  timestamp: Date;
}

export interface UserFollow {
  followerId: string;
  followingId: string;
  createdAt: Date;
}

export interface TrendingProject {
  projectId: string;
  project: DeveloperProject;
  ownerUsername: string;
  score: number;
  metrics: {
    views: number;
    likes: number;
    forks: number;
    comments: number;
    shares: number;
    growthRate: number;
  };
  trending: {
    rank: number;
    category: string;
    timeframe: 'day' | 'week' | 'month';
    reason: string;
  };
}

export class ProjectSharingService {
  private shareConfigurations: Map<string, ShareConfiguration> = new Map();
  private projectComments: Map<string, ProjectComment[]> = new Map(); // projectId -> comments
  private socialActivities: Map<string, SocialActivity[]> = new Map(); // userId -> activities
  private userFollows: Map<string, Set<string>> = new Map(); // userId -> following userIds
  private followers: Map<string, Set<string>> = new Map(); // userId -> follower userIds
  private shareUrls: Map<string, string> = new Map(); // shareUrl -> shareConfigId

  constructor() {
    this.initializeProjectSharingService();
  }

  private initializeProjectSharingService(): void {
    logger.info('📤 Initializing Project Sharing Service...');
    
    // Initialize demo data
    this.initializeDemoData();
    
    logger.info('✅ Project Sharing Service initialized');
  }

  /**
   * Create project share configuration
   */
  async createShareConfiguration(
    projectId: string,
    ownerId: string,
    config: {
      shareType: ShareConfiguration['shareType'];
      permissions: ShareConfiguration['permissions'];
      allowedUsers?: string[];
      allowedTeams?: string[];
      expiresAt?: Date;
      maxViews?: number;
      requireAuth?: boolean;
      allowAnonymous?: boolean;
    }
  ): Promise<{ success: boolean; shareConfig?: ShareConfiguration; error?: string }> {
    try {
      // Validate project ownership
      const userProjects = projectService.getUserProjects(ownerId);
      const project = userProjects.projects.find(p => p.id === projectId);
      
      if (!project) {
        return { success: false, error: 'Project not found or access denied' };
      }

      const shareId = this.generateShareId();
      const shareUrl = this.generateShareUrl(shareId);

      const shareConfig: ShareConfiguration = {
        id: shareId,
        projectId,
        ownerId,
        shareType: config.shareType,
        permissions: config.permissions,
        allowedUsers: config.allowedUsers,
        allowedTeams: config.allowedTeams,
        shareUrl,
        accessCode: config.shareType === 'link' ? this.generateAccessCode() : undefined,
        expiresAt: config.expiresAt,
        maxViews: config.maxViews,
        currentViews: 0,
        requireAuth: config.requireAuth || false,
        allowAnonymous: config.allowAnonymous || config.shareType === 'public',
        analytics: {
          totalViews: 0,
          uniqueViewers: 0,
          forks: 0,
          comments: 0,
          downloads: 0,
          shares: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store configuration
      this.shareConfigurations.set(shareId, shareConfig);
      this.shareUrls.set(shareUrl, shareId);

      // Create social activity
      this.createSocialActivity(ownerId, 'project_created', {
        projectId,
        projectName: project.name
      });

      logger.info(`📤 Share configuration created: ${project.name} by ${ownerId}`);

      return { success: true, shareConfig };

    } catch (error: any) {
      logger.error('Create share configuration failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Access shared project
   */
  async accessSharedProject(
    shareUrl: string,
    userId?: string,
    accessCode?: string
  ): Promise<{ success: boolean; project?: DeveloperProject; shareConfig?: ShareConfiguration; error?: string }> {
    try {
      const shareConfigId = this.shareUrls.get(shareUrl);
      if (!shareConfigId) {
        return { success: false, error: 'Share not found' };
      }

      const shareConfig = this.shareConfigurations.get(shareConfigId);
      if (!shareConfig) {
        return { success: false, error: 'Share configuration not found' };
      }

      // Check expiration
      if (shareConfig.expiresAt && new Date() > shareConfig.expiresAt) {
        return { success: false, error: 'Share link has expired' };
      }

      // Check view limits
      if (shareConfig.maxViews && shareConfig.currentViews >= shareConfig.maxViews) {
        return { success: false, error: 'Share link has reached maximum views' };
      }

      // Check access code for link shares
      if (shareConfig.shareType === 'link' && shareConfig.accessCode) {
        if (!accessCode || accessCode !== shareConfig.accessCode) {
          return { success: false, error: 'Invalid access code' };
        }
      }

      // Check authentication requirements
      if (shareConfig.requireAuth && !userId) {
        return { success: false, error: 'Authentication required' };
      }

      // Check user permissions for restricted shares
      if (shareConfig.shareType === 'users' && shareConfig.allowedUsers) {
        if (!userId || !shareConfig.allowedUsers.includes(userId)) {
          return { success: false, error: 'Access denied' };
        }
      }

      // Get project
      const userProjects = projectService.getUserProjects(shareConfig.ownerId);
      const project = userProjects.projects.find(p => p.id === shareConfig.projectId);
      
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Update analytics
      shareConfig.currentViews += 1;
      shareConfig.analytics.totalViews += 1;
      if (userId) {
        shareConfig.analytics.uniqueViewers += 1;
      }
      shareConfig.updatedAt = new Date();

      // Increment project views
      project.views += 1;

      logger.info(`👀 Shared project accessed: ${project.name} by ${userId || 'anonymous'}`);

      return { success: true, project, shareConfig };

    } catch (error: any) {
      logger.error('Access shared project failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add comment to project
   */
  async addProjectComment(
    projectId: string,
    userId: string,
    commentData: {
      content: string;
      type: ProjectComment['type'];
      file?: string;
      line?: number;
      parentId?: string;
    }
  ): Promise<{ success: boolean; comment?: ProjectComment; error?: string }> {
    try {
      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Generate comment
      const commentId = this.generateCommentId();
      const threadId = commentData.parentId ? 
        this.getThreadId(projectId, commentData.parentId) : commentId;

      const comment: ProjectComment = {
        id: commentId,
        projectId,
        userId,
        username: user.username,
        avatar: user.avatar,
        content: commentData.content,
        type: commentData.type,
        file: commentData.file,
        line: commentData.line,
        parentId: commentData.parentId,
        threadId,
        status: 'active',
        reactions: [],
        mentions: this.extractMentions(commentData.content),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store comment
      if (!this.projectComments.has(projectId)) {
        this.projectComments.set(projectId, []);
      }
      this.projectComments.get(projectId)!.push(comment);

      // Update share analytics if exists
      const shareConfig = Array.from(this.shareConfigurations.values())
        .find(config => config.projectId === projectId);
      if (shareConfig) {
        shareConfig.analytics.comments += 1;
        shareConfig.updatedAt = new Date();
      }

      // Create social activity
      this.createSocialActivity(userId, 'project_commented', {
        projectId,
        comment: commentData.content.substring(0, 100)
      });

      logger.info(`💬 Comment added: ${projectId} by ${user.username}`);

      return { success: true, comment };

    } catch (error: any) {
      logger.error('Add comment failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get project comments
   */
  getProjectComments(projectId: string): ProjectComment[] {
    return this.projectComments.get(projectId) || [];
  }

  /**
   * Follow/unfollow user
   */
  async toggleUserFollow(
    followerId: string,
    targetUserId: string
  ): Promise<{ success: boolean; following: boolean; error?: string }> {
    try {
      if (followerId === targetUserId) {
        return { success: false, following: false, error: 'Cannot follow yourself' };
      }

      const follower = userService.getUserProfile(followerId);
      const target = userService.getUserProfile(targetUserId);
      
      if (!follower || !target) {
        return { success: false, following: false, error: 'User not found' };
      }

      // Initialize follow sets if needed
      if (!this.userFollows.has(followerId)) {
        this.userFollows.set(followerId, new Set());
      }
      if (!this.followers.has(targetUserId)) {
        this.followers.set(targetUserId, new Set());
      }

      const followingSet = this.userFollows.get(followerId)!;
      const followersSet = this.followers.get(targetUserId)!;

      let following = false;

      if (followingSet.has(targetUserId)) {
        // Unfollow
        followingSet.delete(targetUserId);
        followersSet.delete(followerId);
        following = false;
        
        logger.info(`👥 Unfollowed: ${follower.username} -> ${target.username}`);
      } else {
        // Follow
        followingSet.add(targetUserId);
        followersSet.add(followerId);
        following = true;
        
        // Create social activity
        this.createSocialActivity(followerId, 'user_followed', {
          targetUserId,
          targetUsername: target.username
        });
        
        logger.info(`👥 Followed: ${follower.username} -> ${target.username}`);
      }

      return { success: true, following };

    } catch (error: any) {
      logger.error('Toggle follow failed:', error);
      return { success: false, following: false, error: error.message };
    }
  }

  /**
   * Get trending projects
   */
  getTrendingProjects(
    timeframe: 'day' | 'week' | 'month' = 'week',
    category?: string,
    limit: number = 20
  ): TrendingProject[] {
    // Get all public projects
    const publicGallery = projectService.getPublicGallery({
      type: category,
      sortBy: 'popular',
      limit: limit * 2 // Get more to calculate trends
    });

    // Calculate trending scores
    const trendingProjects: TrendingProject[] = publicGallery.projects.map((project, index) => {
      const shareConfig = Array.from(this.shareConfigurations.values())
        .find(config => config.projectId === project.id);

      const metrics = {
        views: project.views,
        likes: project.likes.length,
        forks: project.forks.length,
        comments: this.getProjectComments(project.id).length,
        shares: shareConfig?.analytics.shares || 0,
        growthRate: this.calculateGrowthRate(project, timeframe)
      };

      // Calculate trending score
      const score = this.calculateTrendingScore(metrics, timeframe);

      return {
        projectId: project.id,
        project,
        ownerUsername: project.ownerUsername,
        score,
        metrics,
        trending: {
          rank: index + 1,
          category: category || 'all',
          timeframe,
          reason: this.getTrendingReason(metrics, index)
        }
      };
    });

    // Sort by trending score and limit results
    return trendingProjects
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        trending: { ...item.trending, rank: index + 1 }
      }));
  }

  /**
   * Get user's social feed
   */
  getUserSocialFeed(userId: string, limit: number = 50): SocialActivity[] {
    const followingSet = this.userFollows.get(userId) || new Set();
    const allActivities: SocialActivity[] = [];

    // Get activities from followed users
    followingSet.forEach(followedUserId => {
      const userActivities = this.socialActivities.get(followedUserId) || [];
      allActivities.push(...userActivities.filter(activity => 
        activity.visibility === 'public' || activity.visibility === 'followers'
      ));
    });

    // Add user's own activities
    const ownActivities = this.socialActivities.get(userId) || [];
    allActivities.push(...ownActivities);

    // Sort by timestamp and limit
    return allActivities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get project sharing analytics
   */
  getProjectSharingAnalytics(projectId: string, ownerId: string): {
    shares: ShareConfiguration[];
    totalViews: number;
    totalShares: number;
    comments: number;
    engagement: {
      daily: Array<{ date: string; views: number; comments: number }>;
      sources: Array<{ source: string; count: number }>;
      countries: Array<{ country: string; count: number }>;
    };
  } | null {
    // Verify ownership
    const userProjects = projectService.getUserProjects(ownerId);
    const project = userProjects.projects.find(p => p.id === projectId);
    
    if (!project) return null;

    const shareConfigs = Array.from(this.shareConfigurations.values())
      .filter(config => config.projectId === projectId);

    const totalViews = shareConfigs.reduce((sum, config) => sum + config.analytics.totalViews, 0);
    const totalShares = shareConfigs.reduce((sum, config) => sum + config.analytics.shares, 0);
    const comments = this.getProjectComments(projectId).length;

    // Generate engagement data (mock data for demo)
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      daily.push({
        date: date.toISOString().split('T')[0],
        views: Math.floor(Math.random() * 50),
        comments: Math.floor(Math.random() * 10)
      });
    }

    return {
      shares: shareConfigs,
      totalViews,
      totalShares,
      comments,
      engagement: {
        daily,
        sources: [
          { source: 'direct', count: Math.floor(totalViews * 0.4) },
          { source: 'social', count: Math.floor(totalViews * 0.3) },
          { source: 'search', count: Math.floor(totalViews * 0.2) },
          { source: 'other', count: Math.floor(totalViews * 0.1) }
        ],
        countries: [
          { country: 'US', count: Math.floor(totalViews * 0.35) },
          { country: 'UK', count: Math.floor(totalViews * 0.15) },
          { country: 'Germany', count: Math.floor(totalViews * 0.12) },
          { country: 'Canada', count: Math.floor(totalViews * 0.10) },
          { country: 'Other', count: Math.floor(totalViews * 0.28) }
        ]
      }
    };
  }

  private createSocialActivity(
    userId: string,
    type: SocialActivity['type'],
    data: SocialActivity['data']
  ): void {
    const activity: SocialActivity = {
      id: this.generateActivityId(),
      userId,
      type,
      data,
      visibility: 'public',
      timestamp: new Date()
    };

    if (!this.socialActivities.has(userId)) {
      this.socialActivities.set(userId, []);
    }
    
    this.socialActivities.get(userId)!.push(activity);
    
    // Keep only last 100 activities per user
    const userActivities = this.socialActivities.get(userId)!;
    if (userActivities.length > 100) {
      this.socialActivities.set(userId, userActivities.slice(-100));
    }
  }

  private calculateGrowthRate(project: DeveloperProject, timeframe: string): number {
    // Simplified growth calculation - in production, track historical data
    const baseGrowth = Math.random() * 100;
    return timeframe === 'day' ? baseGrowth * 0.1 : 
           timeframe === 'week' ? baseGrowth * 0.5 : baseGrowth;
  }

  private calculateTrendingScore(metrics: any, timeframe: string): number {
    const weights = {
      views: 1,
      likes: 3,
      forks: 5,
      comments: 2,
      shares: 4,
      growthRate: 2
    };

    let score = 0;
    Object.entries(weights).forEach(([key, weight]) => {
      score += (metrics[key] || 0) * weight;
    });

    // Apply timeframe multiplier
    const timeMultiplier = timeframe === 'day' ? 2 : timeframe === 'week' ? 1.5 : 1;
    return Math.round(score * timeMultiplier);
  }

  private getTrendingReason(metrics: any, rank: number): string {
    if (rank === 0) return '🔥 Most trending';
    if (metrics.growthRate > 50) return '📈 Fastest growing';
    if (metrics.likes > 20) return '❤️ Most loved';
    if (metrics.forks > 10) return '🍴 Most forked';
    if (metrics.comments > 15) return '💬 Most discussed';
    return '⭐ Rising star';
  }

  private getThreadId(projectId: string, parentId: string): string {
    const comments = this.projectComments.get(projectId) || [];
    const parentComment = comments.find(c => c.id === parentId);
    return parentComment?.threadId || parentId;
  }

  private extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    
    return mentions;
  }

  private initializeDemoData(): void {
    // Initialize some demo social activities
    logger.info('📊 Loading demo social data...');
  }

  private generateShareId(): string {
    return 'share_' + Math.random().toString(36).substring(2, 11);
  }

  private generateShareUrl(shareId: string): string {
    return `/share/${shareId}`;
  }

  private generateAccessCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private generateCommentId(): string {
    return 'comment_' + Math.random().toString(36).substring(2, 11);
  }

  private generateActivityId(): string {
    return 'activity_' + Math.random().toString(36).substring(2, 11);
  }
}

// Export singleton instance
export const projectSharingService = new ProjectSharingService();