/**
 * Unified Authentication System for Recoder.xyz Ecosystem
 * Enables seamless authentication across main website, chat, and Spaces surfaces
 */

// Types for cross-platform authentication
export interface UnifiedUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  type: 'guest' | 'regular' | 'premium' | 'enterprise';
  platforms: {
    main: boolean;
    chat: boolean;
    spaces: boolean;
  };
  subscription?: {
    plan: string;
    status: 'active' | 'inactive' | 'trial';
    expiresAt?: Date;
  };
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    aiModel: string;
    notifications: boolean;
  };
}

export interface PlatformConfig {
  name: 'main' | 'chat' | 'web';
  url: string;
  authEndpoint: string;
  apiEndpoint: string;
}

// Platform configurations
export const PLATFORMS: Record<string, PlatformConfig> = {
  main: {
    name: 'main',
    url: process.env.MAIN_WEBSITE_URL || 'http://localhost:3000',
    authEndpoint: '/api/auth',
    apiEndpoint: '/api'
  },
  chat: {
    name: 'chat', 
    url: process.env.CHAT_PLATFORM_URL || 'http://localhost:3000',
    authEndpoint: '/api/auth',
    apiEndpoint: '/api'
  },
  spaces: {
    name: 'spaces',
    url: process.env.SPACES_URL || 'http://localhost:3000/dashboard/spaces',
    authEndpoint: '/api/auth',
    apiEndpoint: '/api'
  }
};

/**
 * Cross-platform session synchronization
 */
export class UnifiedAuth {
  private static instance: UnifiedAuth;
  private sessionToken: string | null = null;
  private user: UnifiedUser | null = null;

  static getInstance(): UnifiedAuth {
    if (!UnifiedAuth.instance) {
      UnifiedAuth.instance = new UnifiedAuth();
    }
    return UnifiedAuth.instance;
  }

  /**
   * Authenticate user across all platforms
   */
  async signIn(provider: 'google' | 'github' | 'credentials', credentials?: any): Promise<UnifiedUser> {
    try {
      // Authenticate with primary platform (chat)
      const response = await fetch(`${PLATFORMS.chat.url}${PLATFORMS.chat.authEndpoint}/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, credentials }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const { user, token } = await response.json();
      this.user = user;
      this.sessionToken = token;

      // Sync session across all platforms
      await this.syncSessionAcrossPlatforms(token);

      return user;
    } catch (error) {
      console.error('Unified sign in failed:', error);
      throw error;
    }
  }

  /**
   * Sign out from all platforms
   */
  async signOut(): Promise<void> {
    try {
      // Sign out from all platforms
      const signOutPromises = Object.values(PLATFORMS).map(platform =>
        fetch(`${platform.url}${platform.authEndpoint}/signout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.sessionToken}`,
          },
        }).catch(error => console.warn(`Sign out failed for ${platform.name}:`, error))
      );

      await Promise.allSettled(signOutPromises);

      // Clear local session
      this.user = null;
      this.sessionToken = null;
      
      // Clear browser storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('unified-auth-token');
        localStorage.removeItem('unified-user');
      }
    } catch (error) {
      console.error('Unified sign out failed:', error);
    }
  }

  /**
   * Get current user
   */
  getUser(): UnifiedUser | null {
    return this.user;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.user && !!this.sessionToken;
  }

  /**
   * Navigate between platforms with authentication
   */
  async navigateTo(platform: 'main' | 'chat' | 'web', path: string = '/'): Promise<void> {
    const platformConfig = PLATFORMS[platform];
    const url = `${platformConfig.url}${path}`;

    if (this.sessionToken) {
      // Include auth token in navigation
      const authUrl = `${url}?auth_token=${this.sessionToken}`;
      if (typeof window !== 'undefined') {
        window.open(authUrl, '_blank');
      }
    } else {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
    }
  }

  /**
   * Sync session across all platforms
   */
  private async syncSessionAcrossPlatforms(token: string): Promise<void> {
    const syncPromises = Object.values(PLATFORMS).map(platform =>
      fetch(`${platform.url}${platform.authEndpoint}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      }).catch(error => console.warn(`Session sync failed for ${platform.name}:`, error))
    );

    await Promise.allSettled(syncPromises);

    // Store in browser for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('unified-auth-token', token);
      localStorage.setItem('unified-user', JSON.stringify(this.user));
    }
  }

  /**
   * Initialize from stored session
   */
  async initializeFromStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    const storedToken = localStorage.getItem('unified-auth-token');
    const storedUser = localStorage.getItem('unified-user');

    if (storedToken && storedUser) {
      try {
        this.sessionToken = storedToken;
        this.user = JSON.parse(storedUser);

        // Validate session is still active
        const isValid = await this.validateSession();
        if (!isValid) {
          await this.signOut();
        }
      } catch (error) {
        console.error('Failed to initialize from storage:', error);
        await this.signOut();
      }
    }
  }

  /**
   * Validate current session
   */
  private async validateSession(): Promise<boolean> {
    if (!this.sessionToken) return false;

    try {
      const response = await fetch(`${PLATFORMS.chat.url}${PLATFORMS.chat.authEndpoint}/validate`, {
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get API client for platform
   */
  getApiClient(platform: 'main' | 'chat' | 'web') {
    const platformConfig = PLATFORMS[platform];
    
    return {
      baseURL: `${platformConfig.url}${platformConfig.apiEndpoint}`,
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json',
      },
      async request(endpoint: string, options: RequestInit = {}) {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
          ...options,
          headers: {
            ...this.headers,
            ...options.headers,
          },
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        return response.json();
      },
    };
  }
}

/**
 * React hook for unified authentication
 */
export function useUnifiedAuth() {
  const auth = UnifiedAuth.getInstance();
  
  return {
    user: auth.getUser(),
    isAuthenticated: auth.isAuthenticated(),
    signIn: auth.signIn.bind(auth),
    signOut: auth.signOut.bind(auth),
    navigateTo: auth.navigateTo.bind(auth),
    getApiClient: auth.getApiClient.bind(auth),
  };
}

/**
 * Platform navigation utilities
 */
export const PlatformNavigation = {
  goToMain: (path: string = '/') => UnifiedAuth.getInstance().navigateTo('main', path),
  goToChat: (path: string = '/') => UnifiedAuth.getInstance().navigateTo('chat', path),
  goToWeb: (path: string = '/') => UnifiedAuth.getInstance().navigateTo('web', path),
  
  // Direct URLs for linking
  getMainUrl: (path: string = '/') => `${PLATFORMS.main.url}${path}`,
  getChatUrl: (path: string = '/') => `${PLATFORMS.chat.url}${path}`,
  getWebUrl: (path: string = '/') => `${PLATFORMS.web.url}${path}`,
};

export default UnifiedAuth;
