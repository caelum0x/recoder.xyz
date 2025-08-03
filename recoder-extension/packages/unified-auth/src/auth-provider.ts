/**
 * Unified Authentication Provider
 * 
 * Handles authentication across all recoder.xyz platforms
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { TokenManager } from './token-manager';
import { SessionManager } from './session-manager';
import type { 
  AuthConfig, 
  AuthToken, 
  UserSession, 
  LoginCredentials, 
  UserInfo,
  Platform 
} from './types';

export class UnifiedAuthProvider {
  private tokenManager: TokenManager;
  private sessionManager: SessionManager;
  
  constructor(private config: AuthConfig) {
    this.tokenManager = new TokenManager(config);
    this.sessionManager = new SessionManager(config);
  }

  /**
   * Authenticate user with credentials
   */
  async login(credentials: LoginCredentials): Promise<{ token: AuthToken; session: UserSession }> {
    try {
      // For demo purposes, we'll create a mock authentication
      // In production, this would call the actual API
      const response = await this.callAuthAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const authData = await response.json();
      
      // Create token
      const token: AuthToken = {
        accessToken: authData.accessToken || this.generateMockToken(authData.user),
        refreshToken: authData.refreshToken,
        tokenType: 'Bearer',
        expiresIn: authData.expiresIn || 3600,
        issuedAt: new Date(),
      };

      // Create session
      const session: UserSession = {
        id: uuidv4(),
        userId: authData.user.id,
        email: authData.user.email,
        username: authData.user.username,
        platform: this.config.platform,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + token.expiresIn * 1000),
        isActive: true,
        metadata: authData.user.metadata,
      };

      // Store token and session
      await this.tokenManager.storeToken(token);
      await this.sessionManager.createSession(session);

      return { token, session };
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Logout user and cleanup session
   */
  async logout(): Promise<void> {
    try {
      const session = await this.sessionManager.getCurrentSession();
      if (session) {
        await this.sessionManager.endSession(session.id);
      }
      
      await this.tokenManager.clearToken();
      
      // Call logout API if needed
      await this.callAuthAPI('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Logout failed:', error);
      // Continue with local cleanup even if API call fails
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<AuthToken> {
    const currentToken = await this.tokenManager.getToken();
    if (!currentToken?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.callAuthAPI('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: currentToken.refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokenData = await response.json();
      const newToken: AuthToken = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken || currentToken.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokenData.expiresIn,
        issuedAt: new Date(),
      };

      await this.tokenManager.storeToken(newToken);
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If refresh fails, user needs to login again
      await this.logout();
      throw new Error('Session expired. Please login again.');
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    const token = await this.tokenManager.getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await this.callAuthAPI('/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.tokenManager.getToken();
    const session = await this.sessionManager.getCurrentSession();
    
    if (!token || !session) {
      return false;
    }

    // Check if token is expired
    if (this.tokenManager.isTokenExpired(token)) {
      try {
        await this.refreshToken();
        return true;
      } catch {
        return false;
      }
    }

    return session.isActive && new Date() < session.expiresAt;
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<UserSession | null> {
    return this.sessionManager.getCurrentSession();
  }

  /**
   * Update platform for current session
   */
  async updatePlatform(platform: Platform): Promise<void> {
    const session = await this.sessionManager.getCurrentSession();
    if (session) {
      session.platform = platform;
      await this.sessionManager.updateSession(session);
    }
  }

  // Private helpers

  private async callAuthAPI(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.apiUrl}${endpoint}`;
    
    const defaultHeaders = {
      'User-Agent': `recoder-${this.config.platform}/1.0.0`,
      'X-Platform': this.config.platform,
    };

    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    return fetch(url, mergedOptions);
  }

  private generateMockToken(user: any): string {
    // For development/demo purposes - generate a mock JWT
    const payload = {
      sub: user.id,
      email: user.email,
      platform: this.config.platform,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };

    // In production, use a proper secret key
    return jwt.sign(payload, 'demo-secret-key');
  }
}