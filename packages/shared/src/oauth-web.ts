/**
 * Web OAuth Implementation
 * Handles OAuth flows for web platforms (React/Next.js)
 */

import { OAuthHandler, OAuthCallbackData } from './oauth-handler';
import { AuthClient } from './auth-client';

export interface WebOAuthConfig {
  popupMode?: boolean;
  redirectMode?: boolean;
  popupOptions?: {
    width?: number;
    height?: number;
    centerScreen?: boolean;
  };
}

export interface WebOAuthResult {
  success: boolean;
  user?: any;
  tokens?: any;
  error?: string;
}

export class WebOAuthHandler {
  private oauthHandler: OAuthHandler;
  private authClient: AuthClient;
  private config: Required<WebOAuthConfig>;

  constructor(authClient: AuthClient, config: WebOAuthConfig = {}) {
    this.authClient = authClient;
    this.oauthHandler = new OAuthHandler(authClient);
    this.config = {
      popupMode: config.popupMode ?? true,
      redirectMode: config.redirectMode ?? false,
      popupOptions: {
        width: 600,
        height: 700,
        centerScreen: true,
        ...config.popupOptions
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
   * Start OAuth flow with popup
   */
  async loginWithPopup(provider: string): Promise<WebOAuthResult> {
    if (typeof window === 'undefined' || !window) {
      throw new Error('Popup authentication only available in browser environment');
    }

    const authUrl = this.oauthHandler.generateAuthUrl(provider, 'web');
    
    return new Promise((resolve, reject) => {
      const popup = this.openPopup(authUrl);
      
      if (!popup) {
        reject(new Error('Failed to open popup window. Please disable popup blocker.'));
        return;
      }

      // Monitor popup
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          reject(new Error('Authentication cancelled by user'));
        }
      }, 1000);

      // Listen for message from popup
      const messageHandler = async (event: MessageEvent) => {
        if (typeof window !== 'undefined' && window && event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === 'OAUTH_CALLBACK') {
          clearInterval(checkClosed);
          popup.close();
          if (typeof window !== 'undefined' && window) {
            window.removeEventListener('message', messageHandler);
          }

          try {
            const result = await this.oauthHandler.handleCallback(
              provider,
              'web',
              event.data.callbackData as OAuthCallbackData
            );
            resolve(result);
          } catch (error: any) {
            reject(error);
          }
        }
      };

      if (typeof window !== 'undefined' && window) {
        window.addEventListener('message', messageHandler);
      }

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
        if (!popup.closed) {
          popup.close();
        }
        if (typeof window !== 'undefined' && window) {
          window.removeEventListener('message', messageHandler);
        }
        reject(new Error('Authentication timed out'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Start OAuth flow with redirect
   */
  loginWithRedirect(provider: string): void {
    if (typeof window === 'undefined' || !window) {
      throw new Error('Redirect authentication only available in browser environment');
    }

    const authUrl = this.oauthHandler.generateAuthUrl(provider, 'web');
    window.location.href = authUrl;
  }

  /**
   * Handle OAuth callback (for redirect flow)
   */
  async handleCallback(provider: string): Promise<WebOAuthResult> {
    if (typeof window === 'undefined' || !window) {
      throw new Error('OAuth callback handling only available in browser environment');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const callbackData: OAuthCallbackData = {
      code: urlParams.get('code') || '',
      state: urlParams.get('state') || '',
      error: urlParams.get('error') || '',
      errorDescription: urlParams.get('error_description') || ''
    };

    return await this.oauthHandler.handleCallback(provider, 'web', callbackData);
  }

  /**
   * Login with Google (popup)
   */
  async loginWithGoogle(): Promise<WebOAuthResult> {
    return this.loginWithPopup('google');
  }

  /**
   * Login with GitHub (popup)
   */
  async loginWithGitHub(): Promise<WebOAuthResult> {
    return this.loginWithPopup('github');
  }

  /**
   * Login with Microsoft (popup)
   */
  async loginWithMicrosoft(): Promise<WebOAuthResult> {
    return this.loginWithPopup('microsoft');
  }

  /**
   * Login with Google (redirect)
   */
  loginWithGoogleRedirect(): void {
    this.loginWithRedirect('google');
  }

  /**
   * Login with GitHub (redirect)
   */
  loginWithGitHubRedirect(): void {
    this.loginWithRedirect('github');
  }

  /**
   * Login with Microsoft (redirect)
   */
  loginWithMicrosoftRedirect(): void {
    this.loginWithRedirect('microsoft');
  }

  /**
   * Open OAuth popup window
   */
  private openPopup(url: string): Window | null {
    if (typeof window === 'undefined' || !window) {
      return null;
    }

    const { width, height, centerScreen } = this.config.popupOptions;

    let left = 0;
    let top = 0;

    if (centerScreen && window.screen) {
      left = Math.round(window.screen.width / 2 - width! / 2);
      top = Math.round(window.screen.height / 2 - height! / 2);
    }

    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'toolbar=no',
      'location=no',
      'directories=no',
      'status=no',
      'menubar=no',
      'scrollbars=yes',
      'resizable=yes',
      'copyhistory=no'
    ].join(',');

    return window.open(url, 'oauth_popup', features);
  }

  /**
   * Get the OAuth callback script for popup
   * This should be included in the OAuth callback page
   */
  static getCallbackScript(): string {
    return `
      <script>
        // Extract callback data from URL
        const urlParams = new URLSearchParams(window.location.search);
        const callbackData = {
          code: urlParams.get('code'),
          state: urlParams.get('state'),
          error: urlParams.get('error'),
          errorDescription: urlParams.get('error_description')
        };

        // Send message to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_CALLBACK',
            callbackData
          }, window.location.origin);
          window.close();
        } else {
          // Fallback for redirect flow
          console.log('OAuth callback received:', callbackData);
        }
      </script>
    `;
  }

  /**
   * React Hook for OAuth
   */
  static createUseAuth() {
    return function useAuth() {
      const [isAuthenticated, setIsAuthenticated] = useState(false);
      const [user, setUser] = useState(null);
      const [loading, setLoading] = useState(true);
      
      // This would need to be implemented with React context
      // Placeholder for the pattern
      return {
        isAuthenticated,
        user,
        loading,
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
   * Next.js API route handler
   */
  static createNextAuthHandler(authClient: AuthClient) {
    return {
      // GET /api/auth/[...nextauth]
      async GET(request: Request) {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').slice(3); // Remove /api/auth/
        
        if (pathSegments[0] === 'callback') {
          const provider = pathSegments[1];
          const handler = new WebOAuthHandler(authClient);
          
          try {
            const result = await handler.handleCallback(provider);
            
            if (result.success) {
              // Redirect to success page or dashboard
              return Response.redirect(`${process.env['NEXTAUTH_URL']}/dashboard`);
            } else {
              // Redirect to error page
              return Response.redirect(`${process.env['NEXTAUTH_URL']}/auth/error?error=${encodeURIComponent(result.error!)}`);
            }
          } catch (error: any) {
            return Response.redirect(`${process.env['NEXTAUTH_URL']}/auth/error?error=${encodeURIComponent(error.message)}`);
          }
        }
        
        return new Response('Not Found', { status: 404 });
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

// React Hook (needs to be implemented with proper React context)
function useState<T>(initialValue: T): [T, (value: T) => void] {
  // This is a placeholder - in actual React app, use real useState
  return [initialValue, () => {}] as any;
}

export default WebOAuthHandler;