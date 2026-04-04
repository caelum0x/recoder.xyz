/**
 * OAuth Callback Handler for Cross-Platform Authentication
 * Handles OAuth callbacks for all Recoder platforms
 */

import { EventEmitter } from 'events';
import { AuthClient, AuthResponse } from './auth-client';

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string; // Not needed for client-side flows
  redirectUri: string;
  scope: string[];
  state?: string;
}

export interface OAuthProvider {
  name: string;
  displayName: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  defaultScopes: string[];
}

export interface OAuthCallbackData {
  code: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthResult {
  success: boolean;
  user?: any;
  tokens?: any;
  error?: string;
  errorCode?: 'unsupported_provider' | 'invalid_state' | 'oauth_error' | 'missing_code' | 'auth_failed' | 'timeout';
}

export class OAuthHandler extends EventEmitter {
  private authClient: AuthClient;
  private providers: Map<string, OAuthProvider>;
  private pendingAuths: Map<string, { resolve: (result: OAuthResult) => void; reject: (error: Error) => void }>;

  constructor(authClient: AuthClient) {
    super();
    this.authClient = authClient;
    this.providers = new Map();
    this.pendingAuths = new Map();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Google OAuth Provider
    this.providers.set('google', {
      name: 'google',
      displayName: 'Google',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      defaultScopes: ['openid', 'email', 'profile']
    });

    // GitHub OAuth Provider
    this.providers.set('github', {
      name: 'github',
      displayName: 'GitHub',
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      defaultScopes: ['user:email']
    });

    // Microsoft OAuth Provider
    this.providers.set('microsoft', {
      name: 'microsoft',
      displayName: 'Microsoft',
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      defaultScopes: ['openid', 'email', 'profile']
    });
  }

  /**
   * Generate OAuth authorization URL for a platform
   */
  generateAuthUrl(
    provider: string,
    platform: string,
    config: Partial<OAuthConfig> = {}
  ): string {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`OAuth provider '${provider}' not supported`);
    }

    // Generate state parameter for security
    const state = this.generateState(provider, platform);
    
    // Default redirect URIs per platform
    const defaultRedirectUris = {
      web: `${process.env['RECODER_WEB_URL'] || 'http://localhost:3000'}/auth/callback/${provider}`,
      cli: `${process.env['RECODER_API_URL'] || 'http://localhost:3100'}/oauth/callback/${provider}`,
      mobile: `recoder://oauth/callback/${provider}`,
      desktop: `recoder://oauth/callback/${provider}`,
      extension: `vscode://recoder.extension/oauth/callback/${provider}`
    };

    const paramsObj: Record<string, string> = {
      client_id: config.clientId || process.env[`${provider.toUpperCase()}_CLIENT_ID`] || '',
      redirect_uri: config.redirectUri || defaultRedirectUris[platform as keyof typeof defaultRedirectUris] || '',
      response_type: 'code',
      scope: (config.scope || providerConfig.defaultScopes).join(' '),
      state
    };

    // Add provider-specific params
    if (provider === 'google') {
      paramsObj['access_type'] = 'offline';
      paramsObj['prompt'] = 'consent';
    }

    const params = new URLSearchParams(paramsObj);

    // Remove undefined values
    Object.keys(Object.fromEntries(params)).forEach(key => {
      if (params.get(key) === 'undefined' || params.get(key) === '') {
        params.delete(key);
      }
    });

