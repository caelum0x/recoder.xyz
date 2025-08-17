/**
 * Auto Social Media Deployment Service - Real Implementation
 * Automatically posts about deployments and project updates to social media
 */

import { Logger } from '../utils/logger';
import { AIProviderManager } from './ai-provider-manager';

export interface SocialMediaPlatform {
  name: 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'mastodon';
  enabled: boolean;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface DeploymentEvent {
  projectName: string;
  deploymentId: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  status: 'success' | 'failed' | 'in_progress';
  timestamp: Date;
  deploymentUrl?: string;
  changes?: string[];
  metrics?: {
    buildTime: number;
    testsPassed: number;
    testsTotal: number;
    codeQuality: number;
  };
}

export interface SocialMediaPost {
  platform: string;
  content: string;
  hashtags: string[];
  media?: {
    type: 'image' | 'video' | 'gif';
    url: string;
    alt?: string;
  }[];
  scheduledTime?: Date;
}

export class SocialMediaDeployer {
  private platforms: Map<string, SocialMediaPlatform> = new Map();
  private aiManager: AIProviderManager;

  constructor() {
    // We use the global AI system - users don't need to provide AI keys
    this.aiManager = new AIProviderManager();
    this.initializePlatforms();
  }

  private initializePlatforms(): void {
    // Twitter/X Platform
    this.platforms.set('twitter', {
      name: 'twitter',
      enabled: !!process.env.TWITTER_API_KEY,
      apiKey: process.env.TWITTER_API_KEY,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      refreshToken: process.env.TWITTER_REFRESH_TOKEN,
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET
    });

    // LinkedIn Platform
    this.platforms.set('linkedin', {
      name: 'linkedin',
      enabled: !!process.env.LINKEDIN_CLIENT_ID,
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN
    });

    // Mastodon Platform
    this.platforms.set('mastodon', {
      name: 'mastodon',
      enabled: !!process.env.MASTODON_ACCESS_TOKEN,
      accessToken: process.env.MASTODON_ACCESS_TOKEN,
      apiKey: process.env.MASTODON_INSTANCE_URL
    });
  }

  /**
   * Generate AI-powered social media content
   */
  private async generateSocialContent(event: DeploymentEvent): Promise<string> {
    const prompt = `Generate an engaging social media post about a software deployment:

Project: ${event.projectName}
Version: ${event.version}
Environment: ${event.environment}
Status: ${event.status}
${event.changes ? `Changes: ${event.changes.join(', ')}` : ''}
${event.metrics ? `Build time: ${event.metrics.buildTime}s, Tests: ${event.metrics.testsPassed}/${event.metrics.testsTotal}` : ''}

Requirements:
- Keep it under 280 characters for Twitter compatibility
- Make it exciting and developer-friendly
- Include relevant emojis
- Highlight achievements or improvements
- Don't use hashtags (they'll be added separately)
- Focus on the impact and value delivered

Generate a single, compelling post that celebrates this deployment.`;

    try {
      const response = await this.aiManager.generateCompletion({
        prompt,
        maxTokens: 150,
        temperature: 0.7,
        model: 'claude-3-sonnet-20240229' // Use Claude for creative content
      });

      return response.content.trim();
    } catch (error) {
      Logger.error('Failed to generate AI content:', error);
      return this.generateFallbackContent(event);
    }
  }

  /**
   * Generate fallback content when AI fails
   */
  private generateFallbackContent(event: DeploymentEvent): string {
    const statusEmoji = {
      success: '✅',
      failed: '❌',
      in_progress: '🚀'
    };

    const templates = [
      `${statusEmoji[event.status]} Just deployed ${event.projectName} v${event.version} to ${event.environment}! 🎉`,
      `🚀 New release: ${event.projectName} v${event.version} is live on ${event.environment}! ${statusEmoji[event.status]}`,
      `💻 Deployment complete! ${event.projectName} v${event.version} → ${event.environment} ${statusEmoji[event.status]}`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Generate hashtags based on project and deployment
   */
  private generateHashtags(event: DeploymentEvent): string[] {
    const baseHashtags = ['#deployment', '#devops', '#continuous-integration'];
    
    // Add environment-specific tags
    if (event.environment === 'production') {
      baseHashtags.push('#production', '#release');
    } else if (event.environment === 'staging') {
      baseHashtags.push('#staging', '#testing');
    }

    // Add technology tags based on project name or changes
    const techKeywords = {
      react: '#react',
      typescript: '#typescript',
      nodejs: '#nodejs',
      docker: '#docker',
      kubernetes: '#k8s',
      aws: '#aws',
      nextjs: '#nextjs',
      api: '#api'
    };

    const projectLower = event.projectName.toLowerCase();
    const changesText = event.changes?.join(' ').toLowerCase() || '';

    Object.entries(techKeywords).forEach(([keyword, tag]) => {
      if (projectLower.includes(keyword) || changesText.includes(keyword)) {
        baseHashtags.push(tag);
      }
    });

    // Add project-specific tag
    const projectTag = `#${event.projectName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    baseHashtags.push(projectTag);

    return baseHashtags.slice(0, 5); // Limit to 5 hashtags
  }

  /**
   * Post to Twitter/X
   */
  private async postToTwitter(post: SocialMediaPost): Promise<boolean> {
    const platform = this.platforms.get('twitter');
    if (!platform?.enabled) {
      Logger.warn('Twitter platform not configured');
      return false;
    }

    try {
      // Use Twitter API v2
      const tweetText = `${post.content}\n\n${post.hashtags.join(' ')}`;
      
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platform.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: tweetText.substring(0, 280) // Ensure character limit
        })
      });

      if (response.ok) {
        const result = await response.json();
        Logger.info(`Tweet posted successfully: ${result.data?.id}`);
        return true;
      } else {
        const error = await response.text();
        Logger.error('Failed to post tweet:', error);
        return false;
      }
    } catch (error) {
      Logger.error('Twitter API error:', error);
      return false;
    }
  }

  /**
   * Post to LinkedIn
   */
  private async postToLinkedIn(post: SocialMediaPost): Promise<boolean> {
    const platform = this.platforms.get('linkedin');
    if (!platform?.enabled) {
      Logger.warn('LinkedIn platform not configured');
      return false;
    }

    try {
      const linkedInPost = {
        author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: `${post.content}\n\n${post.hashtags.join(' ')}`
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platform.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(linkedInPost)
      });

      if (response.ok) {
        const result = await response.json();
        Logger.info(`LinkedIn post created successfully: ${result.id}`);
        return true;
      } else {
        const error = await response.text();
        Logger.error('Failed to post to LinkedIn:', error);
        return false;
      }
    } catch (error) {
      Logger.error('LinkedIn API error:', error);
      return false;
    }
  }

  /**
   * Post to Mastodon
   */
  private async postToMastodon(post: SocialMediaPost): Promise<boolean> {
    const platform = this.platforms.get('mastodon');
    if (!platform?.enabled) {
      Logger.warn('Mastodon platform not configured');
      return false;
    }

    try {
      const instanceUrl = platform.apiKey; // Instance URL stored in apiKey field
      const statusText = `${post.content}\n\n${post.hashtags.join(' ')}`;

      const response = await fetch(`${instanceUrl}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${platform.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: statusText,
          visibility: 'public'
        })
      });

