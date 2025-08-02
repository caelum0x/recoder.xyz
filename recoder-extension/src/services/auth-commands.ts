/**
 * Authentication Commands for Recoder VS Code Extension
 * Provides authentication functionality integrated with VS Code UI
 */

import * as vscode from 'vscode';
import { ExtensionBackendClient } from './backend-client';
import { UnifiedAuthProvider } from './unified-auth-provider';

export class AuthCommands {
  private backendClient: ExtensionBackendClient;
  private statusBarItem: vscode.StatusBarItem;
  private unifiedAuthProvider: UnifiedAuthProvider | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.backendClient = new ExtensionBackendClient(context);
    
    // Get unified auth provider if available
    try {
      this.unifiedAuthProvider = new UnifiedAuthProvider(context);
    } catch (error) {
      console.warn('Unified auth provider not available:', error);
    }
    
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 
      100
    );
    this.statusBarItem.command = 'recoder.showAuthMenu';
    this.statusBarItem.show();
    
    // Initialize status bar
    this.updateStatusBar();
    
    // Register commands
    this.registerCommands(context);

    // Mark extension as active on startup if authenticated
    this.initializePlatformStatus();
  }

  private async initializePlatformStatus(): Promise<void> {
    if (this.backendClient.isAuthenticated()) {
      await this.backendClient.updatePlatformStatus('extension', true);
      
      // Sync session on startup
      try {
        await this.backendClient.syncSession();
        this.updateStatusBar();
      } catch (error) {
        console.warn('Could not sync session on startup');
      }
    }
  }

  private registerCommands(context: vscode.ExtensionContext): void {
    // Main auth menu command
    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.showAuthMenu', () => this.showAuthMenu())
    );

    // Individual auth commands
    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.login', () => this.handleLogin())
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.register', () => this.handleRegister())
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.logout', () => this.handleLogout())
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.showStatus', () => this.showUserStatus())
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.syncSession', () => this.syncSession())
    );

    // Enhanced auth commands with unified auth
    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.showUnifiedAuth', () => this.showUnifiedAuthMenu())
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('recoder.authenticateWithVSCode', () => this.authenticateWithVSCode())
    );
  }

  private async showAuthMenu(): Promise<void> {
    if (!this.backendClient.isAuthenticated()) {
      // Show login/register options
      const action = await vscode.window.showQuickPick([
        {
          label: '$(sign-in) Login',
          description: 'Sign in to your recoder.xyz account',
          action: 'login'
        },
        {
          label: '$(person-add) Register',
          description: 'Create a new recoder.xyz account', 
          action: 'register'
        }
      ], {
        placeHolder: 'Authenticate with recoder.xyz for cross-platform sync'
      });

      if (action?.action === 'login') {
        await this.handleLogin();
      } else if (action?.action === 'register') {
        await this.handleRegister();
      }
    } else {
      // Show user menu
      const session = this.backendClient.getCurrentSession()!;
      const action = await vscode.window.showQuickPick([
        {
          label: `$(person) ${session.email}`,
          description: `${session.plan.toUpperCase()} plan`,
          action: 'status'
        },
        {
          label: '$(sync) Sync Session',
          description: 'Sync session across all platforms',
          action: 'sync'
        },
        {
          label: '$(info) Show Status',
          description: 'View detailed account information',
          action: 'status'
        },
        {
          label: '$(sign-out) Logout',
          description: 'Sign out from recoder.xyz',
          action: 'logout'
        }
      ], {
        placeHolder: 'recoder.xyz Account'
      });

      switch (action?.action) {
        case 'sync':
          await this.syncSession();
          break;
        case 'status':
          await this.showUserStatus();
          break;
        case 'logout':
          await this.handleLogout();
          break;
      }
    }
  }

  private async handleLogin(): Promise<void> {
    try {
      // Check backend availability
      const isBackendAvailable = await this.backendClient.isBackendAvailable();
      if (!isBackendAvailable) {
        vscode.window.showErrorMessage(
          'Backend server is not available. Please check your internet connection or try again later.'
        );
        return;
      }

      // Get email
      const email = await vscode.window.showInputBox({
        prompt: 'Enter your email address',
        placeHolder: 'email@example.com',
        validateInput: (value) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value) ? null : 'Please enter a valid email address';
        }
      });

      if (!email) return;

      // Get password
      const password = await vscode.window.showInputBox({
        prompt: 'Enter your password',
        password: true
      });

      if (!password) return;

      // Show progress
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Signing in to recoder.xyz...',
        cancellable: false
      }, async () => {
        const session = await this.backendClient.authenticate({ email, password });
        
        // Update platform status
        await this.backendClient.updatePlatformStatus('extension', true);
        
        this.updateStatusBar();

        vscode.window.showInformationMessage(
          `✅ Successfully signed in as ${session.email} (${session.plan} plan). ` +
          `Your session is now synced across all recoder.xyz platforms.`
        );
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Login failed: ${error.message}`);
    }
  }

  private async handleRegister(): Promise<void> {
    try {
      // Check backend availability
      const isBackendAvailable = await this.backendClient.isBackendAvailable();
      if (!isBackendAvailable) {
        vscode.window.showErrorMessage(
          'Backend server is not available. Please check your internet connection or try again later.'
        );
        return;
      }

      // Get name
      const name = await vscode.window.showInputBox({
        prompt: 'Enter your full name',
        placeHolder: 'John Doe',
        validateInput: (value) => {
          return value.trim().length >= 2 ? null : 'Name must be at least 2 characters';
        }
      });

      if (!name) return;

      // Get email
      const email = await vscode.window.showInputBox({
        prompt: 'Enter your email address',
        placeHolder: 'email@example.com',
        validateInput: (value) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value) ? null : 'Please enter a valid email address';
        }
      });

      if (!email) return;

      // Get password
      const password = await vscode.window.showInputBox({
        prompt: 'Enter your password (min 8 characters)',
        password: true,
        validateInput: (value) => {
          return value.length >= 8 ? null : 'Password must be at least 8 characters';
        }
      });

      if (!password) return;

      // Confirm password
      const confirmPassword = await vscode.window.showInputBox({
        prompt: 'Confirm your password',
        password: true,
        validateInput: (value) => {
          return value === password ? null : 'Passwords do not match';
        }
      });

      if (!confirmPassword) return;

      // Show progress
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Creating your recoder.xyz account...',
        cancellable: false
      }, async () => {
        const session = await this.backendClient.register({ email, password, name });
        
        // Update platform status
        await this.backendClient.updatePlatformStatus('extension', true);
        
        this.updateStatusBar();

        vscode.window.showInformationMessage(
          `🎉 Account created successfully! Welcome ${name}! ` +
          `Your account is ready to use across all recoder.xyz platforms.`
        );
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Registration failed: ${error.message}`);
    }
  }

  private async handleLogout(): Promise<void> {
    const session = this.backendClient.getCurrentSession();
    if (!session) {
      vscode.window.showWarningMessage('You are not currently logged in.');
      return;
    }

    const confirm = await vscode.window.showQuickPick([
      {
        label: '$(sign-out) Logout from extension only',
        description: 'Stay logged in on other platforms',
        action: 'extension'
      },
      {
        label: '$(sign-out) Logout from all platforms',
        description: 'Sign out from CLI, web, extension, and router',
        action: 'all'
      },
      {
        label: '$(close) Cancel',
        description: 'Keep current session',
        action: 'cancel'
      }
    ], {
      placeHolder: `Logout from account: ${session.email}`
    });

    if (!confirm || confirm.action === 'cancel') return;

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Signing out...',
        cancellable: false
      }, async () => {
        // Update platform status before logout
        await this.backendClient.updatePlatformStatus('extension', false);
        
        if (confirm.action === 'all') {
          // Logout from all platforms
          await this.backendClient.updatePlatformStatus('cli', false);
          await this.backendClient.updatePlatformStatus('web', false);
          await this.backendClient.updatePlatformStatus('router', false);
        }

        await this.backendClient.logout();
        this.updateStatusBar();

        const message = confirm.action === 'all' 
          ? 'Successfully logged out from all recoder.xyz platforms.'
          : 'Successfully logged out from VS Code extension. You remain logged in on other platforms.';
        
        vscode.window.showInformationMessage(`✅ ${message}`);
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Logout failed: ${error.message}`);
    }
  }

  private async showUserStatus(): Promise<void> {
    const session = this.backendClient.getCurrentSession();
    if (!session) {
      vscode.window.showWarningMessage('You are not currently logged in.');
      return;
    }

    // Check if backend is available for sync
    const isBackendAvailable = await this.backendClient.isBackendAvailable();
    const backendStatus = isBackendAvailable ? '✅ Connected' : '⚠️ Offline';

    const platformStatus = Object.entries(session.platforms)
      .map(([platform, connected]) => `${platform}: ${connected ? '✅' : '❌'}`)
      .join(', ');

    const quotaPercentage = Math.round((session.quotas.usedRequests / session.quotas.totalRequests) * 100);
    const quotaStatus = quotaPercentage >= 90 ? '🔴 Near limit' : quotaPercentage >= 70 ? '🟡 High usage' : '🟢 Healthy';

    const statusMessage = [
      `📧 Email: ${session.email}`,
      `📋 Plan: ${session.plan.toUpperCase()}`,
      `📊 Quota: ${session.quotas.usedRequests}/${session.quotas.totalRequests} (${quotaPercentage}%) ${quotaStatus}`,
      `🔄 Resets: ${new Date(session.quotas.resetDate).toLocaleDateString()}`,
      `🌐 Platforms: ${platformStatus}`,
      `🔗 Backend: ${backendStatus}`
    ].join('\n');

    const action = await vscode.window.showInformationMessage(
      statusMessage,
      { modal: true },
      'Sync Session',
      'Close'
    );

    if (action === 'Sync Session') {
      await this.syncSession();
    }
  }

  private async syncSession(): Promise<void> {
    if (!this.backendClient.isAuthenticated()) {
      vscode.window.showWarningMessage('You must be logged in to sync session.');
      return;
    }

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Syncing session across platforms...',
        cancellable: false
      }, async () => {
        const syncedSession = await this.backendClient.syncSession();
        this.updateStatusBar();

        if (syncedSession) {
          vscode.window.showInformationMessage('🔄 Session synced successfully across all platforms.');
        } else {
          vscode.window.showWarningMessage('Could not sync session with backend.');
        }
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Session sync failed: ${error.message}`);
    }
  }

  private updateStatusBar(): void {
    this.backendClient.updateStatusBar(this.statusBarItem);
  }

  /**
   * Get the backend client instance for use by other services
   */
  getBackendClient(): ExtensionBackendClient {
    return this.backendClient;
  }

  /**
   * Show unified authentication menu with multiple methods
   */
  private async showUnifiedAuthMenu(): Promise<void> {
    if (!this.unifiedAuthProvider) {
      vscode.window.showErrorMessage('Unified authentication not available');
      return;
    }

    const method = await vscode.window.showQuickPick([
      {
        label: '$(globe) OAuth (Browser)',
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
      },
      {
        label: '$(account) VS Code Native',
        description: 'Use VS Code built-in authentication',
        detail: 'Integrate with VS Code account system',
        method: 'vscode'
      }
    ], {
      placeHolder: 'Choose authentication method for Recoder',
      ignoreFocusOut: true
    });

    if (!method) return;

    try {
      switch (method.method) {
        case 'oauth':
        case 'device':
        case 'apikey':
          await this.unifiedAuthProvider.createSession(['basic', 'generate']);
          break;
        case 'vscode':
          await this.authenticateWithVSCode();
          break;
      }

      this.updateStatusBar();
      vscode.window.showInformationMessage('✅ Successfully authenticated with Recoder!');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Authenticate using VS Code's built-in authentication
   */
  private async authenticateWithVSCode(): Promise<void> {
    try {
      // Try to get a session with the unified auth provider
      const sessions = await this.unifiedAuthProvider?.getSessions(['basic']);
      
      if (sessions && sessions.length > 0) {
        vscode.window.showInformationMessage(`Already authenticated as ${sessions[0].account.label}`);
        return;
      }

      // Create new session
      const session = await this.unifiedAuthProvider?.createSession(['basic', 'generate']);
      
      if (session) {
        vscode.window.showInformationMessage(`✅ Authenticated as ${session.account.label}`);
        this.updateStatusBar();
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`VS Code authentication failed: ${error.message}`);
    }
  }

  /**
   * Get current unified session
   */
  async getCurrentUnifiedSession() {
    return await this.unifiedAuthProvider?.getCurrentSession();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
    if (this.unifiedAuthProvider) {
      this.unifiedAuthProvider.dispose();
    }
  }
}

export default AuthCommands;