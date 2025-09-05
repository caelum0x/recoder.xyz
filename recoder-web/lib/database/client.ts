import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Database client wrapper with connection pooling
export class DatabaseClient {
  private static instance: DatabaseClient;
  private pool: Pool;

  private constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Encryption utilities for sensitive data
export class EncryptionService {
  private static algorithm = 'aes-256-gcm';
  private static key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'default-key').digest();

  static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  static decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// User management service
export class UserService {
  private db: DatabaseClient;

  constructor() {
    this.db = DatabaseClient.getInstance();
  }

  async createUser(userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
  }) {
    const { email, password, firstName, lastName, companyName } = userData;
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, company_name, trial_ends_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, first_name, last_name, company_name, role, subscription_tier, created_at
    `;
    
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    
    const result = await this.db.query(query, [
      email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      companyName,
      trialEndsAt
    ]);

    return result.rows[0];
  }

  async authenticateUser(email: string, password: string) {
    const query = `
      SELECT id, email, password_hash, first_name, last_name, company_name, 
             role, subscription_tier, subscription_status, trial_ends_at
      FROM users 
      WHERE email = $1 AND subscription_status != 'deleted'
    `;
    
    const result = await this.db.query(query, [email.toLowerCase()]);
    const user = result.rows[0];
    
    if (!user) {
      throw new Error('Invalid email or password');
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await this.db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    delete user.password_hash;
    return user;
  }

  async getUserById(userId: string) {
    const query = `
      SELECT id, email, first_name, last_name, company_name, role, 
             subscription_tier, subscription_status, trial_ends_at,
             email_verified, avatar_url, timezone, created_at
      FROM users 
      WHERE id = $1
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows[0];
  }

  async updateUser(userId: string, updates: any) {
    const allowedFields = ['first_name', 'last_name', 'company_name', 'phone', 'timezone', 'avatar_url'];
    const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = [userId, ...updateFields.map(field => updates[field])];

    const query = `
      UPDATE users 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, first_name, last_name, company_name, updated_at
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }
}

// Social media accounts service
export class SocialAccountService {
  private db: DatabaseClient;

  constructor() {
    this.db = DatabaseClient.getInstance();
  }

  async connectAccount(accountData: {
    userId: string;
    teamId?: string;
    platform: string;
    platformUserId: string;
    username?: string;
    displayName: string;
    profileImageUrl?: string;
    followerCount?: number;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    permissions?: string[];
  }) {
    const {
      userId, teamId, platform, platformUserId, username, displayName,
      profileImageUrl, followerCount, accessToken, refreshToken,
      tokenExpiresAt, permissions
    } = accountData;

    // Encrypt tokens
    const encryptedAccessToken = EncryptionService.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? EncryptionService.encrypt(refreshToken) : null;

    const query = `
      INSERT INTO social_accounts (
        user_id, team_id, platform, platform_user_id, username, display_name,
        profile_image_url, follower_count, access_token, refresh_token,
        token_expires_at, permissions, last_sync_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (platform, platform_user_id, user_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        account_status = 'active',
        last_sync_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `;

    const params: any[] = [
      userId, teamId, platform, platformUserId, username, displayName,
      profileImageUrl, followerCount, encryptedAccessToken, encryptedRefreshToken,
      tokenExpiresAt, permissions
    ];
    
    const result = await this.db.query(query, params);

    const account = result.rows[0];
    // Don't return encrypted tokens
    delete account.access_token;
    delete account.refresh_token;

    return account;
  }

  async getAccountsByUser(userId: string, teamId?: string) {
    const query = `
      SELECT id, platform, platform_user_id, username, display_name,
             profile_image_url, follower_count, verified, business_account,
             account_status, last_sync_at, created_at
      FROM social_accounts
      WHERE user_id = $1 AND (team_id = $2 OR team_id IS NULL)
      ORDER BY platform, display_name
    `;

    const result = await this.db.query(query, [userId, teamId]);
    return result.rows;
  }

  async getAccountTokens(accountId: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const query = `
      SELECT access_token, refresh_token
      FROM social_accounts
      WHERE id = $1
    `;

    const result = await this.db.query(query, [accountId]);
    const account = result.rows[0];

    if (!account) {
      throw new Error('Account not found');
    }

    return {
      accessToken: EncryptionService.decrypt(account.access_token),
      refreshToken: account.refresh_token ? EncryptionService.decrypt(account.refresh_token) : undefined
    };
  }

  async updateAccountMetrics(accountId: string, metrics: {
    followerCount?: number;
    followingCount?: number;
    verified?: boolean;
  }) {
    const updateFields: string[] = [];
    const values: (string | number | boolean)[] = [accountId];

    if (metrics.followerCount !== undefined) {
      updateFields.push(`follower_count = $${values.length + 1}`);
      values.push(metrics.followerCount);
    }

    if (metrics.followingCount !== undefined) {
      updateFields.push(`following_count = $${values.length + 1}`);
      values.push(metrics.followingCount);
    }

    if (metrics.verified !== undefined) {
      updateFields.push(`verified = $${values.length + 1}`);
      values.push(metrics.verified);
    }

    if (updateFields.length === 0) return;

    const query = `
      UPDATE social_accounts
      SET ${updateFields.join(', ')}, last_sync_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, values);
  }
}

// Posts/Content service
export class PostService {
  private db: DatabaseClient;

