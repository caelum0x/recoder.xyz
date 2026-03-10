/**
 * Unified Authentication Client for Recoder.xyz
 * Supports all platforms: CLI, Web, Mobile, Desktop, Extension
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EventEmitter } from 'events';

export interface User {
  id: string;
  email: string;
  name: string;
  organization?: string;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
    isNewUser?: boolean;
  };
  message: string;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  deviceType: 'cli' | 'web' | 'mobile' | 'extension' | 'desktop';
  platform: string;
  pushToken?: string;
}

export interface OAuthAccount {
  id: string;
  provider: string;
  email?: string;
  createdAt: string;
}

export class AuthClient extends EventEmitter {
  private api: AxiosInstance;
  private baseURL: string;
  private currentUser: User | null = null;
  private tokens: AuthTokens | null = null;
  private deviceInfo: DeviceInfo | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseURL: string = 'http://localhost:3100') {
    super();
    this.baseURL = baseURL;
    
    this.api = axios.create({
      baseURL: `${baseURL}/api`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.getUserAgent()
      }
    });

    this.setupInterceptors();
    this.loadFromStorage();
  }

  private getUserAgent(): string {
    if (typeof window !== 'undefined' && window) {
      return `Recoder-Web/${this.getVersion()}`;
    } else if (typeof process !== 'undefined' && process) {
      return `Recoder-CLI/${this.getVersion()} (${process.platform})`;
    }
    return `Recoder-Client/${this.getVersion()}`;
  }

  private getVersion(): string {
    try {
      // Try to get version from package.json
      return '1.0.0'; // Fallback version
    } catch {
      return '1.0.0';
    }
  }

  private setupInterceptors(): void {
    // Request interceptor to add auth token
    this.api.interceptors.request.use((config) => {
      if (this.tokens?.accessToken) {
        config.headers.Authorization = `Bearer ${this.tokens.accessToken}`;
      }
      return config;
    });

    // Response interceptor to handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            originalRequest.headers.Authorization = `Bearer ${this.tokens!.accessToken}`;
            return this.api(originalRequest);
          } else {
            this.logout();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Authentication Methods

  async register(
    email: string,
    password: string,
    name: string,
    organization?: string
  ): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/register', {
        email,
        password,
        name,
        organization
      });

      await this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/login', {
        email,
        password
      });

      await this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async loginWithGoogle(authCode: string, redirectUri: string): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/oauth/google', {
        code: authCode,
        redirectUri
      });

      await this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async loginWithGitHub(authCode: string, state?: string): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/oauth/github', {
        code: authCode,
        state
      });

      await this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.tokens?.refreshToken) {
      return false;
    }

    this.refreshPromise = this._performRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async _performRefresh(): Promise<boolean> {
    try {
      const response: AxiosResponse<{ data: AuthTokens }> = await this.api.post('/auth/refresh', {
        refreshToken: this.tokens!.refreshToken
      });

      this.tokens = {
        accessToken: response.data.data.accessToken,
        refreshToken: response.data.data.refreshToken
      };

      this.saveToStorage();
      this.emit('tokenRefreshed', this.tokens);
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.tokens?.accessToken) {
        await this.api.post('/auth/logout');
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.clearAuth();
      this.emit('logout');
    }
  }

  // Device Management

  async registerDevice(deviceInfo: Omit<DeviceInfo, 'deviceId'>): Promise<DeviceInfo> {
    const deviceId = await this.generateDeviceId(deviceInfo.deviceType, deviceInfo.platform);
    
    const fullDeviceInfo: DeviceInfo = {
      ...deviceInfo,
      deviceId
    };

    try {
      await this.api.post('/devices/register', fullDeviceInfo);
      this.deviceInfo = fullDeviceInfo;
      this.saveToStorage();
      this.emit('deviceRegistered', fullDeviceInfo);
      return fullDeviceInfo;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async getDevices(): Promise<DeviceInfo[]> {
    try {
      const response: AxiosResponse<{ data: DeviceInfo[] }> = await this.api.get('/devices');
      return response.data.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async sendHeartbeat(metadata?: object): Promise<void> {
    if (!this.deviceInfo) return;

    try {
      await this.api.post(`/devices/${this.deviceInfo.deviceId}/heartbeat`, { metadata });
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }

  // OAuth Account Management

  async getOAuthAccounts(): Promise<OAuthAccount[]> {
    try {
      const response: AxiosResponse<{ data: OAuthAccount[] }> = await this.api.get('/oauth/accounts');
      return response.data.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async disconnectOAuthProvider(provider: string): Promise<void> {
    try {
      await this.api.delete(`/oauth/disconnect/${provider}`);
      this.emit('oauthDisconnected', provider);
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  // User Profile Management

  async getCurrentUser(): Promise<User> {
    try {
      const response: AxiosResponse<{ data: User }> = await this.api.get('/auth/me');
      this.currentUser = response.data.data;
      return response.data.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async updateProfile(updates: Partial<Pick<User, 'name' | 'organization'>>): Promise<User> {
    try {
      const response: AxiosResponse<{ data: User }> = await this.api.put('/auth/update-profile', updates);
      this.currentUser = response.data.data;
      this.emit('profileUpdated', response.data.data);
      return response.data.data;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await this.api.put('/auth/change-password', {
        currentPassword,
        newPassword
      });
      this.emit('passwordChanged');
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  // Utility Methods

  isAuthenticated(): boolean {
    return !!(this.tokens?.accessToken && this.currentUser);
  }

  getUser(): User | null {
    return this.currentUser;
  }

  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  // Private Helper Methods

  private async handleAuthSuccess(response: AuthResponse): Promise<void> {
    this.currentUser = response.data.user;
    this.tokens = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken
    };

    this.saveToStorage();
    this.emit('authenticated', { user: this.currentUser, tokens: this.tokens });

    // Auto-register device if not already registered
    if (!this.deviceInfo && typeof window !== 'undefined' && window && typeof navigator !== 'undefined' && navigator) {
      // Web platform
      await this.registerDevice({
        name: `${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'} - ${new Date().toLocaleDateString()}`,
        deviceType: 'web',
        platform: 'browser'
      });
    }
  }

  private handleAuthError(error: any): Error {
    const message = error.response?.data?.error?.message || error.message || 'Authentication failed';
    const authError = new Error(message);
    this.emit('authError', authError);
    return authError;
  }

  private clearAuth(): void {
    this.currentUser = null;
    this.tokens = null;
    this.removeFromStorage();
  }

  private async generateDeviceId(deviceType: string, platform: string): Promise<string> {
    try {
      const response: AxiosResponse<{ data: { deviceId: string } }> = await this.api.post('/devices/generate-id', {
        deviceType,
        platform
      });
      return response.data.data.deviceId;
    } catch (error) {
      // Fallback to client-side generation
      const timestamp = Date.now().toString(36);
      const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      return `${deviceType}-${platform}-${timestamp}-${random}`;
    }
  }

  // Storage Methods (Platform-specific implementations should override these)

  protected saveToStorage(): void {
    const data = {
      user: this.currentUser,
      tokens: this.tokens,
      device: this.deviceInfo
    };

    if (typeof window !== 'undefined' && window && window.localStorage && typeof localStorage !== 'undefined') {
      // Web platform
      localStorage.setItem('recoder-auth', JSON.stringify(data));
    } else if (typeof process !== 'undefined' && process) {
      // Node.js platform (CLI)
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      try {
        const configDir = path.join(os.homedir(), '.recoder');
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        const authFile = path.join(configDir, 'auth.json');
        fs.writeFileSync(authFile, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('Failed to save auth data:', error);
      }
    }
  }

  protected loadFromStorage(): void {
    try {
      let data = null;

      if (typeof window !== 'undefined' && window && window.localStorage && typeof localStorage !== 'undefined') {
        // Web platform
        const stored = localStorage.getItem('recoder-auth');
        if (stored) {
          data = JSON.parse(stored);
        }
      } else if (typeof process !== 'undefined' && process) {
        // Node.js platform (CLI)
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const authFile = path.join(os.homedir(), '.recoder', 'auth.json');
        if (fs.existsSync(authFile)) {
          const content = fs.readFileSync(authFile, 'utf-8');
          data = JSON.parse(content);
        }
      }

      if (data) {
        this.currentUser = data.user;
        this.tokens = data.tokens;
        this.deviceInfo = data.device;
      }
    } catch (error) {
      console.error('Failed to load auth data:', error);
      this.clearAuth();
    }
  }

  protected removeFromStorage(): void {
    if (typeof window !== 'undefined' && window && window.localStorage && typeof localStorage !== 'undefined') {
      localStorage.removeItem('recoder-auth');
    } else if (typeof process !== 'undefined' && process) {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      try {
        const authFile = path.join(os.homedir(), '.recoder', 'auth.json');
        if (fs.existsSync(authFile)) {
          fs.unlinkSync(authFile);
        }
      } catch (error) {
        console.error('Failed to remove auth data:', error);
      }
    }
  }
}

// Export singleton instance for convenience
export const authClient = new AuthClient();

// Export for custom instances
export default AuthClient;