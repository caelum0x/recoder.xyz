/**
 * Mobile OAuth Implementation
 * Handles OAuth flows for mobile platforms (React Native)
 */

import { OAuthHandler, OAuthCallbackData } from './oauth-handler';
import { AuthClient } from './auth-client';

export interface MobileOAuthConfig {
  customScheme?: string;
  useInAppBrowser?: boolean;
  browserOptions?: {
    dismissButtonStyle?: 'done' | 'close' | 'cancel';
    preferredBarTintColor?: string;
    preferredControlTintColor?: string;
    readerMode?: boolean;
    animated?: boolean;
    modalPresentationStyle?: string;
    modalTransitionStyle?: string;
  };
}

export interface MobileOAuthResult {
  success: boolean;
  user?: any;
  tokens?: any;
  error?: string;
}

export class MobileOAuthHandler {
  private oauthHandler: OAuthHandler;
  private authClient: AuthClient;
  private config: Required<MobileOAuthConfig>;
  private deepLinkHandler?: (url: string) => void;

  constructor(authClient: AuthClient, config: MobileOAuthConfig = {}) {
    this.authClient = authClient;
    this.oauthHandler = new OAuthHandler(authClient);
    this.config = {
      customScheme: config.customScheme || 'recoder',
      useInAppBrowser: config.useInAppBrowser ?? true,
      browserOptions: {
        dismissButtonStyle: 'done',
        preferredBarTintColor: '#000000',
        preferredControlTintColor: '#ffffff',
        readerMode: false,
        animated: true,
        modalPresentationStyle: 'overCurrentContext',
        modalTransitionStyle: 'coverVertical',
        ...config.browserOptions
      }
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.oauthHandler.on('authSuccess', ({ provider, user, isNewUser }) => {
      console.log(`Successfully authenticated with ${provider}!`, { user, isNewUser });
    });

    this.oauthHandler.on('authError', ({ provider, error }) => {
      console.error(`Authentication failed with ${provider}:`, error);
    });
  }

  /**
   * Start OAuth flow for mobile
   */
  async login(provider: string): Promise<MobileOAuthResult> {
    const authUrl = this.oauthHandler.generateAuthUrl(provider, 'mobile', {
      redirectUri: `${this.config.customScheme}://oauth/callback/${provider}`
    });

    return new Promise((resolve, reject) => {
      // Set up deep link handler
      const handleDeepLink = async (url: string) => {
        try {
          const callbackData = this.parseCallbackUrl(url);
          const result = await this.oauthHandler.handleCallback(provider, 'mobile', callbackData);
          
          // Clean up
          this.removeDeepLinkHandler();
          
          resolve(result);
        } catch (error: any) {
          this.removeDeepLinkHandler();
          reject(error);
        }
      };

      this.setDeepLinkHandler(handleDeepLink);

      // Open OAuth URL
      this.openAuthUrl(authUrl);

      // Timeout after 5 minutes
      setTimeout(() => {
        this.removeDeepLinkHandler();
        reject(new Error('Authentication timed out'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Login with Google
   */
  async loginWithGoogle(): Promise<MobileOAuthResult> {
    return this.login('google');
  }

  /**
   * Login with GitHub
   */
  async loginWithGitHub(): Promise<MobileOAuthResult> {
    return this.login('github');
  }

  /**
   * Login with Microsoft
   */
  async loginWithMicrosoft(): Promise<MobileOAuthResult> {
    return this.login('microsoft');
  }

  /**
   * Handle deep link callback
   */
  async handleDeepLink(url: string): Promise<MobileOAuthResult> {
    const callbackData = this.parseCallbackUrl(url);
    const provider = this.extractProviderFromUrl(url);
    
    if (!provider) {
      throw new Error('Unable to determine OAuth provider from callback URL');
    }

    return await this.oauthHandler.handleCallback(provider, 'mobile', callbackData);
  }

  /**
   * Open OAuth URL using platform-specific method
   */
  private openAuthUrl(url: string): void {
    try {
      // Try React Native Linking first
      const Linking = this.getLinking();
      if (Linking) {
        Linking.openURL(url);
        return;
      }

      // Try Expo WebBrowser
      const WebBrowser = this.getWebBrowser();
      if (WebBrowser) {
        WebBrowser.openBrowserAsync(url, {
          ...this.config.browserOptions,
          dismissButtonStyle: this.config.browserOptions.dismissButtonStyle as any
        });
        return;
      }

      // Fallback
      console.log('Open this URL in your browser:', url);
    } catch (error) {
      console.error('Failed to open OAuth URL:', error);
      console.log('Please open this URL manually:', url);
    }
  }

  /**
   * Set up deep link handler
   */
  private setDeepLinkHandler(handler: (url: string) => void): void {
    this.deepLinkHandler = handler;

    try {
      // React Native Linking
      const Linking = this.getLinking();
      if (Linking) {
        Linking.addEventListener('url', this.handleLinkingUrl);
        return;
      }

      // Expo Linking
      const ExpoLinking = this.getExpoLinking();
      if (ExpoLinking) {
        const subscription = ExpoLinking.addEventListener('url', this.handleLinkingUrl);
        // Store subscription for cleanup
        (this as any)._linkingSubscription = subscription;
        return;
      }
    } catch (error) {
      console.error('Failed to set up deep link handler:', error);
    }
  }

  /**
   * Remove deep link handler
   */
  private removeDeepLinkHandler(): void {
    try {
      // React Native Linking
      const Linking = this.getLinking();
      if (Linking && Linking.removeEventListener) {
        Linking.removeEventListener('url', this.handleLinkingUrl);
      }

      // Expo Linking
      if ((this as any)._linkingSubscription) {
        (this as any)._linkingSubscription.remove();
        delete (this as any)._linkingSubscription;
      }
    } catch (error) {
      console.error('Failed to remove deep link handler:', error);
    }

    this.deepLinkHandler = undefined;
  }

  /**
   * Handle linking URL event
   */
  private handleLinkingUrl = (event: { url: string } | string) => {
    const url = typeof event === 'string' ? event : event.url;
    
    if (this.deepLinkHandler && url.startsWith(`${this.config.customScheme}://oauth/callback/`)) {
      this.deepLinkHandler(url);
    }
  };

  /**
   * Parse callback URL parameters
   */
  private parseCallbackUrl(url: string): OAuthCallbackData {
    try {
      const urlObj = new URL(url);
      return {
        code: urlObj.searchParams.get('code') || '',
        state: urlObj.searchParams.get('state') || '',
        error: urlObj.searchParams.get('error') || '',
        errorDescription: urlObj.searchParams.get('error_description') || ''
      };
    } catch (error) {
      throw new Error('Invalid callback URL format');
    }
  }

  /**
   * Extract provider from callback URL
   */
  private extractProviderFromUrl(url: string): string | null {
    const match = url.match(/\/oauth\/callback\/([^?]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get React Native Linking module
   */
  private getLinking(): any {
    try {
      return require('react-native').Linking;
    } catch {
      return null;
    }
  }

  /**
   * Get Expo WebBrowser module
   */
  private getWebBrowser(): any {
    try {
      return require('expo-web-browser');
    } catch {
      return null;
    }
  }

  /**
   * Get Expo Linking module
   */
  private getExpoLinking(): any {
    try {
      return require('expo-linking');
    } catch {
      return null;
    }
  }

  /**
   * React Native Hook for OAuth
   */
  static createUseAuth() {
    return function useAuth() {
      // This would need React Native context implementation
      return {
        isAuthenticated: false,
        user: null,
        loading: true,
        login: async (provider: string) => {
          // Implementation would go here
        },
        logout: async () => {
          // Implementation would go here
        }
      };
    };
  }

  /**
   * Setup deep linking for the app
   */
  static setupDeepLinking(customScheme: string = 'recoder') {
    return {
      // For React Navigation
      linking: {
        prefixes: [customScheme + '://'],
        config: {
          screens: {
            OAuthCallback: 'oauth/callback/:provider',
          },
        },
      },
      
      // For Expo app.json
      expoConfig: {
        scheme: customScheme,
        ios: {
          bundleIdentifier: 'com.recoder.app',
        },
        android: {
          package: 'com.recoder.app',
          intentFilters: [
            {
              action: 'VIEW',
              data: {
                scheme: customScheme,
              },
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        },
      }
    };
  }

  /**
   * Get available OAuth providers
   */
  getAvailableProviders(): string[] {
    return this.oauthHandler.getSupportedProviders().map(p => p.name);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authClient.isAuthenticated();
  }

  /**
   * Get current user
   */
  getCurrentUser(): any {
    return this.authClient.getUser();
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.authClient.logout();
  }
}

export default MobileOAuthHandler;