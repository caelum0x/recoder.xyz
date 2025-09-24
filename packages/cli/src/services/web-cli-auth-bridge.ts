/**
 * Web-CLI Authentication Bridge
 * Handles authentication flows between recoder.xyz website and CLI
 * Enables seamless user experience across platforms
 */
import { Logger } from 'recoder-shared';
import { backendClient } from './backend-client';
import { unifiedSessionManager } from './unified-session-manager';
import open from 'open';
import crypto from 'crypto';

export interface WebAuthSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface CLIToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: string;
  email: string;
  plan: string;
  scopes: string[];
}

export interface AuthRedirectData {
  returnUrl: string;
  state: string;
  cliVersion: string;
  platform: string;
  deviceId: string;
}

export class WebCLIAuthBridge {
  private logger = new Logger();
  private pendingAuth: Map<string, { resolve: Function; reject: Function; timestamp: number }> = new Map();
  private baseWebUrl = process.env.RECODER_WEB_URL || 'http://localhost:3020';

  /**
   * Initiate web authentication flow
   * Redirects user to recoder.xyz for authentication
   */
  async initiateWebAuth(): Promise<{
    authUrl: string;
    deviceCode: string;
    userCode: string;
    instructions: string[];
  }> {
    try {
      // Generate device flow session
      const webSession = await this.startWebAuthSession();
      
      // Create auth URL with CLI context
      const authUrl = `${this.baseWebUrl}/auth/cli?` + new URLSearchParams({
        device_code: webSession.deviceCode,
        user_code: webSession.userCode,
        return_to: 'cli',
        platform: 'cli',
        version: this.getCLIVersion()
      }).toString();

      const instructions = [
        '🔐 CLI Authentication Required',
        '',
        '1. We\'ll open your browser to recoder.xyz',
        '2. Sign in or create your account',
        '3. Authorize the CLI access',
        '4. Return to this terminal',
        '',
        `🔑 Verification Code: ${webSession.userCode}`,
        `🌐 URL: ${authUrl}`,
        '',
        '⏰ This code expires in 15 minutes'
      ];

      return {
        authUrl,
        deviceCode: webSession.deviceCode,
        userCode: webSession.userCode,
        instructions
      };

    } catch (error: any) {
      this.logger.error('Failed to initiate web auth', error);
      throw new Error(`Authentication initiation failed: ${error.message}`);
    }
  }

  /**
   * Open browser for authentication
   */
  async openBrowserAuth(authUrl: string): Promise<void> {
    try {
      await open(authUrl);
      this.logger.info('Opened browser for authentication');
    } catch (error) {
      this.logger.warn('Failed to open browser automatically', error);
      // Non-fatal - user can manually visit URL
    }
  }

