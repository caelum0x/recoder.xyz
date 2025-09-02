/**
 * Unified Authentication Provider for VS Code Extension
 * Integrates with the recoder.xyz unified auth system
 */

import * as vscode from 'vscode';
import { createPlatformAuth } from '../../packages/unified-auth/src/factory';

export interface UnifiedSession {
  userId: string;
  email: string;
  name: string;
  platform: 'extension';
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

export interface DeviceFlowResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface APIKeyValidation {
  valid: boolean;
  userId?: string;
  scopes?: string[];
  restrictions?: any;
}

export class UnifiedAuthProvider implements vscode.AuthenticationProvider, vscode.Disposable {
  private static readonly AUTH_TYPE = 'recoder';
  private static readonly CLIENT_ID = 'vscode-extension';
  
  private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: vscode.Disposable;
  private _sessions: Map<string, UnifiedSession> = new Map();
  private _unifiedAuth: ReturnType<typeof createPlatformAuth>;

  constructor(private context: vscode.ExtensionContext) {
    this._disposable = vscode.Disposable.from(
      vscode.authentication.registerAuthenticationProvider(
        UnifiedAuthProvider.AUTH_TYPE,
        'Recoder',
        this,
        { supportsMultipleAccounts: false }
      )
    );

    // Initialize unified auth for extension platform
    this._unifiedAuth = createPlatformAuth('extension', {
      apiUrl: vscode.workspace.getConfiguration('recoder').get('backendUrl') || 'https://api.recoder.xyz',
      clientId: UnifiedAuthProvider.CLIENT_ID,
    });

    // Load existing sessions from secret storage
    this.loadSessions();
  }

  get onDidChangeSessions(): vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this._sessionChangeEmitter.event;
  }

  /**
   * Get sessions - required by VS Code AuthenticationProvider
   */
  async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
    const sessions = Array.from(this._sessions.values())
      .filter(session => !scopes || scopes.every(scope => session.scopes.includes(scope)))
      .map(session => this.toVSCodeSession(session));

