/**
 * CLI OAuth Implementation
 * Handles OAuth flows for the CLI platform
 */

import { OAuthHandler, OAuthCallbackData } from '@recoder/shared';
import { AuthClient } from '@recoder/shared';
import express from 'express';
import { Server } from 'http';
import chalk from 'chalk';

export interface CLIOAuthConfig {
  callbackPort?: number;
  openBrowser?: boolean;
  showUrl?: boolean;
}

export class CLIOAuthHandler {
  private oauthHandler: OAuthHandler;
  private authClient: AuthClient;
  private server?: Server;
  private config: Required<CLIOAuthConfig>;

  constructor(authClient: AuthClient, config: CLIOAuthConfig = {}) {
    this.authClient = authClient;
    this.oauthHandler = new OAuthHandler(authClient);
    this.config = {
      callbackPort: config.callbackPort || 3005,
      openBrowser: config.openBrowser ?? true,
      showUrl: config.showUrl ?? true
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.oauthHandler.on('authUrlGenerated', ({ provider, authUrl }) => {
      if (this.config.showUrl) {
        console.log(chalk.blue('\n🔗 OAuth Authentication URL:'));
        console.log(chalk.cyan(authUrl));
        console.log(chalk.yellow('\nIf the browser doesn\'t open automatically, copy and paste this URL.'));
      }
    });

    this.oauthHandler.on('authSuccess', ({ provider, user, isNewUser }) => {
      console.log(chalk.green(`\n✅ Successfully authenticated with ${provider}!`));
      console.log(chalk.blue(`Welcome${isNewUser ? '' : ' back'}, ${user.name || user.email}!`));
    });

    this.oauthHandler.on('authError', ({ provider, error }) => {
      console.error(chalk.red(`\n❌ Authentication failed with ${provider}: ${error}`));
    });
  }

  /**
   * Start OAuth flow for CLI
   */
  async login(provider: string): Promise<any> {
    console.log(chalk.blue(`\n🔐 Starting ${provider} authentication...`));
    
    // Start callback server
    await this.startCallbackServer();
    
    try {
      const result = await this.oauthHandler.startOAuthFlow(provider, 'cli', {
        redirectUri: `http://localhost:${this.config.callbackPort}/oauth/callback/${provider}`
      });

      if (result.success) {
        console.log(chalk.green('\n🎉 Authentication completed successfully!'));
        return result.user;
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } finally {
      await this.stopCallbackServer();
    }
  }

  /**
   * Login with Google
   */
  async loginWithGoogle(): Promise<any> {
    return this.login('google');
  }

  /**
   * Login with GitHub
   */
  async loginWithGitHub(): Promise<any> {
    return this.login('github');
  }

  /**
   * Login with Microsoft
   */
  async loginWithMicrosoft(): Promise<any> {
    return this.login('microsoft');
  }

  /**
   * Start local callback server
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const app = express();
      
      // Handle OAuth callbacks
      app.get('/oauth/callback/:provider', async (req, res) => {
        const { provider } = req.params;
        const callbackData: OAuthCallbackData = {
          code: req.query.code as string,
          state: req.query.state as string,
          error: req.query.error as string,
          errorDescription: req.query.error_description as string
        };

        try {
          await this.oauthHandler.completeOAuthFlow(provider, 'cli', callbackData);
          
          // Send success page
          res.send(this.getSuccessPage(provider));
        } catch (error: any) {
          console.error(chalk.red(`OAuth callback error: ${error.message}`));
          res.status(400).send(this.getErrorPage(error.message));
        }
      });

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ status: 'ok', platform: 'cli' });
      });

      this.server = app.listen(this.config.callbackPort, 'localhost', () => {
        console.log(chalk.dim(`OAuth callback server started on port ${this.config.callbackPort}`));
        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(chalk.red(`Port ${this.config.callbackPort} is already in use. Please close other applications or use a different port.`));
        }
        reject(error);
      });
    });
  }

  /**
   * Stop callback server
   */
  private async stopCallbackServer(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log(chalk.dim('OAuth callback server stopped'));
          resolve();
        });
      });
    }
  }

  /**
   * Get success HTML page
   */
  private getSuccessPage(provider: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recoder Authentication Success</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 2rem;
            border-radius: 1rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          }
          .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          h1 {
            margin-bottom: 1rem;
            font-size: 2rem;
          }
          p {
            font-size: 1.1rem;
            opacity: 0.9;
            margin-bottom: 1.5rem;
          }
          .close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
          }
          .close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Authentication Successful!</h1>
          <p>You have successfully authenticated with ${provider.charAt(0).toUpperCase() + provider.slice(1)}.</p>
          <p>You can now close this window and return to the CLI.</p>
          <button class="close-btn" onclick="window.close()">Close Window</button>
        </div>
        <script>
          // Auto-close after 3 seconds if possible
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {
              // Window closing might be blocked
            }
          }, 3000);
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Get error HTML page
   */
  private getErrorPage(error: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recoder Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 2rem;
            border-radius: 1rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            max-width: 500px;
          }
          .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          h1 {
            margin-bottom: 1rem;
            font-size: 2rem;
          }
          .error-message {
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
            font-family: monospace;
            font-size: 0.9rem;
          }
          .close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
          }
          .close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Authentication Failed</h1>
          <div class="error-message">${error}</div>
          <p>Please close this window and try again.</p>
          <button class="close-btn" onclick="window.close()">Close Window</button>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * List available OAuth providers
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
    console.log(chalk.blue('\n👋 Logging out...'));
    await this.authClient.logout();
    console.log(chalk.green('✅ Successfully logged out'));
  }
}

export default CLIOAuthHandler;