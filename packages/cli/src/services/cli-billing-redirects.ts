/**
 * CLI Billing Redirects Service
 * Handles redirecting users from CLI to web for billing, upgrades, and account management
 * Critical for monetization - when users hit limits, they get seamless upgrade flow
 */
import { Logger } from '@recoder/shared';
import { webCLIAuthBridge } from './web-cli-auth-bridge';
import chalk from 'chalk';
import open from 'open';

export interface UpgradeContext {
  userId: string;
  currentPlan: string;
  reason: 'quota_exceeded' | 'feature_limited' | 'model_restricted' | 'manual_upgrade';
  currentUsage?: number;
  quotaLimit?: number;
  blockedFeature?: string;
  recommendedPlan?: string;
}

export interface BillingRedirectResult {
  redirectUrl: string;
  userMessage: string;
  followUpAction: 'wait_for_upgrade' | 'retry_after_delay' | 'contact_support';
  estimatedUpgradeTime: number; // minutes
}

export class CLIBillingRedirects {
  private logger = new Logger();
  private baseWebUrl = process.env.RECODER_WEB_URL || 'https://recoder.xyz';

  /**
   * Handle quota exceeded scenario - redirect to upgrade
   */
  async handleQuotaExceeded(context: UpgradeContext): Promise<BillingRedirectResult> {
    console.log(chalk.red('\n🚫 Monthly Quota Exceeded'));
    console.log(chalk.yellow(`You've used ${context.currentUsage}/${context.quotaLimit} requests this month`));
    
    // Show upgrade options before redirect
    await this.showUpgradeOptions(context);
    
    // Create upgrade URL with context
    const redirectUrl = this.createUpgradeUrl(context);
    
    // Ask user if they want to upgrade now
    const shouldRedirect = await this.confirmUpgrade(context.recommendedPlan || 'pro');
    
    if (shouldRedirect) {
      console.log(chalk.blue('\n🌐 Opening recoder.xyz billing page...'));
      
      try {
        await open(redirectUrl);
        console.log(chalk.green('✅ Opened billing page in your browser'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Failed to open browser automatically'));
        console.log(chalk.blue(`Please visit: ${redirectUrl}`));
      }
      
      return {
        redirectUrl,
        userMessage: 'Complete your upgrade in the browser, then try your request again',
        followUpAction: 'wait_for_upgrade',
        estimatedUpgradeTime: 2
      };
    } else {
      return {
        redirectUrl,
        userMessage: 'Upgrade when ready - your quota resets next month',
        followUpAction: 'retry_after_delay',
        estimatedUpgradeTime: 0
      };
    }
  }

  /**
   * Handle feature limitation - redirect to upgrade for advanced features
   */
  async handleFeatureLimited(context: UpgradeContext): Promise<BillingRedirectResult> {
    console.log(chalk.yellow(`\n🔒 ${context.blockedFeature} requires a paid plan`));
    
    // Show feature comparison
    await this.showFeatureComparison(context.currentPlan, context.recommendedPlan || 'pro');
    
    const redirectUrl = this.createFeatureUpgradeUrl(context);
    
    const shouldRedirect = await this.confirmFeatureUpgrade(context.blockedFeature!, context.recommendedPlan || 'pro');
    
    if (shouldRedirect) {
      console.log(chalk.blue('\n🌐 Opening feature upgrade page...'));
      
      try {
        await open(redirectUrl);
        console.log(chalk.green('✅ Opened upgrade page in your browser'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Failed to open browser automatically'));
        console.log(chalk.blue(`Please visit: ${redirectUrl}`));
      }
      
      return {
        redirectUrl,
        userMessage: `Upgrade to unlock ${context.blockedFeature} and other premium features`,
        followUpAction: 'wait_for_upgrade',
        estimatedUpgradeTime: 3
      };
    } else {
      return {
        redirectUrl,
        userMessage: `${context.blockedFeature} will be available after upgrading`,
        followUpAction: 'contact_support',
        estimatedUpgradeTime: 0
      };
    }
  }

  /**
   * Handle model restriction - redirect to upgrade for premium models
   */
  async handleModelRestricted(context: UpgradeContext): Promise<BillingRedirectResult> {
    console.log(chalk.yellow('\n🤖 Premium AI models require subscription'));
    console.log(chalk.gray('Free tier includes: GPT-3.5-turbo, Claude Haiku, Gemini Flash'));
    console.log(chalk.blue('Premium models: GPT-4o, Claude Sonnet, Gemini Pro, and more'));
    
    const redirectUrl = this.createModelUpgradeUrl(context);
    
    const shouldRedirect = await this.confirmModelUpgrade(context.recommendedPlan || 'pro');
    
    if (shouldRedirect) {
      console.log(chalk.blue('\n🌐 Opening premium models page...'));
      
      try {
        await open(redirectUrl);
        console.log(chalk.green('✅ Opened premium models page in your browser'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Failed to open browser automatically'));
        console.log(chalk.blue(`Please visit: ${redirectUrl}`));
      }
      
      return {
        redirectUrl,
        userMessage: 'Upgrade to access all premium AI models and advanced features',
        followUpAction: 'wait_for_upgrade',
        estimatedUpgradeTime: 2
      };
    } else {
      return {
        redirectUrl,
        userMessage: 'Premium models will be available after upgrading',
        followUpAction: 'retry_after_delay',
        estimatedUpgradeTime: 0
      };
    }
  }

  /**
   * Create billing management URL
   */
  createBillingManagementUrl(userId: string): string {
    const params = new URLSearchParams({
      source: 'cli',
      user_id: userId,
      action: 'manage_billing',
      return_to: 'cli_success'
    });

    return `${this.baseWebUrl}/billing?${params.toString()}`;
  }

  /**
   * Create account management URL
   */
  createAccountManagementUrl(userId: string): string {
    const params = new URLSearchParams({
      source: 'cli',
      user_id: userId,
      return_to: 'cli_account'
    });

    return `${this.baseWebUrl}/account?${params.toString()}`;
  }

  /**
   * Wait for user upgrade completion
   */
  async waitForUpgrade(userId: string, maxWaitMinutes: number = 10): Promise<{
    upgraded: boolean;
    newPlan?: string;
    timeWaited: number;
  }> {
    console.log(chalk.blue(`\n⏳ Waiting for upgrade completion (up to ${maxWaitMinutes} minutes)...`));
    console.log(chalk.gray('Complete your upgrade in the browser, then we\'ll continue automatically'));
    
    const startTime = Date.now();
    const maxWaitTime = maxWaitMinutes * 60 * 1000;
    const pollInterval = 10000; // Check every 10 seconds
    
    return new Promise((resolve) => {
      const pollForUpgrade = async () => {
        try {
          // Check if user has upgraded (this would call the billing service)
          const currentBilling = await this.checkUserBillingStatus(userId);
          
          if (currentBilling.upgraded) {
            console.log(chalk.green(`\n✅ Upgrade detected! Welcome to ${currentBilling.plan}!`));
            resolve({
              upgraded: true,
              newPlan: currentBilling.plan,
              timeWaited: Math.round((Date.now() - startTime) / 1000)
            });
            return;
          }
          
          // Check timeout
          if (Date.now() - startTime > maxWaitTime) {
            console.log(chalk.yellow('\n⏰ Upgrade detection timed out'));
            console.log(chalk.gray('No worries - your upgrade may take a few minutes to process'));
            resolve({
              upgraded: false,
              timeWaited: maxWaitMinutes * 60
            });
            return;
          }
          
          // Continue polling
          setTimeout(pollForUpgrade, pollInterval);
          
        } catch (error) {
          this.logger.warn('Error polling for upgrade', error);
          setTimeout(pollForUpgrade, pollInterval);
        }
      };
      
      // Start polling
      pollForUpgrade();
    });
  }

  /**
   * Private helper methods
   */
  private createUpgradeUrl(context: UpgradeContext): string {
    const params = new URLSearchParams({
      source: 'cli',
      user_id: context.userId,
      current_plan: context.currentPlan,
      reason: context.reason,
      usage: context.currentUsage?.toString() || '',
      limit: context.quotaLimit?.toString() || '',
      recommended: context.recommendedPlan || 'pro',
      return_to: 'cli_upgraded'
    });

    return `${this.baseWebUrl}/billing/upgrade?${params.toString()}`;
  }

  private createFeatureUpgradeUrl(context: UpgradeContext): string {
    const params = new URLSearchParams({
      source: 'cli',
      user_id: context.userId,
      feature: context.blockedFeature || '',
      current_plan: context.currentPlan,
      recommended: context.recommendedPlan || 'pro',
      return_to: 'cli_feature_unlocked'
    });

    return `${this.baseWebUrl}/billing/features?${params.toString()}`;
  }

  private createModelUpgradeUrl(context: UpgradeContext): string {
    const params = new URLSearchParams({
      source: 'cli',
      user_id: context.userId,
      current_plan: context.currentPlan,
      recommended: context.recommendedPlan || 'pro',
      focus: 'ai_models',
      return_to: 'cli_models_unlocked'
    });

    return `${this.baseWebUrl}/billing/models?${params.toString()}`;
  }

  private async showUpgradeOptions(context: UpgradeContext): Promise<void> {
    console.log(chalk.cyan('\n📊 Subscription Comparison:'));
    
    const plans = {
      free: { requests: 500, price: 'Free', models: 'Basic' },
      pro: { requests: 5000, price: '$20/month', models: 'All Premium' },
      team: { requests: 15000, price: '$50/month', models: 'All + Priority' },
      enterprise: { requests: 'Unlimited', price: '$200/month', models: 'All + Custom' }
    };

    Object.entries(plans).forEach(([plan, details]) => {
      const isCurrent = plan === context.currentPlan;
      const isRecommended = plan === context.recommendedPlan;
      
      const prefix = isCurrent ? '👉' : isRecommended ? '⭐' : '  ';
      const suffix = isCurrent ? ' (current)' : isRecommended ? ' (recommended)' : '';
      
      console.log(chalk.white(`${prefix} ${plan.toUpperCase()}: ${details.requests} requests, ${details.price}, ${details.models} models${suffix}`));
    });
  }

  private async showFeatureComparison(currentPlan: string, recommendedPlan: string): Promise<void> {
    console.log(chalk.cyan('\n🚀 Feature Comparison:'));
    
    const features = {
      'Code Reviews': { free: '❌', pro: '✅', team: '✅', enterprise: '✅' },
      'Security Scanning': { free: '❌', pro: '✅', team: '✅', enterprise: '✅' },
      'Team Collaboration': { free: '❌', pro: '❌', team: '✅', enterprise: '✅' },
      'Priority Support': { free: '❌', pro: '❌', team: '✅', enterprise: '✅' },
      'Custom Models': { free: '❌', pro: '❌', team: '❌', enterprise: '✅' }
    };

    console.log(chalk.white(`Feature                 ${currentPlan.padEnd(12)} ${recommendedPlan.padEnd(12)}`));
    console.log(chalk.gray('─'.repeat(50)));
    
    Object.entries(features).forEach(([feature, plans]: [string, any]) => {
      const currentStatus = plans[currentPlan as keyof typeof plans] || '❌';
      const recommendedStatus = plans[recommendedPlan as keyof typeof plans] || '❌';
      
      console.log(chalk.white(`${feature.padEnd(20)} ${currentStatus.padEnd(12)} ${recommendedStatus.padEnd(12)}`));
    });
  }

  private async confirmUpgrade(recommendedPlan: string): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan(`\n🤔 Upgrade to ${recommendedPlan.toUpperCase()} now? (y/N): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  private async confirmFeatureUpgrade(feature: string, recommendedPlan: string): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan(`\n🤔 Upgrade to unlock ${feature}? (y/N): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  private async confirmModelUpgrade(recommendedPlan: string): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan(`\n🤔 Upgrade to access premium AI models? (y/N): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  private async checkUserBillingStatus(userId: string): Promise<{
    upgraded: boolean;
    plan: string;
  }> {
    try {
      // This would integrate with the billing service to check current status
      // For now, return a mock response
      return {
        upgraded: false,
        plan: 'free'
      };
    } catch (error) {
      this.logger.error('Failed to check billing status', error);
      return {
        upgraded: false,
        plan: 'unknown'
      };
    }
  }
}

export const cliBillingRedirects = new CLIBillingRedirects();