  /**
   * Poll for authentication completion
   */
  async pollForAuthCompletion(deviceCode: string, intervalSeconds: number = 3): Promise<CLIToken> {
    return new Promise((resolve, reject) => {
      // Store promise handlers for potential cleanup
      this.pendingAuth.set(deviceCode, { 
        resolve, 
        reject, 
        timestamp: Date.now() 
      });

      const maxAttempts = 300; // 15 minutes with 3-second intervals
      let attempts = 0;

      const pollInterval = setInterval(async () => {
        attempts++;

        try {
          const result = await this.checkAuthStatus(deviceCode);

          if (result.status === 'completed') {
            clearInterval(pollInterval);
            this.pendingAuth.delete(deviceCode);
            resolve(result.token);
            return;
          }

          if (result.status === 'denied' || result.status === 'expired') {
            clearInterval(pollInterval);
            this.pendingAuth.delete(deviceCode);
            reject(new Error(`Authentication ${result.status}`));
            return;
          }

          // Continue polling if status is 'pending'
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            this.pendingAuth.delete(deviceCode);
            reject(new Error('Authentication timeout - please try again'));
          }

        } catch (error: any) {
          clearInterval(pollInterval);
          this.pendingAuth.delete(deviceCode);
          reject(error);
        }
      }, intervalSeconds * 1000);
    });
  }

  /**
   * Handle web callback with authorization code
   */
  async handleWebCallback(authorizationCode: string, state: string): Promise<CLIToken> {
    try {
      // Exchange authorization code for tokens
      const response = await (backendClient as any).client.post('/api/auth/cli/token', {
        code: authorizationCode,
        state: state,
        grant_type: 'authorization_code'
      });

      const tokenData = response.data;
      
      const cliToken: CLIToken = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        userId: tokenData.user_id,
        email: tokenData.email,
        plan: tokenData.plan,
        scopes: tokenData.scopes || ['cli:basic']
      };

      // Store token locally
      await this.storeCLIToken(cliToken);

      // Initialize unified session with web auth data
      await unifiedSessionManager.initializeFromWebAuth(cliToken);
      
      this.logger.info('Web authentication completed successfully');
      return cliToken;

    } catch (error: any) {
      this.logger.error('Web callback handling failed', error);
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  /**
   * Generate device authentication session for web
   */
  private async startWebAuthSession(): Promise<WebAuthSession> {
    try {
      const deviceId = this.generateDeviceId();
      const userCode = this.generateUserCode();
      const deviceCode = this.generateDeviceCode();

      // Register device session with backend
      await (backendClient as any).client.post('/api/auth/device/register', {
        device_code: deviceCode,
        user_code: userCode,
        device_id: deviceId,
        client_type: 'cli',
        expires_in: 900 // 15 minutes
      });

      const baseUrl = this.baseWebUrl;
      const verificationUri = `${baseUrl}/auth/device`;
      const verificationUriComplete = `${verificationUri}?user_code=${userCode}`;

      return {
        deviceCode,
        userCode,
        verificationUri,
        verificationUriComplete,
        expiresIn: 900,
        interval: 3
      };

    } catch (error: any) {
      this.logger.error('Failed to start web auth session', error);
      throw error;
    }
  }

  /**
   * Check authentication status with backend
   */
  private async checkAuthStatus(deviceCode: string): Promise<{
    status: 'pending' | 'completed' | 'denied' | 'expired';
    token?: CLIToken;
  }> {
    try {
      const response = await (backendClient as any).client.get(`/api/auth/device/status/${deviceCode}`);
      const data = response.data;

      if (data.status === 'completed') {
        const cliToken = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(data.expires_at),
          userId: data.user_id,
          email: data.email,
          plan: data.plan,
          scopes: data.scopes
        };

        // Initialize unified session
        await unifiedSessionManager.initializeFromWebAuth(cliToken);

        return {
          status: 'completed',
          token: cliToken
        };
      }

      return { status: data.status };

    } catch (error: any) {
      if (error.response?.status === 404) {
        return { status: 'expired' };
      }
      throw error;
    }
  }

  /**
   * Generate secure device ID
   */
  private generateDeviceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate human-readable user code (e.g., "ABC-123")
   */
  private generateUserCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No confusing chars
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '-';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate secure device code for backend
   */
  private generateDeviceCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get CLI version for context
   */
  private getCLIVersion(): string {
    try {
      const packageJson = require('../../../package.json');
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  /**
   * Store CLI token securely
   */
  private async storeCLIToken(token: CLIToken): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const tokenFile = path.join(os.homedir(), '.recoder', 'cli-token.json');
      const tokenDir = path.dirname(tokenFile);

      await fs.mkdir(tokenDir, { recursive: true });
      await fs.writeFile(tokenFile, JSON.stringify(token, null, 2), { mode: 0o600 });

      this.logger.info('CLI token stored securely');
    } catch (error: any) {
      this.logger.error('Failed to store CLI token', error);
      // Non-fatal - token will be in memory
    }
  }

  /**
   * Load stored CLI token
   */
  async loadStoredToken(): Promise<CLIToken | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const tokenFile = path.join(os.homedir(), '.recoder', 'cli-token.json');
      const tokenData = await fs.readFile(tokenFile, 'utf8');
      const token: CLIToken = JSON.parse(tokenData);

      // Check if token is expired
      if (new Date() >= new Date(token.expiresAt)) {
        return null;
      }

      return token;
    } catch {
      return null;
    }
  }

  /**
   * Refresh expired token
   */
  async refreshToken(refreshToken: string): Promise<CLIToken> {
    try {
      const response = await (backendClient as any).client.post('/api/auth/cli/refresh', {
        refresh_token: refreshToken
      });

      const tokenData = response.data;
      
      const newToken: CLIToken = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        userId: tokenData.user_id,
        email: tokenData.email,
        plan: tokenData.plan,
        scopes: tokenData.scopes
      };

      await this.storeCLIToken(newToken);
      return newToken;

    } catch (error: any) {
      this.logger.error('Token refresh failed', error);
      throw new Error('Token refresh failed - please reauthenticate');
    }
  }

  /**
   * Create upgrade URL when user hits quota
   */
  createUpgradeUrl(userId: string, currentPlan: string, reason: string = 'quota_exceeded'): string {
    const params = new URLSearchParams({
      source: 'cli',
      user_id: userId,
      current_plan: currentPlan,
      reason: reason,
      return_to: 'cli_success'
    });

    return `${this.baseWebUrl}/billing/upgrade?${params.toString()}`;
  }

  /**
   * Create support URL with CLI context
   */
  createSupportUrl(userId?: string, error?: string): string {
    const params = new URLSearchParams({
      source: 'cli',
      version: this.getCLIVersion(),
      platform: process.platform
    });

    if (userId) params.set('user_id', userId);
    if (error) params.set('error', error);

    return `${this.baseWebUrl}/support?${params.toString()}`;
  }

  /**
   * Cleanup expired auth sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredThreshold = 15 * 60 * 1000; // 15 minutes

    for (const [deviceCode, session] of this.pendingAuth.entries()) {
      if (now - session.timestamp > expiredThreshold) {
        session.reject(new Error('Authentication session expired'));
        this.pendingAuth.delete(deviceCode);
      }
    }
  }
}

export const webCLIAuthBridge = new WebCLIAuthBridge();