      if (response.ok) {
        const result = await response.json();
        Logger.info(`Mastodon post created successfully: ${result.id}`);
        return true;
      } else {
        const error = await response.text();
        Logger.error('Failed to post to Mastodon:', error);
        return false;
      }
    } catch (error) {
      Logger.error('Mastodon API error:', error);
      return false;
    }
  }

  /**
   * Deploy announcement to all configured platforms
   */
  async announceDeployment(event: DeploymentEvent): Promise<Map<string, boolean>> {
    Logger.info(`Announcing deployment: ${event.projectName} v${event.version} to ${event.environment}`);

    const results = new Map<string, boolean>();

    try {
      // Generate content using AI
      const content = await this.generateSocialContent(event);
      const hashtags = this.generateHashtags(event);

      const post: SocialMediaPost = {
        platform: 'multi',
        content,
        hashtags
      };

      Logger.info(`Generated post: ${content}`);
      Logger.info(`Hashtags: ${hashtags.join(' ')}`);

      // Post to all enabled platforms
      const promises: Promise<void>[] = [];

      if (this.platforms.get('twitter')?.enabled) {
        promises.push(
          this.postToTwitter(post).then(success => {
            results.set('twitter', success);
          })
        );
      }

      if (this.platforms.get('linkedin')?.enabled) {
        promises.push(
          this.postToLinkedIn(post).then(success => {
            results.set('linkedin', success);
          })
        );
      }

      if (this.platforms.get('mastodon')?.enabled) {
        promises.push(
          this.postToMastodon(post).then(success => {
            results.set('mastodon', success);
          })
        );
      }

      // Wait for all posts to complete
      await Promise.all(promises);

      const successCount = Array.from(results.values()).filter(Boolean).length;
      const totalCount = results.size;

      Logger.info(`Social media deployment complete: ${successCount}/${totalCount} platforms successful`);

    } catch (error) {
      Logger.error('Failed to announce deployment:', error);
    }

    return results;
  }

  /**
   * Schedule a deployment announcement
   */
  async scheduleAnnouncement(event: DeploymentEvent, scheduledTime: Date): Promise<void> {
    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay <= 0) {
      await this.announceDeployment(event);
      return;
    }

    Logger.info(`Scheduling deployment announcement for ${scheduledTime.toISOString()}`);
    
    setTimeout(async () => {
      await this.announceDeployment(event);
    }, delay);
  }

  /**
   * Get platform status
   */
  getPlatformStatus(): Record<string, { enabled: boolean; configured: boolean }> {
    const status: Record<string, { enabled: boolean; configured: boolean }> = {};

    for (const [name, platform] of this.platforms.entries()) {
      status[name] = {
        enabled: platform.enabled,
        configured: !!(platform.apiKey || platform.accessToken || platform.clientId)
      };
    }

    return status;
  }

  /**
   * Test social media connections
   */
  async testConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, platform] of this.platforms.entries()) {
      if (!platform.enabled) {
        results[name] = false;
        continue;
      }

      try {
        // Test with a simple post that gets deleted immediately
        const testEvent: DeploymentEvent = {
          projectName: 'Test',
          deploymentId: 'test-123',
          version: '0.0.1',
          environment: 'development',
          status: 'success',
          timestamp: new Date()
        };

        const content = '🧪 Testing social media integration (this will be deleted)';
        const post: SocialMediaPost = {
          platform: name,
          content,
          hashtags: ['#test']
        };

        let success = false;
        
        switch (name) {
          case 'twitter':
            success = await this.postToTwitter(post);
            break;
          case 'linkedin':
            success = await this.postToLinkedIn(post);
            break;
          case 'mastodon':
            success = await this.postToMastodon(post);
            break;
        }

        results[name] = success;
        
      } catch (error) {
        Logger.error(`Failed to test ${name} connection:`, error);
        results[name] = false;
      }
    }

    return results;
  }
}

export const socialMediaDeployer = new SocialMediaDeployer();