  constructor() {
    this.db = DatabaseClient.getInstance();
  }

  async createPost(postData: {
    userId: string;
    teamId?: string;
    campaignId?: string;
    socialAccountId: string;
    platform: string;
    content: string;
    mediaUrls?: string[];
    hashtags?: string[];
    mentions?: string[];
    postType?: string;
    scheduledFor: Date;
    approvalRequired?: boolean;
  }) {
    const {
      userId, teamId, campaignId, socialAccountId, platform, content,
      mediaUrls = [], hashtags = [], mentions = [], postType = 'post',
      scheduledFor, approvalRequired = false
    } = postData;

    const query = `
      INSERT INTO posts (
        user_id, team_id, campaign_id, social_account_id, platform,
        content, media_urls, hashtags, mentions, post_type,
        scheduled_for, approval_required, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const params: any[] = [
      userId, teamId, campaignId, socialAccountId, platform, content,
      mediaUrls, hashtags, mentions, postType, scheduledFor,
      approvalRequired, userId
    ];
    
    const result = await this.db.query(query, params);

    return result.rows[0];
  }

  async getScheduledPosts(userId: string, teamId?: string, options: {
    startDate?: Date;
    endDate?: Date;
    platform?: string;
    status?: string;
    limit?: number;
  } = {}) {
    const { startDate, endDate, platform, status, limit = 100 } = options;
    
    let query = `
      SELECT p.*, sa.platform, sa.username, sa.display_name,
             u.first_name, u.last_name
      FROM posts p
      JOIN social_accounts sa ON p.social_account_id = sa.id
      JOIN users u ON p.created_by = u.id
      WHERE p.user_id = $1
    `;
    
    const values: any[] = [userId];

    if (teamId) {
      query += ` AND (p.team_id = $${values.length + 1} OR p.team_id IS NULL)`;
      values.push(teamId);
    }

    if (startDate) {
      query += ` AND p.scheduled_for >= $${values.length + 1}`;
      values.push(startDate);
    }

    if (endDate) {
      query += ` AND p.scheduled_for <= $${values.length + 1}`;
      values.push(endDate);
    }

    if (platform) {
      query += ` AND p.platform = $${values.length + 1}`;
      values.push(platform);
    }

    if (status) {
      query += ` AND p.status = $${values.length + 1}`;
      values.push(status);
    }

    query += ` ORDER BY p.scheduled_for ASC LIMIT $${values.length + 1}`;
    values.push(limit);

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async updatePostStatus(postId: string, status: string, additionalData?: {
    platformPostId?: string;
    platformPostUrl?: string;
    postedAt?: Date;
    failureReason?: string;
  }) {
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: any[] = [postId, status];

    if (additionalData?.platformPostId) {
      updates.push(`platform_post_id = $${values.length + 1}`);
      values.push(additionalData.platformPostId);
    }

    if (additionalData?.platformPostUrl) {
      updates.push(`platform_post_url = $${values.length + 1}`);
      values.push(additionalData.platformPostUrl);
    }

    if (additionalData?.postedAt) {
      updates.push(`posted_at = $${values.length + 1}`);
      values.push(additionalData.postedAt);
    }

    if (additionalData?.failureReason) {
      updates.push(`failure_reason = $${values.length + 1}`);
      values.push(additionalData.failureReason);
    }

    const query = `
      UPDATE posts
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getPostsToProcess(limit: number = 10) {
    const query = `
      SELECT p.*, sa.access_token, sa.refresh_token
      FROM posts p
      JOIN social_accounts sa ON p.social_account_id = sa.id
      WHERE p.status = 'scheduled' 
        AND p.scheduled_for <= NOW()
        AND (p.retry_count < p.max_retries)
      ORDER BY p.scheduled_for ASC
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);
    return result.rows.map((post: any) => ({
      ...post,
      accessToken: EncryptionService.decrypt(post.access_token),
      refreshToken: post.refresh_token ? EncryptionService.decrypt(post.refresh_token) : undefined
    }));
  }
}

// Analytics service
export class AnalyticsService {
  private db: DatabaseClient;

  constructor() {
    this.db = DatabaseClient.getInstance();
  }

  async recordDailyMetrics(data: {
    date: Date;
    userId: string;
    teamId?: string;
    accountId?: string;
    postId?: string;
    adId?: string;
    platform: string;
    metricType: 'organic' | 'paid';
    metrics: {
      impressions?: number;
      reach?: number;
      engagement?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      clicks?: number;
      spend?: number;
      [key: string]: any;
    };
  }) {
    const {
      date, userId, teamId, accountId, postId, adId, platform, metricType, metrics
    } = data;

    const query = `
      INSERT INTO analytics_daily (
        date, user_id, team_id, account_id, post_id, ad_id,
        platform, metric_type, impressions, reach, engagement,
        likes, comments, shares, clicks, spend, custom_metrics
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (date, account_id, post_id, ad_id, platform, metric_type)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        reach = EXCLUDED.reach,
        engagement = EXCLUDED.engagement,
        likes = EXCLUDED.likes,
        comments = EXCLUDED.comments,
        shares = EXCLUDED.shares,
        clicks = EXCLUDED.clicks,
        spend = EXCLUDED.spend,
        custom_metrics = EXCLUDED.custom_metrics
    `;

    const params: any[] = [
      date, userId, teamId, accountId, postId, adId, platform, metricType,
      metrics.impressions || 0, metrics.reach || 0, metrics.engagement || 0,
      metrics.likes || 0, metrics.comments || 0, metrics.shares || 0,
      metrics.clicks || 0, metrics.spend || 0, 
      JSON.stringify(metrics.customMetrics || {})
    ];
    
    await this.db.query(query, params);
  }

  async getAnalyticsSummary(userId: string, options: {
    startDate: Date;
    endDate: Date;
    platform?: string;
    teamId?: string;
  }) {
    const { startDate, endDate, platform, teamId } = options;
    
    let query = `
      SELECT 
        platform,
        metric_type,
        SUM(impressions) as total_impressions,
        SUM(reach) as total_reach,
        SUM(engagement) as total_engagement,
        SUM(likes) as total_likes,
        SUM(comments) as total_comments,
        SUM(shares) as total_shares,
        SUM(clicks) as total_clicks,
        SUM(spend) as total_spend,
        AVG(CASE WHEN impressions > 0 THEN engagement::float / impressions ELSE 0 END) as avg_engagement_rate
      FROM analytics_daily
      WHERE user_id = $1 AND date BETWEEN $2 AND $3
    `;
    
    const values: any[] = [userId, startDate, endDate];

    if (platform) {
      query += ` AND platform = $${values.length + 1}`;
      values.push(platform);
    }

    if (teamId) {
      query += ` AND team_id = $${values.length + 1}`;
      values.push(teamId);
    }

    query += ` GROUP BY platform, metric_type ORDER BY platform, metric_type`;

    const result = await this.db.query(query, values);
    return result.rows;
  }
}

// Export singleton instances
export const userService = new UserService();
export const socialAccountService = new SocialAccountService();
export const postService = new PostService();
export const analyticsService = new AnalyticsService();
export const db = DatabaseClient.getInstance();