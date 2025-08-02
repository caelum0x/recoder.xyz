/**
 * Community feedback and rating system for the Craft Code marketplace
 */
import { EventEmitter } from 'events';
export declare class PluginRatingSystem extends EventEmitter {
    private config;
    private storage;
    private userService;
    private ratings;
    private reviews;
    private userRatings;
    private moderationQueue;
    constructor(config: RatingSystemConfig, storage: RatingStorage, userService: UserService);
    /**
     * Submit a rating for a plugin
     */
    submitRating(pluginId: string, userId: string, ratingData: SubmitRatingRequest): Promise<RatingResult>;
    /**
     * Get plugin rating summary
     */
    getPluginRating(pluginId: string): Promise<PluginRating | null>;
    /**
     * Get plugin reviews with pagination
     */
    getPluginReviews(pluginId: string, options?: ReviewsOptions): Promise<ReviewsResult>;
    /**
     * Get user's rating for a plugin
     */
    getUserRating(pluginId: string, userId: string): Promise<UserRating | null>;
    /**
     * Delete a user's rating
     */
    deleteRating(pluginId: string, userId: string): Promise<boolean>;
    /**
     * Mark a review as helpful/not helpful
     */
    markReviewHelpful(ratingId: string, userId: string, helpful: boolean): Promise<boolean>;
    /**
     * Report a review for moderation
     */
    reportReview(ratingId: string, reporterId: string, reason: ReportReason, details?: string): Promise<boolean>;
    /**
     * Get rating statistics for a plugin
     */
    getRatingStatistics(pluginId: string): Promise<RatingStatistics>;
    /**
     * Get trending reviews (most helpful recently)
     */
    getTrendingReviews(limit?: number): Promise<PluginReview[]>;
    /**
     * Moderate pending reviews
     */
    moderateReview(ratingId: string, moderatorId: string, action: ModerationAction, reason?: string): Promise<boolean>;
    /**
     * Get pending moderation items
     */
    getModerationQueue(): ModerationItem[];
    private loadCachedData;
    private validateUserCanRate;
    private validateRatingData;
    private calculatePluginRating;
    private calculateDistribution;
    private updatePluginRating;
    private filterReviews;
    private sortReviews;
    private calculateTrendingScore;
    private needsModeration;
    private addToModerationQueue;
    private calculateModerationPriority;
    private containsSpam;
    private isCacheValid;
    private isVerifiedUser;
    private generateRatingId;
    private generateReportId;
    private generateModerationId;
}
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
    score: number;
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
    rateLimitWindow: number;
    maxTitleLength: number;
    maxCommentLength: number;
    cacheTimeout: number;
    autoModeration: boolean;
}
export interface RatingStorage {
    savePluginRating(rating: PluginRating): Promise<void>;
    getPluginRating(pluginId: string): Promise<PluginRating | null>;
    getAllPluginRatings(): Promise<PluginRating[]>;
    saveUserRating(rating: UserRating): Promise<void>;
    getUserRating(pluginId: string, userId: string): Promise<UserRating | null>;
    deleteUserRating(pluginId: string, userId: string): Promise<void>;
    getAllUserRatings(): Promise<UserRating[]>;
    getRecentUserRatings(userId: string, windowMs: number): Promise<UserRating[]>;
    getAllReviews(): Promise<PluginReview[]>;
    saveHelpfulVote(ratingId: string, userId: string, helpful: boolean): Promise<void>;
    updateHelpfulVote(ratingId: string, userId: string, helpful: boolean): Promise<void>;
    getHelpfulVote(ratingId: string, userId: string): Promise<{
        helpful: boolean;
    } | null>;
    saveReviewReport(report: ReviewReport): Promise<void>;
    getReviewReports(): Promise<ReviewReport[]>;
}
export interface UserService {
    hasUserUsedPlugin(userId: string, pluginId: string): Promise<boolean>;
    isUserVerified(userId: string): Promise<boolean>;
    getUserInfo(userId: string): Promise<{
        name: string;
        avatar?: string;
    } | null>;
}
//# sourceMappingURL=rating-system.d.ts.map