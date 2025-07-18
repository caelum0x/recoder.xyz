/**
 * Authentication service
 */

import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from '../utils/config';
import { Logger } from '@recoder/shared';

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: any;
  error?: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
}

export interface TokenData {
  name: string;
  scope: string;
  expiresIn?: number;
}

class AuthenticationService {
  private api: AxiosInstance;

  constructor() {
    const apiConfig = ConfigManager.getApiConfig();
    
    this.api = axios.create({
      baseURL: apiConfig.baseUrl,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder CLI/1.0.0',
      },
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear invalid auth data
          ConfigManager.clearAuth();
        }
        return Promise.reject(error);
      }
    );
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await this.api.post('/auth/login', {
        email,
        password,
      });

      const { token, user, expiresAt } = response.data;

      if (token && user) {
        ConfigManager.setAuthData(token, user, expiresAt);
        Logger.info(`User ${user.email} logged in successfully`);
      }

      return {
        success: true,
        token,
        user,
      };
    } catch (error: any) {
      Logger.error(`Login failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await this.api.post('/auth/register', data);

      const { message, user } = response.data;

      Logger.info(`User ${data.email} registered successfully`);

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      Logger.error(`Registration failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  }

  async logout(token: string, allDevices: boolean = false): Promise<AuthResponse> {
    try {
      await this.api.post('/auth/logout', 
        { allDevices },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      ConfigManager.clearAuth();
      Logger.info('User logged out successfully');

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Logout failed: ${error.response?.data?.message || error.message}`);
      
      // Clear local auth even if server logout fails
      ConfigManager.clearAuth();
      
      return {
        success: false,
        error: error.response?.data?.message || 'Logout failed',
      };
    }
  }

  async validateToken(token: string): Promise<AuthResponse> {
    try {
      const response = await this.api.get('/auth/validate', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { user } = response.data;

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      Logger.error(`Token validation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Token validation failed',
      };
    }
  }

  async getCurrentUser(token: string): Promise<AuthResponse> {
    try {
      const response = await this.api.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { user } = response.data;

      // Update stored user data
      const currentAuth = ConfigManager.get('auth') || {};
      ConfigManager.set('auth', { ...currentAuth, user });

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      Logger.error(`Failed to get current user: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get user information',
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const response = await this.api.post('/auth/refresh', {
        refreshToken,
      });

      const { token, user, expiresAt } = response.data;

      if (token) {
        ConfigManager.setAuthData(token, user, expiresAt);
        Logger.info('Token refreshed successfully');
      }

      return {
        success: true,
        token,
        user,
      };
    } catch (error: any) {
      Logger.error(`Token refresh failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Token refresh failed',
      };
    }
  }

  async getBrowserAuthUrl(): Promise<string> {
    try {
      const response = await this.api.get('/auth/browser-url');
      return response.data.authUrl;
    } catch (error: any) {
      Logger.error(`Failed to get browser auth URL: ${error.message}`);
      throw new Error('Failed to get browser authentication URL');
    }
  }

  async getBrowserRegisterUrl(): Promise<string> {
    try {
      const response = await this.api.get('/auth/browser-register-url');
      return response.data.registerUrl;
    } catch (error: any) {
      Logger.error(`Failed to get browser register URL: ${error.message}`);
      throw new Error('Failed to get browser registration URL');
    }
  }

  async waitForBrowserAuth(): Promise<AuthResponse> {
    try {
      // Poll for browser auth completion
      const maxAttempts = 60; // 5 minutes
      let attempts = 0;

      while (attempts < maxAttempts) {
        try {
          const response = await this.api.get('/auth/browser-status');
          
          if (response.data.completed) {
            const { token, user, expiresAt } = response.data;
            
            if (token && user) {
              ConfigManager.setAuthData(token, user, expiresAt);
              Logger.info('Browser authentication completed');
            }

            return {
              success: true,
              token,
              user,
            };
          }
          
          if (response.data.cancelled) {
            return {
              success: false,
              error: 'Authentication was cancelled',
            };
          }
        } catch (error) {
          // Continue polling
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;
      }

      return {
        success: false,
        error: 'Browser authentication timed out',
      };
    } catch (error: any) {
      Logger.error(`Browser auth polling failed: ${error.message}`);
      return {
        success: false,
        error: 'Browser authentication failed',
      };
    }
  }

  async createToken(authToken: string, data: TokenData): Promise<any> {
    try {
      const response = await this.api.post('/auth/tokens', data, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      Logger.info(`API token created: ${data.name}`);

      return {
        success: true,
        token: response.data.token,
      };
    } catch (error: any) {
      Logger.error(`Token creation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Token creation failed',
      };
    }
  }

  async listTokens(authToken: string): Promise<any> {
    try {
      const response = await this.api.get('/auth/tokens', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      return {
        success: true,
        tokens: response.data.tokens,
      };
    } catch (error: any) {
      Logger.error(`Failed to list tokens: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to list tokens',
      };
    }
  }

  async revokeToken(authToken: string, tokenId: string): Promise<any> {
    try {
      await this.api.delete(`/auth/tokens/${tokenId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      Logger.info(`Token revoked: ${tokenId}`);

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Token revocation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Token revocation failed',
      };
    }
  }

  async changePassword(authToken: string, currentPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      await this.api.patch('/auth/password', 
        {
          currentPassword,
          newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      Logger.info('Password changed successfully');

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Password change failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Password change failed',
      };
    }
  }

  async resetPassword(email: string): Promise<AuthResponse> {
    try {
      await this.api.post('/auth/reset-password', { email });

      Logger.info(`Password reset requested for: ${email}`);

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Password reset failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Password reset failed',
      };
    }
  }

  async updateProfile(authToken: string, profileData: any): Promise<AuthResponse> {
    try {
      const response = await this.api.patch('/auth/profile', profileData, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const { user } = response.data;

      // Update stored user data
      const currentAuth = ConfigManager.get('auth') || {};
      ConfigManager.set('auth', { ...currentAuth, user });

      Logger.info('Profile updated successfully');

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      Logger.error(`Profile update failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Profile update failed',
      };
    }
  }

  async deleteAccount(authToken: string, password: string): Promise<AuthResponse> {
    try {
      await this.api.delete('/auth/account', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          password,
        },
      });

      // Clear local authentication
      ConfigManager.clearAuth();

      Logger.info('Account deleted successfully');

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Account deletion failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Account deletion failed',
      };
    }
  }
}

// Export singleton instance
export const AuthService = new AuthenticationService();