    return sessions;
  }

  /**
   * Create session - implements multiple auth methods using unified auth
   */
  async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
    try {
      // Check if already authenticated
      const existingSession = await this._unifiedAuth.auth.getCurrentSession();
      if (existingSession) {
        const unifiedSession = this.convertToUnifiedSession(existingSession);
        await this.storeSession(unifiedSession);
        this._sessions.set(unifiedSession.userId, unifiedSession);
        return this.toVSCodeSession(unifiedSession);
      }

      // Show authentication method selection
      const authMethod = await this.selectAuthMethod();
      if (authMethod === 'cancelled') {
        throw new Error('Authentication cancelled');
      }

      let credentials: any;
      
      switch (authMethod) {
        case 'oauth':
          credentials = await this.promptForOAuthCredentials();
          break;
        case 'device':
          credentials = await this.promptForDeviceFlow();
          break;
        case 'apikey':
          credentials = await this.promptForAPIKey();
          break;
        default:
          throw new Error('Invalid authentication method');
      }

      // Use unified auth to login
      const { session } = await this._unifiedAuth.auth.login(credentials);
      
      // Convert to unified session format
      const unifiedSession = this.convertToUnifiedSession(session);
      
      // Store session
      await this.storeSession(unifiedSession);
      this._sessions.set(unifiedSession.userId, unifiedSession);

      // Notify VS Code of session change
      this._sessionChangeEmitter.fire({
        added: [this.toVSCodeSession(unifiedSession)],
        removed: [],
        changed: []
      });

      return this.toVSCodeSession(unifiedSession);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Authentication failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove session
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = Array.from(this._sessions.values())
      .find(s => this.getSessionId(s) === sessionId);

    if (session) {
      // Use unified auth to logout
      try {
        await this._unifiedAuth.auth.logout();
      } catch (error) {
        console.warn('Failed to logout from unified auth:', error);
      }

      // Remove from local storage
      this._sessions.delete(session.userId);
      await this.removeStoredSession(session.userId);

      // Notify VS Code
      this._sessionChangeEmitter.fire({
        added: [],
        removed: [this.toVSCodeSession(session)],
        changed: []
      });
    }
  }

  /**
   * Convert unified auth session to local format
   */
  private convertToUnifiedSession(session: any): UnifiedSession {
    return {
      userId: session.userId,
      email: session.email,
      name: session.username || session.email,
      platform: 'extension',
      accessToken: '', // Will be handled by unified auth
      refreshToken: '',
      scopes: ['basic', 'generate'],
      expiresAt: session.expiresAt,
      riskLevel: 'low',
      metadata: session.metadata || {}
    };
  }

  /**
   * Prompt for OAuth credentials
   */
  private async promptForOAuthCredentials(): Promise<any> {
    // For OAuth, we might redirect to browser
    const email = await vscode.window.showInputBox({
      prompt: 'Enter your email for OAuth authentication',
      placeHolder: 'email@example.com',
      validateInput: (value) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value) ? null : 'Please enter a valid email address';
      }
    });

    if (!email) throw new Error('Email is required');

    const password = await vscode.window.showInputBox({
      prompt: 'Enter your password',
      password: true
    });

    if (!password) throw new Error('Password is required');

    return { email, password };
  }

  /**
   * Prompt for device flow authentication
   */
  private async promptForDeviceFlow(): Promise<any> {
    // For device flow, we'll use email/password for now
    // In a real implementation, this would initiate device flow
    return await this.promptForOAuthCredentials();
  }

  /**
   * Prompt for API key
   */
  private async promptForAPIKey(): Promise<any> {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Recoder API key',
      placeHolder: 'rcd_xxxxxxxx_xxxxxxxx...',
      password: true,
      validateInput: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('rcd_')) return 'Invalid API key format';
        if (value.length < 40) return 'API key is too short';
        return null;
      }
    });

    if (!apiKey) throw new Error('API key is required');

    // For API key auth, we'll use a mock email
    return { email: 'api@recoder.xyz', password: apiKey };
  }

  /**
   * Select authentication method
   */
  private async selectAuthMethod(): Promise<string> {
    const method = await vscode.window.showQuickPick([
      {
        label: '$(globe) OAuth (Recommended)',
        description: 'Sign in through your browser with GitHub or Google',
        detail: 'Most secure and convenient method',
        method: 'oauth'
      },
      {
        label: '$(device-mobile) Device Flow',
        description: 'Use a code to authorize this device',
        detail: 'Perfect for secure or restricted environments',
        method: 'device'
      },
      {
        label: '$(key) API Key',
        description: 'Use an existing API key',
        detail: 'For automation and programmatic access',
        method: 'apikey'
      }
    ], {
      placeHolder: 'Choose authentication method for Recoder',
      ignoreFocusOut: true
    });

    return method?.method || 'cancelled';
  }

  /**
   * OAuth authentication using VS Code's built-in provider
   */
  private async authenticateWithOAuth(scopes: string[]): Promise<UnifiedSession> {
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Authenticating with Recoder...',
      cancellable: true
    }, async (progress, token) => {
      progress.report({ message: 'Opening browser...' });

      // Use VS Code's built-in OAuth flow
      const authUrl = `${this.getBaseUrl()}/auth/signin?callbackUrl=${encodeURIComponent(`${this.getBaseUrl()}/auth/vscode-callback`)}`;
      
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));

      progress.report({ message: 'Waiting for authorization...' });

      // Poll for completion
      return new Promise<UnifiedSession>((resolve, reject) => {
        const pollInterval = setInterval(async () => {
          if (token.isCancellationRequested) {
            clearInterval(pollInterval);
            reject(new Error('Authentication cancelled by user'));
            return;
          }

          try {
            // Check if OAuth callback has created a session
            const session = await this.checkOAuthCallback();
            if (session) {
              clearInterval(pollInterval);
              resolve(session);
            }
          } catch (error) {
            // Continue polling
          }
        }, 2000);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          reject(new Error('Authentication timeout'));
        }, 300000);
      });
    });
  }

  /**
   * Device flow authentication
   */
  private async authenticateWithDeviceFlow(scopes: string[]): Promise<UnifiedSession> {
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Device Authentication',
      cancellable: true
    }, async (progress, token) => {
      progress.report({ message: 'Initiating device flow...' });

      // Start device flow
      const deviceFlow = await this.initiateDeviceFlow();

      // Show user code and open browser
      const openBrowser = await vscode.window.showInformationMessage(
        `Device Authorization Required\n\nCode: ${deviceFlow.userCode}\n\nClick "Open Browser" to complete authorization.`,
        { modal: true },
        'Open Browser',
        'I\'ll do it manually'
      );

      if (openBrowser === 'Open Browser') {
        await vscode.env.openExternal(vscode.Uri.parse(deviceFlow.verificationUriComplete));
      } else {
        // Show the manual instructions
        await vscode.window.showInformationMessage(
          `Manual Authorization:\n\n1. Go to: ${deviceFlow.verificationUri}\n2. Enter code: ${deviceFlow.userCode}`,
          { modal: true },
          'OK'
        );
      }

      progress.report({ message: 'Waiting for device authorization...' });

      // Poll for authorization
      return new Promise<UnifiedSession>((resolve, reject) => {
        const pollInterval = setInterval(async () => {
          if (token.isCancellationRequested) {
            clearInterval(pollInterval);
            reject(new Error('Device authorization cancelled'));
            return;
          }

          try {
            const result = await this.pollDeviceAuthorization(deviceFlow.deviceCode);
            
            if (result.status === 'authorized' && result.accessToken) {
              clearInterval(pollInterval);
              
              // Validate and get full session
              const session = await this.validateToken(result.accessToken);
              resolve(session);
            } else if (result.status === 'denied') {
              clearInterval(pollInterval);
              reject(new Error('Device authorization denied'));
            } else if (result.status === 'expired') {
              clearInterval(pollInterval);
              reject(new Error('Device authorization expired'));
            }
          } catch (error) {
            clearInterval(pollInterval);
            reject(error);
          }
        }, deviceFlow.interval * 1000);

        // Timeout
        setTimeout(() => {
          clearInterval(pollInterval);
          reject(new Error('Device authorization timeout'));
        }, deviceFlow.expiresIn * 1000);
      });
    });
  }

  /**
   * API Key authentication
   */
  private async authenticateWithAPIKey(scopes: string[]): Promise<UnifiedSession> {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Recoder API key',
      placeHolder: 'rcd_xxxxxxxx_xxxxxxxx...',
      password: true,
      validateInput: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('rcd_')) return 'Invalid API key format';
        if (value.length < 40) return 'API key is too short';
        return null;
      },
      ignoreFocusOut: true
    });

    if (!apiKey) {
      throw new Error('API key is required');
    }

    // Validate API key
    const validation = await this.validateAPIKey(apiKey);
    if (!validation.valid || !validation.userId) {
      throw new Error('Invalid API key');
    }

    // Check scopes
    const hasRequiredScopes = scopes.every(scope => 
      validation.scopes?.includes(scope) || validation.scopes?.includes('admin')
    );

    if (!hasRequiredScopes) {
      throw new Error(`API key does not have required scopes: ${scopes.join(', ')}`);
    }

    // Get user info and create session
    const userInfo = await this.getUserInfo(apiKey);
    
    return {
      userId: validation.userId,
      email: userInfo.email,
      name: userInfo.name,
      platform: 'extension',
      accessToken: apiKey, // API key acts as long-lived token
      refreshToken: '', // API keys don't need refresh
      scopes: validation.scopes || [],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      riskLevel: 'low',
      metadata: {
        authMethod: 'apikey',
        restrictions: validation.restrictions
      }
    };
  }

  /**
   * API helper methods
   */
  private async initiateDeviceFlow(): Promise<DeviceFlowResponse> {
    const response = await fetch(`${this.getBaseUrl()}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to initiate device flow');
    }

    return await response.json();
  }

  private async pollDeviceAuthorization(deviceCode: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/api/auth/device?device_code=${deviceCode}`);
    
    if (!response.ok) {
      throw new Error('Failed to poll device authorization');
    }

    return await response.json();
  }

  private async validateAPIKey(apiKey: string): Promise<APIKeyValidation> {
    const response = await fetch(`${this.getBaseUrl()}/api/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });

    if (!response.ok) {
      throw new Error('Failed to validate API key');
    }

    return await response.json();
  }

  private async validateToken(token: string): Promise<UnifiedSession> {
    const response = await fetch(`${this.getBaseUrl()}/api/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error('Failed to validate token');
    }

    const validation = await response.json();
    
    if (!validation.valid) {
      throw new Error('Invalid token');
    }

    // Get user info
    const userInfo = await this.getUserInfo(token);

    return {
      userId: validation.userId,
      email: userInfo.email,
      name: userInfo.name,
      platform: 'extension',
      accessToken: token,
      refreshToken: '', // Will be set by token refresh
      scopes: validation.scopes || [],
      expiresAt: new Date(validation.expiresAt),
      riskLevel: 'low',
      metadata: { authMethod: 'token' }
    };
  }

  private async getUserInfo(token: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/api/user/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return await response.json();
  }

  private async checkOAuthCallback(): Promise<UnifiedSession | null> {
    // This would check for a callback token or temporary credential
    // Implementation depends on OAuth callback mechanism
    return null;
  }

  private async revokeSession(session: UnifiedSession): Promise<void> {
    if (session.metadata?.authMethod === 'apikey') {
      // API keys are revoked differently
      return;
    }

    await fetch(`${this.getBaseUrl()}/api/auth/revoke`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ platform: 'extension' })
    });
  }

  /**
   * Session storage methods
   */
  private async loadSessions(): Promise<void> {
    try {
      const storedSessions = await this.context.secrets.get('recoder.sessions');
      if (storedSessions) {
        const sessions: UnifiedSession[] = JSON.parse(storedSessions);
        sessions.forEach(session => {
          session.expiresAt = new Date(session.expiresAt);
          this._sessions.set(session.userId, session);
        });
      }
    } catch (error) {
      console.warn('Failed to load stored sessions:', error);
    }
  }

  private async storeSession(session: UnifiedSession): Promise<void> {
    try {
      const sessions = Array.from(this._sessions.values());
      sessions.push(session);
      
      await this.context.secrets.store('recoder.sessions', JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to store session:', error);
      throw new Error('Failed to save authentication session');
    }
  }

  private async removeStoredSession(userId: string): Promise<void> {
    try {
      const sessions = Array.from(this._sessions.values())
        .filter(s => s.userId !== userId);
      
      await this.context.secrets.store('recoder.sessions', JSON.stringify(sessions));
    } catch (error) {
      console.warn('Failed to remove stored session:', error);
    }
  }

  /**
   * Helper methods
   */
  private toVSCodeSession(session: UnifiedSession): vscode.AuthenticationSession {
    return {
      id: this.getSessionId(session),
      accessToken: session.accessToken,
      account: {
        label: session.name,
        id: session.userId
      },
      scopes: session.scopes
    };
  }

  private getSessionId(session: UnifiedSession): string {
    return `${session.userId}_${session.platform}`;
  }

  private getBaseUrl(): string {
    return process.env.RECODER_API_URL || 'https://web.recoder.xyz';
  }

  /**
   * Public utility methods for extension
   */
  async getCurrentSession(): Promise<UnifiedSession | null> {
    // First check unified auth
    try {
      const session = await this._unifiedAuth.auth.getCurrentSession();
      if (session) {
        return this.convertToUnifiedSession(session);
      }
    } catch (error) {
      console.warn('Failed to get current session from unified auth:', error);
    }

    // Fallback to local sessions
    const sessions = Array.from(this._sessions.values());
    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Get the unified auth instance for direct access
   */
  getUnifiedAuth() {
    return this._unifiedAuth;
  }

  async refreshSession(session: UnifiedSession): Promise<UnifiedSession | null> {
    if (session.metadata?.authMethod === 'apikey') {
      // API keys don't need refresh
      return session;
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/api/auth/validate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      
      const refreshedSession: UnifiedSession = {
        ...session,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: new Date(result.expiresAt)
      };

      // Update stored session
      this._sessions.set(session.userId, refreshedSession);
      await this.storeSession(refreshedSession);

      return refreshedSession;
    } catch (error) {
      console.error('Failed to refresh session:', error);
      return null;
    }
  }

  dispose(): void {
    this._disposable.dispose();
    this._sessionChangeEmitter.dispose();
  }
}