    return `${providerConfig.authUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback for any platform
   */
  async handleCallback(
    provider: string,
    platform: string,
    callbackData: OAuthCallbackData
  ): Promise<OAuthResult> {
    try {
      // Check if provider is supported before proceeding
      if (!this.isProviderSupported(provider)) {
        return {
          success: false,
          error: `OAuth provider '${provider}' is not supported. Supported providers: ${this.getSupportedProviders().map(p => p.name).join(', ')}`,
          errorCode: 'unsupported_provider'
        };
      }

      // Verify state parameter
      if (callbackData.state && !this.verifyState(callbackData.state, provider, platform)) {
        return {
          success: false,
          error: 'Invalid state parameter - possible CSRF attack',
          errorCode: 'invalid_state'
        };
      }

      // Check for OAuth errors
      if (callbackData.error) {
        return {
          success: false,
          error: `OAuth error: ${callbackData.error} - ${callbackData.errorDescription || 'Unknown error'}`,
          errorCode: 'oauth_error'
        };
      }

      if (!callbackData.code) {
        return {
          success: false,
          error: 'No authorization code received',
          errorCode: 'missing_code'
        };
      }

      // Exchange code for tokens and authenticate
      let authResponse: AuthResponse;

      switch (provider) {
        case 'google':
          authResponse = await this.authClient.loginWithGoogle(
            callbackData.code,
            this.getRedirectUri(provider, platform)
          );
          break;

        case 'github':
          authResponse = await this.authClient.loginWithGitHub(
            callbackData.code,
            callbackData.state
          );
          break;

        default:
          // Provider is registered but token exchange is not implemented yet
          return {
            success: false,
            error: `OAuth callback handling for '${provider}' is not yet implemented. Currently supported: google, github`,
            errorCode: 'unsupported_provider'
          };
      }

      this.emit('authSuccess', {
        provider,
        platform,
        user: authResponse.data.user,
        isNewUser: authResponse.data.isNewUser
      });

      return {
        success: true,
        user: authResponse.data.user,
        tokens: {
          accessToken: authResponse.data.accessToken,
          refreshToken: authResponse.data.refreshToken
        }
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.emit('authError', {
        provider,
        platform,
        error: message
      });

      return {
        success: false,
        error: message,
        errorCode: 'auth_failed'
      };
    }
  }

  /**
   * Start OAuth flow for a platform
   */
  async startOAuthFlow(
    provider: string,
    platform: string,
    config: Partial<OAuthConfig> = {}
  ): Promise<OAuthResult> {
    return new Promise((resolve, reject) => {
      const state = this.generateState(provider, platform);
      this.pendingAuths.set(state, { resolve, reject });

      const authUrl = this.generateAuthUrl(provider, platform, { ...config, state });
      
      // Emit event with auth URL for platform-specific handling
      this.emit('authUrlGenerated', {
        provider,
        platform,
        authUrl,
        state
      });

      // Platform-specific URL opening logic
      this.openAuthUrl(authUrl, platform);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingAuths.has(state)) {
          this.pendingAuths.delete(state);
          reject(new Error('OAuth flow timed out'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Complete OAuth flow when callback is received
   */
  async completeOAuthFlow(
    provider: string,
    platform: string,
    callbackData: OAuthCallbackData
  ): Promise<void> {
    const result = await this.handleCallback(provider, platform, callbackData);
    
    if (callbackData.state && this.pendingAuths.has(callbackData.state)) {
      const { resolve } = this.pendingAuths.get(callbackData.state)!;
      this.pendingAuths.delete(callbackData.state);
      resolve(result);
    }
  }

  /**
   * Platform-specific URL opening
   */
  private openAuthUrl(authUrl: string, platform: string): void {
    switch (platform) {
      case 'web':
        // For web, redirect to the URL or open in popup
        if (typeof window !== 'undefined' && window) {
          window.location.href = authUrl;
        }
        break;
        
      case 'cli':
        // For CLI, open in default browser
        if (typeof process !== 'undefined') {
          const { spawn } = require('child_process');
          const command = process.platform === 'win32' ? 'start' : 
                        process.platform === 'darwin' ? 'open' : 'xdg-open';
          spawn(command, [authUrl], { detached: true });
        }
        break;
        
      case 'desktop':
        // For desktop, use electron's shell
        this.emit('openExternalUrl', authUrl);
        break;
        
      case 'mobile':
        // For mobile, use deep linking
        this.emit('openExternalUrl', authUrl);
        break;
        
      case 'extension':
        // For VS Code extension, use vscode.env.openExternal
        this.emit('openExternalUrl', authUrl);
        break;
        
      default:
        console.log(`Open this URL in your browser: ${authUrl}`);
    }
  }

  /**
   * Generate secure state parameter
   */
  private generateState(provider: string, platform: string): string {
    const timestamp = Date.now().toString();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const randomBytes = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

    return Buffer.from(`${provider}:${platform}:${timestamp}:${randomBytes}`).toString('base64url');
  }

  /**
   * Verify state parameter
   */
  private verifyState(state: string, expectedProvider: string, expectedPlatform: string): boolean {
    try {
      const decoded = Buffer.from(state, 'base64url').toString();
      const [provider, platform, timestamp] = decoded.split(':');
      
      // Check if state matches expected values
      if (provider !== expectedProvider || platform !== expectedPlatform) {
        return false;
      }
      
      // Check if state is not too old (5 minutes max)
      const stateAge = Date.now() - parseInt(timestamp);
      if (stateAge > 5 * 60 * 1000) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get redirect URI for platform/provider combination
   */
  private getRedirectUri(provider: string, platform: string): string {
    const defaultRedirectUris = {
      web: `${process.env['RECODER_WEB_URL'] || 'http://localhost:3000'}/auth/callback/${provider}`,
      cli: `${process.env['RECODER_API_URL'] || 'http://localhost:3100'}/oauth/callback/${provider}`,
      mobile: `recoder://oauth/callback/${provider}`,
      desktop: `recoder://oauth/callback/${provider}`,
      extension: `vscode://recoder.extension/oauth/callback/${provider}`
    };

    return defaultRedirectUris[platform as keyof typeof defaultRedirectUris] || 
           `http://localhost:3100/oauth/callback/${provider}`;
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): OAuthProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if provider is supported
   */
  isProviderSupported(provider: string): boolean {
    return this.providers.has(provider);
  }
}

export default OAuthHandler;
