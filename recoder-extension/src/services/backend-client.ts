/**
 * Backend Client Service for Recoder VS Code Extension
 * Connects extension to the recoder.xyz backend for unified user management,
 * quota tracking, and cross-platform synchronization
 */

import * as vscode from 'vscode';

export interface UserSession {
  userId: string;
  token: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  quotas: {
    totalRequests: number;
    usedRequests: number;
    resetDate: string;
  };
  platforms: {
    cli: boolean;
    web: boolean;
    extension: boolean;
    router: boolean;
  };
}

export interface RequestUsage {
  platform: 'cli' | 'web' | 'extension' | 'router';
  command: string;
  tokens: number;
  model: string;
  timestamp: Date;
}

export class ExtensionBackendClient {
  private baseUrl: string;
  private currentSession: UserSession | null = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.baseUrl = vscode.workspace.getConfiguration('recoder').get('backendUrl') || 'http://localhost:3001';
    
    // Load existing session from extension storage
    this.loadSession();
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'recoder-extension/1.0.0'
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.warn('Backend not available, running in offline mode');
      return false;
    }
  }

  /**
   * Load session from VS Code extension storage
   */
  private async loadSession(): Promise<void> {
    try {
      const sessionData = await this.context.globalState.get<UserSession>('recoder-session');
      if (sessionData) {
        this.currentSession = sessionData;
        console.log('✅ User session loaded from extension storage');
      }
    } catch (error) {
      console.warn('Could not load session from extension storage');
    }
  }

  /**
   * Save session to VS Code extension storage
   */
  private async saveSession(): Promise<void> {
    try {
      if (this.currentSession) {
        await this.context.globalState.update('recoder-session', this.currentSession);
      } else {
        await this.context.globalState.update('recoder-session', undefined);
      }
    } catch (error) {
      console.error('Could not save session to extension storage:', error);
    }
  }

  /**
   * Authenticate user with email/password or token
   */
  async authenticate(credentials: { email: string; password: string } | { token: string }): Promise<UserSession> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'recoder-extension/1.0.0'
        },
        body: JSON.stringify(credentials),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Authentication failed`);
      }

      const data = await response.json();
      this.currentSession = data.user;
      await this.saveSession();
      
      if (this.currentSession) {
        console.log(`✅ Authenticated as ${this.currentSession.email}`);
        return this.currentSession;
      } else {
        throw new Error('Authentication failed: No user data received');
      }
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Register new user
   */
  async register(userData: { email: string; password: string; name: string }): Promise<UserSession> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'recoder-extension/1.0.0'
        },
        body: JSON.stringify(userData),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Registration failed`);
      }

      const data = await response.json();
      this.currentSession = data.user;
      await this.saveSession();
      
      if (this.currentSession) {
        console.log(`✅ Registered and authenticated as ${this.currentSession.email}`);
        return this.currentSession;
      } else {
        throw new Error('Registration failed: No user data received');
      }
    } catch (error: any) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Get current user session
   */
  getCurrentSession(): UserSession | null {
    return this.currentSession;
  }

  /**
   * Check user quota before making request
   */
  async checkQuota(estimatedTokens: number = 1000): Promise<boolean> {
    if (!this.currentSession) {
      console.warn('No user session - requests may be limited');
      return true; // Allow offline usage
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/user/quota`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-extension/1.0.0'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        console.warn('Could not check quota, proceeding with request');
        return true;
      }

      const quota = await response.json();
      this.currentSession.quotas = quota;
      await this.saveSession();

      const available = quota.totalRequests - quota.usedRequests;
      
      if (available <= 0) {
        console.error(`❌ Quota exceeded. Used ${quota.usedRequests}/${quota.totalRequests} requests`);
        vscode.window.showErrorMessage(
          `Request quota exceeded. Used ${quota.usedRequests}/${quota.totalRequests} requests. ` +
          `Quota resets on ${new Date(quota.resetDate).toLocaleDateString()}.`
        );
        return false;
      }

      if (available < 10) {
        console.warn(`⚠️ Low quota: ${available} requests remaining`);
        vscode.window.showWarningMessage(`Low quota: ${available} requests remaining`);
      }

      return true;
    } catch (error: any) {
      console.warn('Could not check quota, proceeding with request');
      return true;
    }
  }

  /**
   * Track request usage across platforms
   */
  async trackUsage(usage: RequestUsage): Promise<void> {
    if (!this.currentSession) {
      return; // Skip tracking if no session
    }

    try {
      await fetch(`${this.baseUrl}/api/user/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-extension/1.0.0'
        },
        body: JSON.stringify({
          userId: this.currentSession.userId,
          platform: usage.platform,
          command: usage.command,
          tokens: usage.tokens,
          model: usage.model,
          timestamp: usage.timestamp
        }),
        signal: AbortSignal.timeout(15000)
      });

      // Update local quota
      if (this.currentSession.quotas) {
        this.currentSession.quotas.usedRequests += 1;
        await this.saveSession();
      }

      console.debug(`📊 Tracked usage: ${usage.platform} - ${usage.command}`);
    } catch (error) {
      console.warn('Could not track usage to backend');
    }
  }

  /**
   * Sync session across platforms
   */
  async syncSession(): Promise<UserSession | null> {
    if (!this.currentSession) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/user/session`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-extension/1.0.0'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        console.warn('Could not sync session');
        return this.currentSession;
      }

      const data = await response.json();
      this.currentSession = { ...this.currentSession, ...data };
      await this.saveSession();
      
      console.info('🔄 Session synced across platforms');
      return this.currentSession;
    } catch (error) {
      console.warn('Could not sync session');
      return this.currentSession;
    }
  }

  /**
   * Update platform status (mark extension as active)
   */
  async updatePlatformStatus(platform: 'cli' | 'web' | 'extension' | 'router', active: boolean): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      await fetch(`${this.baseUrl}/api/user/platforms`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-extension/1.0.0'
        },
        body: JSON.stringify({
          platform,
          active,
          lastUsed: new Date()
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (this.currentSession.platforms) {
        this.currentSession.platforms[platform] = active;
        await this.saveSession();
      }
    } catch (error) {
      console.warn('Could not update platform status');
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.currentSession) {
        await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.currentSession.token}`,
            'User-Agent': 'recoder-extension/1.0.0'
          },
          signal: AbortSignal.timeout(15000)
        });
      }
    } catch (error) {
      // Ignore logout errors
    } finally {
      this.currentSession = null;
      await this.saveSession();
      console.info('👋 Logged out successfully');
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get platform connection status
   */
  getPlatformStatus(): { cli: boolean; web: boolean; extension: boolean; router: boolean } {
    return this.currentSession?.platforms || {
      cli: false,
      web: false,
      extension: true,
      router: false
    };
  }

  /**
   * Show quota status in VS Code status bar
   */
  updateStatusBar(statusBarItem: vscode.StatusBarItem): void {
    if (!this.currentSession) {
      statusBarItem.text = '$(person) Not logged in';
      statusBarItem.tooltip = 'Click to login to recoder.xyz';
      statusBarItem.backgroundColor = undefined;
      return;
    }

    const { usedRequests, totalRequests } = this.currentSession.quotas;
    const percentage = Math.round((usedRequests / totalRequests) * 100);
    
    let icon = '$(check)';
    let backgroundColor: vscode.ThemeColor | undefined;
    
    if (percentage >= 90) {
      icon = '$(warning)';
      backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (percentage >= 70) {
      icon = '$(info)';
      backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    statusBarItem.text = `${icon} ${usedRequests}/${totalRequests}`;
    statusBarItem.tooltip = `recoder.xyz - ${this.currentSession.email}\n` +
      `Plan: ${this.currentSession.plan.toUpperCase()}\n` +
      `Quota: ${usedRequests}/${totalRequests} requests (${percentage}%)\n` +
      `Resets: ${new Date(this.currentSession.quotas.resetDate).toLocaleDateString()}\n\n` +
      `Platforms: ${Object.entries(this.currentSession.platforms).map(([p, active]) => `${p}:${active ? '✅' : '❌'}`).join(', ')}`;
    statusBarItem.backgroundColor = backgroundColor;
  }

  /**
   * Get AI completion with usage tracking and quota checking
   */
  async getCompletion(prompt: string, model: string = 'default', command: string = 'completion'): Promise<string> {
    // Check quota before making request
    const hasQuota = await this.checkQuota();
    if (!hasQuota) {
      throw new Error('Request quota exceeded. Please upgrade your plan or wait for reset.');
    }

    try {
      // This would integrate with your existing AI completion logic
      const response = await fetch(`${this.baseUrl}/api/ai/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.currentSession?.token ? `Bearer ${this.currentSession.token}` : '',
          'User-Agent': 'recoder-extension/1.0.0'
        },
        body: JSON.stringify({
          prompt,
          model,
          userId: this.currentSession?.userId
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: AI completion failed`);
      }

      const data = await response.json();

      // Track usage
      if (this.currentSession) {
        await this.trackUsage({
          platform: 'extension',
          command,
          tokens: data.tokensUsed || 1000,
          model,
          timestamp: new Date()
        });
      }

      return data.completion;
    } catch (error: any) {
      throw new Error(`AI completion failed: ${error.message}`);
    }
  }
}

// Export for use in extension
export default ExtensionBackendClient;