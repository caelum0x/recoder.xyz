/**
 * CLI Authentication Service
 * Handles authentication flows including web-based auth and device flow
 * Provides seamless integration with recoder.xyz platform
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import axios from 'axios';
import open from 'open';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AuthConfig {
  webAuthUrl?: string;
  apiUrl?: string;
  clientId?: string;
  redirectPort?: number;
}

export interface AuthSession {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user: {
    id: string;
    email: string;
    name: string;
    subscription_plan: string;
    quota: {
      requests_remaining: number;
      requests_limit: number;
      reset_date: string;
    };
  };
  api_key?: string;
  platform_connection?: {
    web_session_id: string;
    router_session_id?: string;
    last_sync: string;
  };
}

export interface DeviceFlowAuth {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export class AuthService extends EventEmitter {
  private config: AuthConfig;
  private session: AuthSession | null = null;
  private authConfigPath: string;
  private authServer: any = null;

  constructor(config: AuthConfig = {}) {
    super();
    this.config = {
      webAuthUrl: config.webAuthUrl || 'http://localhost:3000',
      apiUrl: config.apiUrl || 'http://localhost:3000/api/auth/cli',
      clientId: config.clientId || 'recoder-cli',
      redirectPort: config.redirectPort || 8080,
      ...config
    };

    this.authConfigPath = join(homedir(), '.recoder', 'auth.json');
  }

  /**
   * Initialize authentication service
   */
  async initialize(): Promise<void> {
    try {
      // Load existing session
      await this.loadSession();
      
      if (this.session) {
        // Verify session is still valid
        const isValid = await this.validateSession();
        if (!isValid) {
          Logger.warn('⚠️ Stored session is invalid, clearing');
          await this.clearSession();
        } else {
          Logger.info(`✅ Authenticated as ${this.session.user.email}`);
          this.emit('authenticated', this.session);
        }
      }

    } catch (error: any) {
      Logger.error('Failed to initialize auth service:', error.message);
    }
  }

  /**
   * Start web-based authentication flow
   */
  async authenticateWithWeb(options: {
    interactive?: boolean;
    force?: boolean;
  } = {}): Promise<AuthSession> {
    if (this.session && !options.force) {
      const isValid = await this.validateSession();
      if (isValid) {
        Logger.info('Already authenticated');
        return this.session;
      }
    }

    Logger.info('🌐 Starting web authentication flow...');

    try {
      // Generate state for security
      const state = this.generateSecureState();
      const redirectUri = `http://localhost:${this.config.redirectPort}/auth/callback`;

      // Build authorization URL
      const authUrl = new URL('/api/auth/cli', this.config.webAuthUrl!);
      authUrl.searchParams.set('client_id', this.config.clientId!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('scope', 'cli:full profile');

      // Start local callback server
      const authPromise = this.startAuthCallbackServer(this.config.redirectPort!, state);

      if (options.interactive !== false) {
        Logger.info(`🌐 Opening browser for authentication...`);
        Logger.info(`📍 Auth URL: ${authUrl.toString()}`);
        
        try {
          await open(authUrl.toString());
        } catch (error) {
          Logger.warn('Failed to open browser automatically');
          Logger.info(`Please open this URL manually: ${authUrl.toString()}`);
        }

        Logger.info('⏳ Waiting for authentication...');
        Logger.info('💡 Complete the authentication in your browser');
      } else {
        Logger.info(`Authentication URL: ${authUrl.toString()}`);
      }

      // Wait for callback
      const authCode = await authPromise;

      // Exchange code for tokens
      const session = await this.exchangeCodeForTokens(authCode, redirectUri);

      // Save session
      await this.saveSession(session);
      this.session = session;

      Logger.info('✅ Authentication successful!');
      Logger.info(`👤 Logged in as: ${session.user.name} (${session.user.email})`);
      Logger.info(`📋 Plan: ${session.user.subscription_plan}`);
      Logger.info(`🎯 Quota: ${session.user.quota.requests_remaining}/${session.user.quota.requests_limit} requests remaining`);

      this.emit('authenticated', session);
      return session;

    } catch (error: any) {
      Logger.error('❌ Authentication failed:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Start device flow authentication (for headless environments)
   */
  async authenticateWithDeviceFlow(): Promise<AuthSession> {
    Logger.info('📱 Starting device flow authentication...');

    try {
      // Request device code
      const deviceFlow = await this.requestDeviceCode();

      Logger.info('📋 Device Authentication Required');
      Logger.info(`🔗 Visit: ${deviceFlow.verification_uri}`);
      Logger.info(`🔢 Enter code: ${deviceFlow.user_code}`);
      Logger.info('');
      Logger.info(`💡 Or visit: ${deviceFlow.verification_uri_complete}`);
      Logger.info('');

      // Poll for token
      const session = await this.pollForDeviceToken(deviceFlow);

      // Save session
      await this.saveSession(session);
      this.session = session;

      Logger.info('✅ Device authentication successful!');
      Logger.info(`👤 Logged in as: ${session.user.name} (${session.user.email})`);

      this.emit('authenticated', session);
      return session;

    } catch (error: any) {
      Logger.error('❌ Device authentication failed:', error.message);
      throw new Error(`Device authentication failed: ${error.message}`);
    }
  }

  /**
   * Authenticate using API key
   */
  async authenticateWithApiKey(apiKey: string): Promise<AuthSession> {
    Logger.info('🔑 Authenticating with API key...');

    try {
      // Validate API key and get user info
      const response = await axios.post(this.config.apiUrl!, {
        action: 'validate_token',
        token: apiKey
      });

      if (!response.data.success) {
        throw new Error('Invalid API key');
      }

      // Create session from API key validation
      const session: AuthSession = {
        user_id: response.data.user.id,
        access_token: apiKey,
        refresh_token: '', // API keys don't have refresh tokens
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        user: response.data.user,
        api_key: apiKey
      };

      // Save session
      await this.saveSession(session);
      this.session = session;

      Logger.info('✅ API key authentication successful!');
      Logger.info(`👤 Authenticated as: ${session.user.name} (${session.user.email})`);

      this.emit('authenticated', session);
      return session;

    } catch (error: any) {
      Logger.error('❌ API key authentication failed:', error.message);
      throw new Error(`API key authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshSession(): Promise<AuthSession> {
    if (!this.session || !this.session.refresh_token) {
      throw new Error('No refresh token available');
    }

    Logger.debug('🔄 Refreshing access token...');

    try {
      const response = await axios.post(this.config.apiUrl!, {
        action: 'refresh_token',
        refresh_token: this.session.refresh_token,
        client_id: this.config.clientId
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Token refresh failed');
      }

      // Update session with new tokens
      this.session.access_token = response.data.access_token;
      if (response.data.refresh_token) {
        this.session.refresh_token = response.data.refresh_token;
      }
      this.session.expires_at = response.data.expires_at;

      // Update user info if provided
      if (response.data.user) {
        this.session.user = { ...this.session.user, ...response.data.user };
      }

      await this.saveSession(this.session);

      Logger.debug('✅ Access token refreshed');
      this.emit('session_refreshed', this.session);

      return this.session;

    } catch (error: any) {
      Logger.error('❌ Token refresh failed:', error.message);
      await this.clearSession();
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    Logger.info('👋 Logging out...');

    try {
      // Revoke tokens if we have them
      if (this.session?.access_token) {
        await axios.post(this.config.apiUrl!, {
          action: 'revoke_token',
          token: this.session.access_token
        }).catch(() => {
          // Ignore revocation errors
        });
      }

      // Clear local session
      await this.clearSession();
      
      Logger.info('✅ Logged out successfully');
      this.emit('logged_out');

    } catch (error: any) {
      Logger.error('Failed to logout:', error.message);
      // Still clear local session even if server logout fails
      await this.clearSession();
    }
  }

  /**
   * Get current session
   */
  getSession(): AuthSession | null {
    return this.session;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.session;
  }

  /**
   * Get authentication headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.session) {
      return {};
    }

    return {
      'Authorization': `Bearer ${this.session.access_token}`,
      'X-User-ID': this.session.user_id
    };
  }

  /**
   * Private helper methods
   */

  private generateSecureState(): string {
    return Buffer.from(Math.random().toString(36).substr(2) + Date.now().toString()).toString('base64');
  }

  private async startAuthCallbackServer(port: number, expectedState: string): Promise<string> {
    const express = await import('express');
    const app = express.default();

    return new Promise((resolve, reject) => {
      let resolved = false;

      app.get('/auth/callback', (req, res) => {
        if (resolved) return;

        const { code, state, error } = req.query;

        if (error) {
          resolved = true;
          res.send(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h2>❌ Authentication Failed</h2>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          this.stopAuthServer();
          reject(new Error(`Authentication error: ${error}`));
          return;
        }

        if (!code || !state || state !== expectedState) {
          resolved = true;
          res.send(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h2>❌ Authentication Failed</h2>
                <p>Invalid callback parameters</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          this.stopAuthServer();
          reject(new Error('Invalid callback parameters'));
          return;
        }

        resolved = true;
        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>✅ Authentication Successful!</h2>
              <p>You can now close this window and return to the CLI.</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);

        this.stopAuthServer();
        resolve(code as string);
      });

      this.authServer = app.listen(port, () => {
        Logger.debug(`Auth callback server listening on port ${port}`);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.stopAuthServer();
          reject(new Error('Authentication timeout - no response received'));
        }
      }, 5 * 60 * 1000);
    });
  }

  private stopAuthServer(): void {
    if (this.authServer) {
      this.authServer.close();
      this.authServer = null;
    }
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string): Promise<AuthSession> {
    const response = await axios.post(this.config.apiUrl!, {
      action: 'exchange_code',
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code: code,
      redirect_uri: redirectUri
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Token exchange failed');
    }

    return {
      user_id: response.data.user_id,
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: response.data.expires_at,
      user: response.data.user,
      platform_connection: response.data.platform_connection
    };
  }

  private async requestDeviceCode(): Promise<DeviceFlowAuth> {
    const response = await axios.post(this.config.apiUrl!, {
      action: 'device_flow',
      client_id: this.config.clientId,
      scope: 'cli:full profile'
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Device code request failed');
    }

    return response.data;
  }

  private async pollForDeviceToken(deviceFlow: DeviceFlowAuth): Promise<AuthSession> {
    const startTime = Date.now();
    const expiresAt = startTime + (deviceFlow.expires_in * 1000);

    while (Date.now() < expiresAt) {
      try {
        const response = await axios.post(this.config.apiUrl!, {
          action: 'device_token',
          client_id: this.config.clientId,
          device_code: deviceFlow.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });

        if (response.data.success) {
          return {
            user_id: response.data.user_id,
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_at: response.data.expires_at,
            user: response.data.user,
            platform_connection: response.data.platform_connection
          };
        }

        // Handle pending authorization
        if (response.data.error === 'authorization_pending') {
          // Wait for the specified interval
          await new Promise(resolve => setTimeout(resolve, deviceFlow.interval * 1000));
          continue;
        }

        // Handle slow down request
        if (response.data.error === 'slow_down') {
          // Wait longer than normal interval
          await new Promise(resolve => setTimeout(resolve, (deviceFlow.interval + 5) * 1000));
          continue;
        }

        throw new Error(response.data.error || 'Device token polling failed');

      } catch (error: any) {
        if (error.message.includes('authorization_pending') || error.message.includes('slow_down')) {
          await new Promise(resolve => setTimeout(resolve, deviceFlow.interval * 1000));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Device authentication timed out');
  }

  private async validateSession(): Promise<boolean> {
    if (!this.session) return false;

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(this.session.expires_at);
    
    if (now >= expiresAt) {
      // Try to refresh if we have refresh token
      if (this.session.refresh_token) {
        try {
          await this.refreshSession();
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    // Validate with server
    try {
      const response = await axios.post(this.config.apiUrl!, {
        action: 'validate_token',
        token: this.session.access_token
      }, {
        timeout: 10000
      });

      return response.data.success === true;
    } catch {
      return false;
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const configData = await fs.readFile(this.authConfigPath, 'utf-8');
      this.session = JSON.parse(configData);
    } catch {
      // No existing session or invalid JSON
      this.session = null;
    }
  }

  private async saveSession(session: AuthSession): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(join(homedir(), '.recoder'), { recursive: true });
      
      // Save session data
      await fs.writeFile(this.authConfigPath, JSON.stringify(session, null, 2));
      
      // Set secure file permissions
      await fs.chmod(this.authConfigPath, 0o600);
    } catch (error: any) {
      Logger.error('Failed to save auth session:', error.message);
    }
  }

  private async clearSession(): Promise<void> {
    this.session = null;
    try {
      await fs.unlink(this.authConfigPath);
    } catch {
      // File might not exist
    }
  }
}

export default AuthService;