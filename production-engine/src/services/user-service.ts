/**
 * User Management Service for Recoder.ai DaaS Platform
 * Handles user registration, authentication, profiles, and developer features
 */

import { logger } from '../utils/logger';
import { billingService } from './billing-service';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  githubHandle?: string;
  twitterHandle?: string;
  linkedinHandle?: string;
  skills: string[];
  interests: string[];
  experience: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  preferredLanguages: string[];
  timezone: string;
  createdAt: Date;
  lastActiveAt: Date;
  emailVerified: boolean;
  isPublic: boolean;
  settings: {
    notifications: {
      email: boolean;
      push: boolean;
      marketing: boolean;
      updates: boolean;
    };
    privacy: {
      showEmail: boolean;
      showProjects: boolean;
      showActivity: boolean;
    };
    preferences: {
      theme: 'light' | 'dark' | 'auto';
      defaultFramework: string;
      aiModel: string;
      codeStyle: string;
    };
  };
  stats: {
    projectsGenerated: number;
    tokensUsed: number;
    favoriteTemplates: string[];
    achievements: string[];
  };
}

export interface DeveloperTeam {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: Array<{
    userId: string;
    role: 'owner' | 'admin' | 'developer' | 'viewer';
    joinedAt: Date;
    permissions: string[];
  }>;
  settings: {
    visibility: 'public' | 'private';
    allowInvites: boolean;
    defaultPermissions: string[];
  };
  subscription: {
    planId: string;
    status: 'active' | 'trial' | 'expired';
    limits: {
      maxMembers: number;
      maxProjects: number;
      monthlyGenerations: number;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  userId: string;
  sessionId: string;
  token: string;
  deviceInfo: {
    userAgent: string;
    ip: string;
    location?: string;
  };
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
}

export class UserService {
  private users: Map<string, UserProfile> = new Map();
  private teams: Map<string, DeveloperTeam> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private emailToUserId: Map<string, string> = new Map();
  private usernameToUserId: Map<string, string> = new Map();

  constructor() {
    this.initializeUserService();
  }

  private initializeUserService(): void {
    logger.info('👥 Initializing Developer User Service...');
    
    // Load existing user data (in production, from database)
    this.loadUserData();
    
    // Setup session cleanup
    this.setupSessionCleanup();
    
    logger.info('✅ Developer User Service initialized');
  }

  private loadUserData(): void {
    // In production, load from database
    logger.info('📊 Loading user data...');
  }

  private setupSessionCleanup(): void {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Register a new developer user
   */
  async registerUser(userData: {
    email: string;
    username: string;
    password: string;
    displayName: string;
    referralCode?: string;
  }): Promise<{
    success: boolean;
    user?: UserProfile;
    error?: string;
  }> {
    try {
      // Validate input
      const validation = this.validateRegistration(userData);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Check if user already exists
      if (this.emailToUserId.has(userData.email.toLowerCase())) {
        return { success: false, error: 'Email already registered' };
      }

      if (this.usernameToUserId.has(userData.username.toLowerCase())) {
        return { success: false, error: 'Username already taken' };
      }

      // Create user profile
      const userId = this.generateUserId();
      const user: UserProfile = {
        id: userId,
        email: userData.email.toLowerCase(),
        username: userData.username.toLowerCase(),
        displayName: userData.displayName,
        skills: [],
        interests: [],
        experience: 'beginner',
        preferredLanguages: ['javascript'],
        timezone: 'UTC',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        emailVerified: false,
        isPublic: true,
        settings: {
          notifications: {
            email: true,
            push: true,
            marketing: true,
            updates: true
          },
          privacy: {
            showEmail: false,
            showProjects: true,
            showActivity: true
          },
          preferences: {
            theme: 'auto',
            defaultFramework: 'react',
            aiModel: 'auto',
            codeStyle: 'prettier'
          }
        },
        stats: {
          projectsGenerated: 0,
          tokensUsed: 0,
          favoriteTemplates: [],
          achievements: ['welcome']
        }
      };

      // Store user
      this.users.set(userId, user);
      this.emailToUserId.set(userData.email.toLowerCase(), userId);
      this.usernameToUserId.set(userData.username.toLowerCase(), userId);

      // Create free subscription
      await billingService.createSubscription(userId, 'free');

      // Handle referral
      if (userData.referralCode) {
        await this.processReferral(userId, userData.referralCode);
      }

      // Send welcome email
      await this.sendWelcomeEmail(user);

      logger.info(`👤 New developer registered: ${userData.username} (${userData.email})`);

      return { success: true, user };

    } catch (error: any) {
      logger.error('User registration failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Authenticate user login
   */
  async loginUser(credentials: {
    emailOrUsername: string;
    password: string;
    deviceInfo: {
      userAgent: string;
      ip: string;
    };
  }): Promise<{
    success: boolean;
    user?: UserProfile;
    session?: UserSession;
    error?: string;
  }> {
    try {
      // Find user
      const userId = this.findUserByEmailOrUsername(credentials.emailOrUsername);
      if (!userId) {
        return { success: false, error: 'User not found' };
      }

      const user = this.users.get(userId)!;

      // In production, verify password hash
      // For now, simulate successful authentication
      const isValidPassword = true; // bcrypt.compare(credentials.password, user.passwordHash)
      
      if (!isValidPassword) {
        return { success: false, error: 'Invalid password' };
      }

      // Create session
      const session = await this.createUserSession(userId, credentials.deviceInfo);

      // Update last active
      user.lastActiveAt = new Date();

      logger.info(`🔐 User logged in: ${user.username}`);

      return { success: true, user, session };

    } catch (error: any) {
      logger.error('User login failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user profile
   */
  getUserProfile(userId: string): UserProfile | null {
    return this.users.get(userId) || null;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Validate updates
      if (updates.email && updates.email !== user.email) {
        if (this.emailToUserId.has(updates.email.toLowerCase())) {
          return { success: false, error: 'Email already in use' };
        }
      }

      if (updates.username && updates.username !== user.username) {
        if (this.usernameToUserId.has(updates.username.toLowerCase())) {
          return { success: false, error: 'Username already taken' };
        }
      }

      // Apply updates
      const updatedUser = { ...user, ...updates };
      this.users.set(userId, updatedUser);

      // Update indexes if needed
      if (updates.email && updates.email !== user.email) {
        this.emailToUserId.delete(user.email);
        this.emailToUserId.set(updates.email.toLowerCase(), userId);
      }

      if (updates.username && updates.username !== user.username) {
        this.usernameToUserId.delete(user.username);
        this.usernameToUserId.set(updates.username.toLowerCase(), userId);
      }

      logger.info(`👤 User profile updated: ${user.username}`);

      return { success: true, user: updatedUser };

    } catch (error: any) {
      logger.error('Profile update failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create developer team
   */
  async createTeam(
    ownerId: string,
    teamData: {
      name: string;
      description: string;
      visibility: 'public' | 'private';
    }
  ): Promise<{ success: boolean; team?: DeveloperTeam; error?: string }> {
    try {
      const owner = this.users.get(ownerId);
      if (!owner) {
        return { success: false, error: 'Owner not found' };
      }

      const teamId = this.generateTeamId();
      const team: DeveloperTeam = {
        id: teamId,
        name: teamData.name,
        description: teamData.description,
        ownerId,
        members: [{
          userId: ownerId,
          role: 'owner',
          joinedAt: new Date(),
          permissions: ['all']
        }],
        settings: {
          visibility: teamData.visibility,
          allowInvites: true,
          defaultPermissions: ['read', 'write']
        },
        subscription: {
          planId: 'team',
          status: 'trial',
          limits: {
            maxMembers: 5,
            maxProjects: 50,
            monthlyGenerations: 2500
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.teams.set(teamId, team);

      logger.info(`👥 Team created: ${teamData.name} by ${owner.username}`);

      return { success: true, team };

    } catch (error: any) {
      logger.error('Team creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's teams
   */
  getUserTeams(userId: string): DeveloperTeam[] {
    const userTeams: DeveloperTeam[] = [];
    
    for (const team of this.teams.values()) {
      const isMember = team.members.some(member => member.userId === userId);
      if (isMember) {
        userTeams.push(team);
      }
    }

    return userTeams;
  }

  /**
   * Generate user analytics for dashboard
   */
  getUserAnalytics(userId: string, days: number = 30): {
    overview: {
      projectsGenerated: number;
      tokensUsed: number;
      timesSaved: number;
      rank: string;
    };
    activity: Array<{
      date: string;
      projects: number;
      tokens: number;
    }>;
    topFrameworks: Array<{
      framework: string;
      count: number;
      percentage: number;
    }>;
    achievements: Array<{
      id: string;
      name: string;
      description: string;
      unlockedAt: Date;
    }>;
  } {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // In production, query actual analytics data
    return {
      overview: {
        projectsGenerated: user.stats.projectsGenerated,
        tokensUsed: user.stats.tokensUsed,
        timesSaved: Math.round(user.stats.projectsGenerated * 4.5), // Assume 4.5 hours saved per project
        rank: this.calculateUserRank(user.stats.projectsGenerated)
      },
      activity: this.generateActivityData(days),
      topFrameworks: [
        { framework: 'React', count: 15, percentage: 45 },
        { framework: 'Node.js', count: 10, percentage: 30 },
        { framework: 'Next.js', count: 5, percentage: 15 },
        { framework: 'Vue.js', count: 3, percentage: 10 }
      ],
      achievements: [
        {
          id: 'welcome',
          name: 'Welcome to Recoder.ai',
          description: 'Created your first account',
          unlockedAt: user.createdAt
        }
      ]
    };
  }

  private validateRegistration(userData: any): { valid: boolean; error?: string } {
    if (!userData.email || !this.isValidEmail(userData.email)) {
      return { valid: false, error: 'Valid email is required' };
    }

    if (!userData.username || userData.username.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
      return { valid: false, error: 'Username can only contain letters, numbers, hyphens, and underscores' };
    }

    if (!userData.password || userData.password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters' };
    }

    if (!userData.displayName || userData.displayName.length < 1) {
      return { valid: false, error: 'Display name is required' };
    }

    return { valid: true };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private findUserByEmailOrUsername(identifier: string): string | null {
    const lowerIdentifier = identifier.toLowerCase();
    
    // Try email first
    if (this.emailToUserId.has(lowerIdentifier)) {
      return this.emailToUserId.get(lowerIdentifier)!;
    }

    // Try username
    if (this.usernameToUserId.has(lowerIdentifier)) {
      return this.usernameToUserId.get(lowerIdentifier)!;
    }

    return null;
  }

  private async createUserSession(
    userId: string,
    deviceInfo: { userAgent: string; ip: string }
  ): Promise<UserSession> {
    const sessionId = this.generateSessionId();
    const token = this.generateSessionToken();
    
    const session: UserSession = {
      userId,
      sessionId,
      token,
      deviceInfo,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      lastUsedAt: new Date()
    };

    this.sessions.set(sessionId, session);
    
    return session;
  }

  private async processReferral(userId: string, referralCode: string): Promise<void> {
    // In production, implement referral logic
    // - Find referring user
    // - Grant referral bonuses
    // - Update referral stats
    logger.info(`🎁 Referral processed for user ${userId} with code ${referralCode}`);
  }

  private async sendWelcomeEmail(user: UserProfile): Promise<void> {
    // In production, send actual welcome email
    logger.info(`📧 Welcome email queued for ${user.email}`);
  }

  private calculateUserRank(projectsGenerated: number): string {
    if (projectsGenerated >= 100) return 'Expert';
    if (projectsGenerated >= 50) return 'Advanced';
    if (projectsGenerated >= 20) return 'Intermediate';
    if (projectsGenerated >= 5) return 'Beginner';
    return 'Newcomer';
  }

  private generateActivityData(days: number): Array<{ date: string; projects: number; tokens: number }> {
    const activity = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      activity.push({
        date: date.toISOString().split('T')[0],
        projects: Math.floor(Math.random() * 5),
        tokens: Math.floor(Math.random() * 1000)
      });
    }
    return activity;
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private generateUserId(): string {
    return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private generateTeamId(): string {
    return 'team_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private generateSessionId(): string {
    return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private generateSessionToken(): string {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
  }
}

// Export singleton instance
export const userService = new UserService();