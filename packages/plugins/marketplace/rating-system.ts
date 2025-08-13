/**
 * Community feedback and rating system for the Craft Code marketplace
 */

import { EventEmitter } from 'events';
import {
  PluginMetadata
} from '../plugin-sdk/types';

export class PluginRatingSystem extends EventEmitter {
  private ratings: Map<string, PluginRating> = new Map();
  private reviews: Map<string, PluginReview[]> = new Map();
  private userRatings: Map<string, Map<string, UserRating>> = new Map();
  private moderationQueue: ModerationItem[] = [];

  constructor(
    private config: RatingSystemConfig,
    private storage: RatingStorage,
    private userService: UserService
  ) {
    super();
    this.loadCachedData();
  }

  /**
   * Submit a rating for a plugin
   */
  async submitRating(
    pluginId: string,
    userId: string,
    ratingData: SubmitRatingRequest
  ): Promise<RatingResult> {
    try {
      // Validate user can rate this plugin
      await this.validateUserCanRate(pluginId, userId);

      // Validate rating data
      this.validateRatingData(ratingData);

      // Check for existing rating
      const existingRating = await this.getUserRating(pluginId, userId);
      const isUpdate = !!existingRating;

      // Create rating object
      const rating: UserRating = {
        id: existingRating?.id || this.generateRatingId(),
        pluginId,
        userId,
        score: ratingData.score,
        title: ratingData.title,
        comment: ratingData.comment,
        version: ratingData.version,
        helpful: 0,
        notHelpful: 0,
        createdAt: existingRating?.createdAt || new Date(),
        updatedAt: new Date(),
        verified: await this.isVerifiedUser(userId),
        moderated: false
      };

      // Store user rating
      if (!this.userRatings.has(pluginId)) {
        this.userRatings.set(pluginId, new Map());
      }
      this.userRatings.get(pluginId)!.set(userId, rating);

      // Add to moderation queue if needed
      if (this.needsModeration(rating)) {
        await this.addToModerationQueue(rating);
      } else {
        rating.moderated = true;
      }

      // Update plugin rating aggregate
      await this.updatePluginRating(pluginId);

      // Store in persistent storage
      await this.storage.saveUserRating(rating);

      this.emit('ratingSubmitted', {
        pluginId,
        userId,
        rating,
        isUpdate
      });

      return {
        success: true,
        ratingId: rating.id,
        action: isUpdate ? 'updated' : 'created',
        needsModeration: !rating.moderated
      };

    } catch (error) {
      console.error(`Failed to submit rating for ${pluginId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get plugin rating summary
   */
  async getPluginRating(pluginId: string): Promise<PluginRating | null> {
    const cached = this.ratings.get(pluginId);
    if (cached && this.isCacheValid(cached.updatedAt)) {
      return cached;
    }

    try {
      // Fetch from storage or calculate
      const rating = await this.calculatePluginRating(pluginId);
      if (rating) {
        this.ratings.set(pluginId, rating);
        await this.storage.savePluginRating(rating);
      }
      return rating;
    } catch (error) {
      console.error(`Failed to get rating for ${pluginId}:`, error);
      return cached || null;
    }
  }

  /**
   * Get plugin reviews with pagination
   */
  async getPluginReviews(
    pluginId: string,
    options: ReviewsOptions = {}
  ): Promise<ReviewsResult> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'helpful',
      filterBy = 'all',
      minScore,
      maxScore,
      version
    } = options;

    try {
      let reviews = this.reviews.get(pluginId) || [];

      // Apply filters
      reviews = this.filterReviews(reviews, {
        filterBy,
        minScore,
        maxScore,
        version
      });

      // Sort reviews
      reviews = this.sortReviews(reviews, sortBy);

      // Apply pagination
      const offset = (page - 1) * limit;
      const paginatedReviews = reviews.slice(offset, offset + limit);

      return {
        reviews: paginatedReviews,
        total: reviews.length,
        page,
        limit,
        hasMore: offset + limit < reviews.length
      };

    } catch (error) {
      console.error(`Failed to get reviews for ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's rating for a plugin
   */
  async getUserRating(pluginId: string, userId: string): Promise<UserRating | null> {
    const pluginRatings = this.userRatings.get(pluginId);
    if (pluginRatings) {
      return pluginRatings.get(userId) || null;
    }

    try {
      const rating = await this.storage.getUserRating(pluginId, userId);
      if (rating) {
        if (!this.userRatings.has(pluginId)) {
          this.userRatings.set(pluginId, new Map());
        }
        this.userRatings.get(pluginId)!.set(userId, rating);
      }
      return rating;
    } catch (error) {
      console.error(`Failed to get user rating for ${pluginId}:`, error);
      return null;
    }
  }

  /**
   * Delete a user's rating
   */
  async deleteRating(pluginId: string, userId: string): Promise<boolean> {
    try {
      const rating = await this.getUserRating(pluginId, userId);
      if (!rating) {
        return false;
      }

      // Remove from cache
      const pluginRatings = this.userRatings.get(pluginId);
      if (pluginRatings) {
        pluginRatings.delete(userId);
      }

      // Remove from storage
      await this.storage.deleteUserRating(pluginId, userId);

      // Update plugin rating aggregate
      await this.updatePluginRating(pluginId);

      this.emit('ratingDeleted', { pluginId, userId, ratingId: rating.id });

      return true;
    } catch (error) {
      console.error(`Failed to delete rating for ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Mark a review as helpful/not helpful
   */
  async markReviewHelpful(
    ratingId: string,
    userId: string,
    helpful: boolean
  ): Promise<boolean> {
    try {
      // Find the rating
      let targetRating: UserRating | null = null;
      let pluginId = '';

      for (const [pid, ratings] of this.userRatings) {
        for (const rating of ratings.values()) {
          if (rating.id === ratingId) {
            targetRating = rating;
            pluginId = pid;
            break;
          }
        }
        if (targetRating) break;
      }

      if (!targetRating) {
        return false;
      }

      // Check if user already marked this review
      const existingVote = await this.storage.getHelpfulVote(ratingId, userId);
      if (existingVote) {
        // Update existing vote
        if (existingVote.helpful !== helpful) {
          if (helpful) {
            targetRating.helpful++;
            targetRating.notHelpful--;
          } else {
            targetRating.helpful--;
            targetRating.notHelpful++;
          }
          await this.storage.updateHelpfulVote(ratingId, userId, helpful);
        }
      } else {
        // New vote
        if (helpful) {
          targetRating.helpful++;
        } else {
          targetRating.notHelpful++;
        }
        await this.storage.saveHelpfulVote(ratingId, userId, helpful);
      }

      // Update rating in storage
      await this.storage.saveUserRating(targetRating);

      this.emit('reviewMarkedHelpful', {
        ratingId,
        userId,
        helpful,
        pluginId
      });

      return true;
    } catch (error) {
      console.error(`Failed to mark review helpful:`, error);
      return false;
    }
  }

  /**
   * Report a review for moderation
   */
  async reportReview(
    ratingId: string,
    reporterId: string,
    reason: ReportReason,
    details?: string
  ): Promise<boolean> {
    try {
      const report: ReviewReport = {
        id: this.generateReportId(),
        ratingId,
        reporterId,
        reason,
        details,
        status: 'pending',
        createdAt: new Date()
      };

      await this.storage.saveReviewReport(report);

      this.emit('reviewReported', {
        ratingId,
        reporterId,
        reason,
        reportId: report.id
      });

      return true;
    } catch (error) {
      console.error('Failed to report review:', error);
      return false;
    }
  }

  /**
   * Get rating statistics for a plugin
   */
  async getRatingStatistics(pluginId: string): Promise<RatingStatistics> {
    try {
      const userRatings = Array.from(this.userRatings.get(pluginId)?.values() || []);
      const moderatedRatings = userRatings.filter(r => r.moderated);

      if (moderatedRatings.length === 0) {
        return {
          totalRatings: 0,
          averageScore: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          percentagePositive: 0,
          verifiedRatings: 0
        };
      }

      const scores = moderatedRatings.map(r => r.score);
      const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const score of scores) {
        distribution[score]++;
      }

      const positiveRatings = scores.filter(score => score >= 4).length;
      const percentagePositive = (positiveRatings / scores.length) * 100;

      const verifiedRatings = moderatedRatings.filter(r => r.verified).length;

      return {
        totalRatings: moderatedRatings.length,
        averageScore: Math.round(averageScore * 10) / 10,
        distribution,
        percentagePositive: Math.round(percentagePositive),
        verifiedRatings
      };
    } catch (error) {
      console.error(`Failed to get rating statistics for ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get trending reviews (most helpful recently)
   */
  async getTrendingReviews(limit = 10): Promise<PluginReview[]> {
    const allReviews: PluginReview[] = [];
    
    for (const reviews of this.reviews.values()) {
      allReviews.push(...reviews);
    }

    // Calculate trending score based on helpfulness and recency
    const trending = allReviews
      .map(review => ({
        review,
        score: this.calculateTrendingScore(review)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.review);

    return trending;
  }

  /**
   * Moderate pending reviews
   */
  async moderateReview(
    ratingId: string,
    moderatorId: string,
    action: ModerationAction,
    reason?: string
  ): Promise<boolean> {
    try {
      // Find the rating
      let targetRating: UserRating | null = null;
      
      for (const ratings of this.userRatings.values()) {
        for (const rating of ratings.values()) {
          if (rating.id === ratingId) {
            targetRating = rating;
            break;
          }
        }
        if (targetRating) break;
      }

      if (!targetRating) {
        return false;
      }

      // Apply moderation action
      switch (action) {
        case 'approve':
          targetRating.moderated = true;
          break;
        case 'reject':
          // Remove the rating
          const pluginRatings = this.userRatings.get(targetRating.pluginId);
          if (pluginRatings) {
            pluginRatings.delete(targetRating.userId);
          }
          await this.storage.deleteUserRating(targetRating.pluginId, targetRating.userId);
          break;
        case 'edit':
          targetRating.moderated = true;
          // Additional editing logic would go here
          break;
      }

      // Remove from moderation queue
      this.moderationQueue = this.moderationQueue.filter(item => item.ratingId !== ratingId);

      // Update plugin rating if approved
      if (action === 'approve') {
        await this.updatePluginRating(targetRating.pluginId);
        await this.storage.saveUserRating(targetRating);
      }

      this.emit('reviewModerated', {
        ratingId,
        moderatorId,
        action,
        reason
      });

      return true;
    } catch (error) {
      console.error('Failed to moderate review:', error);
      return false;
    }
  }

  /**
   * Get pending moderation items
   */
  getModerationQueue(): ModerationItem[] {
    return [...this.moderationQueue];
  }

  // Private methods

  private async loadCachedData(): Promise<void> {
    try {
      const [ratings, reviews, userRatings] = await Promise.all([
        this.storage.getAllPluginRatings(),
        this.storage.getAllReviews(),
        this.storage.getAllUserRatings()
      ]);

      // Load plugin ratings
      for (const rating of ratings) {
        this.ratings.set(rating.pluginId, rating);
      }

      // Load reviews
      for (const review of reviews) {
        if (!this.reviews.has(review.pluginId)) {
          this.reviews.set(review.pluginId, []);
        }
        this.reviews.get(review.pluginId)!.push(review);
      }

      // Load user ratings
      for (const rating of userRatings) {
        if (!this.userRatings.has(rating.pluginId)) {
          this.userRatings.set(rating.pluginId, new Map());
        }
        this.userRatings.get(rating.pluginId)!.set(rating.userId, rating);
      }

      console.log(`Loaded rating data: ${ratings.length} plugin ratings, ${reviews.length} reviews`);
    } catch (error) {
      console.error('Failed to load cached rating data:', error);
    }
  }

  private async validateUserCanRate(pluginId: string, userId: string): Promise<void> {
    // Check if user has used the plugin
    if (this.config.requireUsage) {
      const hasUsed = await this.userService.hasUserUsedPlugin(userId, pluginId);
      if (!hasUsed) {
        throw new Error('You must install and use the plugin before rating it');
      }
    }

    // Check rate limiting
    const recentRatings = await this.storage.getRecentUserRatings(userId, this.config.rateLimitWindow);
    if (recentRatings.length >= this.config.maxRatingsPerWindow) {
      throw new Error('Rate limit exceeded. Please wait before submitting another rating.');
    }
  }

  private validateRatingData(data: SubmitRatingRequest): void {
    if (data.score < 1 || data.score > 5) {
      throw new Error('Rating score must be between 1 and 5');
    }

    if (data.title && data.title.length > this.config.maxTitleLength) {
      throw new Error(`Title cannot exceed ${this.config.maxTitleLength} characters`);
    }

    if (data.comment && data.comment.length > this.config.maxCommentLength) {
      throw new Error(`Comment cannot exceed ${this.config.maxCommentLength} characters`);
    }

    // Check for spam/offensive content
    if (this.containsSpam(data.title) || this.containsSpam(data.comment)) {
      throw new Error('Content appears to be spam or inappropriate');
    }
  }

  private async calculatePluginRating(pluginId: string): Promise<PluginRating | null> {
    const userRatings = Array.from(this.userRatings.get(pluginId)?.values() || []);
    const moderatedRatings = userRatings.filter(r => r.moderated);

    if (moderatedRatings.length === 0) {
      return null;
    }

    const scores = moderatedRatings.map(r => r.score);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    return {
      pluginId,
      average: Math.round(average * 10) / 10,
      count: moderatedRatings.length,
      distribution: this.calculateDistribution(scores),
      updatedAt: new Date()
    };
  }

  private calculateDistribution(scores: number[]): Record<number, number> {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const score of scores) {
      distribution[score]++;
    }
    return distribution;
  }

  private async updatePluginRating(pluginId: string): Promise<void> {
    const rating = await this.calculatePluginRating(pluginId);
    if (rating) {
      this.ratings.set(pluginId, rating);
      await this.storage.savePluginRating(rating);
      
      this.emit('pluginRatingUpdated', {
        pluginId,
        rating
      });
    }
  }

  private filterReviews(reviews: PluginReview[], filters: ReviewFilters): PluginReview[] {
    return reviews.filter(review => {
      if (filters.minScore && review.score < filters.minScore) return false;
      if (filters.maxScore && review.score > filters.maxScore) return false;
      if (filters.version && review.version !== filters.version) return false;
      if (filters.filterBy === 'verified' && !review.verified) return false;
      if (filters.filterBy === 'withComments' && !review.comment) return false;
      return true;
    });
  }

  private sortReviews(reviews: PluginReview[], sortBy: string): PluginReview[] {
    switch (sortBy) {
      case 'helpful':
        return reviews.sort((a, b) => b.helpful - a.helpful);
      case 'recent':
        return reviews.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      case 'rating':
        return reviews.sort((a, b) => b.score - a.score);
      default:
        return reviews;
    }
  }

  private calculateTrendingScore(review: PluginReview): number {
    const daysSinceUpdate = (Date.now() - review.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 7 - daysSinceUpdate) / 7; // 7-day window
    const helpfulnessScore = review.helpful - review.notHelpful;
    
    return helpfulnessScore * (1 + recencyBoost);
  }

  private needsModeration(rating: UserRating): boolean {
    if (!rating.comment) return false;
    
    // Check for suspicious patterns
    if (this.containsSpam(rating.comment) || this.containsSpam(rating.title)) {
      return true;
    }
    
    // New users need moderation
    if (!rating.verified) {
      return true;
    }
    
    return false;
  }

  private async addToModerationQueue(rating: UserRating): Promise<void> {
    const item: ModerationItem = {
      id: this.generateModerationId(),
      ratingId: rating.id,
      pluginId: rating.pluginId,
      userId: rating.userId,
      type: 'review',
      priority: this.calculateModerationPriority(rating),
      createdAt: new Date()
    };

    this.moderationQueue.push(item);
    
    // Sort by priority
    this.moderationQueue.sort((a, b) => b.priority - a.priority);
    
    this.emit('moderationQueued', item);
  }

  private calculateModerationPriority(rating: UserRating): number {
    let priority = 1;
    
    if (this.containsSpam(rating.comment) || this.containsSpam(rating.title)) {
      priority += 5;
    }
    
    if (!rating.verified) {
      priority += 2;
    }
    
    return priority;
  }

  private containsSpam(text?: string): boolean {
    if (!text) return false;
    
    const spamPatterns = [
      /\b(buy|cheap|discount|free|click here|visit|download now)\b/i,
      /http[s]?:\/\/[^\s]+/i, // URLs
      /(.)\1{4,}/, // Repeated characters
      /[A-Z]{5,}/ // All caps words
    ];
    
    return spamPatterns.some(pattern => pattern.test(text));
  }

  private isCacheValid(lastUpdate: Date): boolean {
    const cacheAge = Date.now() - lastUpdate.getTime();
    return cacheAge < this.config.cacheTimeout;
  }

  private async isVerifiedUser(userId: string): Promise<boolean> {
    return await this.userService.isUserVerified(userId);
  }

  private generateRatingId(): string {
    return `rating_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateModerationId(): string {
    return `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting interfaces and types

export interface PluginRating {
  pluginId: string;
  average: number;
  count: number;
  distribution: Record<number, number>;
  updatedAt: Date;
}

export interface UserRating {
  id: string;
  pluginId: string;
  userId: string;
  score: number; // 1-5
  title?: string;
  comment?: string;
  version?: string;
  helpful: number;
  notHelpful: number;
  createdAt: Date;
  updatedAt: Date;
  verified: boolean;
  moderated: boolean;
}

export interface PluginReview extends UserRating {
  userName?: string;
  userAvatar?: string;
}

export interface SubmitRatingRequest {
  score: number;
  title?: string;
  comment?: string;
  version?: string;
}

export interface RatingResult {
  success: boolean;
  ratingId?: string;
  action?: 'created' | 'updated';
  needsModeration?: boolean;
  error?: string;
}

export interface ReviewsOptions {
  page?: number;
  limit?: number;
  sortBy?: 'helpful' | 'recent' | 'rating';
  filterBy?: 'all' | 'verified' | 'withComments';
  minScore?: number;
  maxScore?: number;
  version?: string;
}

export interface ReviewFilters {
  filterBy?: string;
  minScore?: number;
  maxScore?: number;
  version?: string;
}

export interface ReviewsResult {
  reviews: PluginReview[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface RatingStatistics {
  totalRatings: number;
  averageScore: number;
  distribution: Record<number, number>;
  percentagePositive: number;
  verifiedRatings: number;
}

export interface ReviewReport {
  id: string;
  ratingId: string;
  reporterId: string;
  reason: ReportReason;
  details?: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface ModerationItem {
  id: string;
  ratingId: string;
  pluginId: string;
  userId: string;
  type: 'review' | 'report';
  priority: number;
  createdAt: Date;
}

export type ReportReason = 'spam' | 'inappropriate' | 'offensive' | 'misleading' | 'other';
export type ModerationAction = 'approve' | 'reject' | 'edit';

export interface RatingSystemConfig {
  requireUsage: boolean;
  maxRatingsPerWindow: number;
  rateLimitWindow: number; // milliseconds
  maxTitleLength: number;
  maxCommentLength: number;
  cacheTimeout: number;
  autoModeration: boolean;
}

export interface RatingStorage {
  // Plugin ratings
  savePluginRating(rating: PluginRating): Promise<void>;
  getPluginRating(pluginId: string): Promise<PluginRating | null>;
  getAllPluginRatings(): Promise<PluginRating[]>;

  // User ratings
  saveUserRating(rating: UserRating): Promise<void>;
  getUserRating(pluginId: string, userId: string): Promise<UserRating | null>;
  deleteUserRating(pluginId: string, userId: string): Promise<void>;
  getAllUserRatings(): Promise<UserRating[]>;
  getRecentUserRatings(userId: string, windowMs: number): Promise<UserRating[]>;

  // Reviews
  getAllReviews(): Promise<PluginReview[]>;

  // Helpful votes
  saveHelpfulVote(ratingId: string, userId: string, helpful: boolean): Promise<void>;
  updateHelpfulVote(ratingId: string, userId: string, helpful: boolean): Promise<void>;
  getHelpfulVote(ratingId: string, userId: string): Promise<{ helpful: boolean } | null>;

  // Reports
  saveReviewReport(report: ReviewReport): Promise<void>;
  getReviewReports(): Promise<ReviewReport[]>;
}

export interface UserService {
  hasUserUsedPlugin(userId: string, pluginId: string): Promise<boolean>;
  isUserVerified(userId: string): Promise<boolean>;
  getUserInfo(userId: string): Promise<{ name: string; avatar?: string } | null>;
}