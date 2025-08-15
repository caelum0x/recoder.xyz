/**
 * Professional Desktop Authentication Service
 * Implements OAuth2 with PKCE for secure desktop authentication
 */

const { ipcMain } = require('electron');
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const keytar = require('keytar').default || require('keytar');

class DesktopAuthService {
  constructor() {
    this.serviceName = 'recoder-desktop';
    this.clientId = 'recoder-desktop-app';
    this.authServer = process.env.AUTH_SERVER || 'http://localhost:3001';
    this.currentUser = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    
    // IPC handlers are setup in main-professional.js
  }

  setupIPCHandlers() {
    ipcMain.handle('auth:login', () => this.initiateLogin());
    ipcMain.handle('auth:logout', () => this.logout());
    ipcMain.handle('auth:getUser', () => this.getCurrentUser());
    ipcMain.handle('auth:getToken', () => this.getValidToken());
    ipcMain.handle('auth:refreshToken', () => this.refreshAccessToken());
    ipcMain.handle('auth:checkStatus', () => this.checkAuthStatus());
  }

  /**
   * Generate PKCE challenge for secure OAuth flow
   */
  generatePKCEChallenge() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return { codeVerifier, codeChallenge };
  }

  /**
   * Initiate OAuth2 login flow with PKCE
   */
  async initiateLogin() {
    try {
      const { codeVerifier, codeChallenge } = this.generatePKCEChallenge();
      const state = crypto.randomBytes(16).toString('hex');
      
      // Store PKCE verifier securely
      await keytar.setPassword(this.serviceName, 'pkce_verifier', codeVerifier);
      await keytar.setPassword(this.serviceName, 'oauth_state', state);
      
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: this.clientId,
        redirect_uri: 'http://localhost:8080/auth/callback',
        scope: 'read write offline_access',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });
      
      const authUrl = `${this.authServer}/oauth/authorize?${authParams}`;
      
      // Open auth URL in system browser
      const { shell } = require('electron');
      await shell.openExternal(authUrl);
      
      // Start local callback server
      return this.startCallbackServer();
      
    } catch (error) {
      console.error('Auth initiation failed:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Start local server to handle OAuth callback
   */
  async startCallbackServer() {
    return new Promise((resolve, reject) => {
      const http = require('http');
      
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost:8080');
        
        if (url.pathname === '/auth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Error</h1><p>Authentication was cancelled or failed.</p>');
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          
          try {
            // Verify state parameter
            const storedState = await keytar.getPassword(this.serviceName, 'oauth_state');
            if (state !== storedState) {
              throw new Error('Invalid state parameter');
            }
            
            // Exchange code for tokens
            const tokens = await this.exchangeCodeForTokens(code);
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <h1>Authentication Successful!</h1>
              <p>You can now close this window and return to the Recoder Desktop app.</p>
              <script>window.close();</script>
            `);
            
            server.close();
            resolve(tokens);
            
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authentication Error</h1><p>${error.message}</p>`);
            server.close();
            reject(error);
          }
        }
      });
      
      server.listen(8080, 'localhost', () => {
        console.log('OAuth callback server started on http://localhost:8080');
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 300000);
    });
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(code) {
    try {
      const codeVerifier = await keytar.getPassword(this.serviceName, 'pkce_verifier');
      
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code: code,
        redirect_uri: 'http://localhost:8080/auth/callback',
        code_verifier: codeVerifier
      });
      
      const response = await fetch(`${this.authServer}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: tokenParams
      });
      
      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }
      
      const tokens = await response.json();
      
      // Store tokens securely
      await this.storeTokens(tokens);
      
      // Get user info
      await this.fetchUserInfo();
      
      // Clean up temporary data
      await keytar.deletePassword(this.serviceName, 'pkce_verifier');
      await keytar.deletePassword(this.serviceName, 'oauth_state');
      
      return {
        success: true,
        user: this.currentUser,
        accessToken: this.accessToken
      };
      
    } catch (error) {
      console.error('Token exchange failed:', error);
      throw error;
    }
  }

  /**
   * Store tokens securely in system keychain
   */
  async storeTokens(tokens) {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000);
    
    await keytar.setPassword(this.serviceName, 'access_token', this.accessToken);
    await keytar.setPassword(this.serviceName, 'refresh_token', this.refreshToken);
    await keytar.setPassword(this.serviceName, 'token_expires_at', this.tokenExpiresAt.toString());
  }

  /**
   * Load tokens from secure storage
   */
  async loadTokens() {
    try {
      this.accessToken = await keytar.getPassword(this.serviceName, 'access_token');
      this.refreshToken = await keytar.getPassword(this.serviceName, 'refresh_token');
      const expiresAt = await keytar.getPassword(this.serviceName, 'token_expires_at');
      this.tokenExpiresAt = expiresAt ? parseInt(expiresAt) : null;
      
      return !!this.accessToken;
    } catch (error) {
      console.error('Failed to load tokens:', error);
      return false;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken() {
    if (!this.accessToken) {
      await this.loadTokens();
    }
    
    if (!this.accessToken) {
      throw new Error('No authentication token available');
    }
    
    // Check if token is expired
    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt - 60000) { // Refresh 1 minute early
      await this.refreshAccessToken();
    }
    
    return this.accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    try {
      if (!this.refreshToken) {
        await this.loadTokens();
      }
      
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId
      });
      
      const response = await fetch(`${this.authServer}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: refreshParams
      });
      
      if (!response.ok) {
        throw new Error('Token refresh failed');
      }
      
      const tokens = await response.json();
      await this.storeTokens(tokens);
      
      return this.accessToken;
      
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear invalid tokens
      await this.logout();
      throw new Error('Authentication expired. Please log in again.');
    }
  }

  /**
   * Fetch current user information
   */
  async fetchUserInfo() {
    try {
      const token = await this.getValidToken();
      
      const response = await fetch(`${this.authServer}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }
      
      this.currentUser = await response.json();
      return this.currentUser;
      
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      throw error;
    }
  }

  /**
   * Get current user (from cache or server)
   */
  async getCurrentUser() {
    if (!this.currentUser) {
      try {
        await this.fetchUserInfo();
      } catch (error) {
        return null;
      }
    }
    return this.currentUser;
  }

  /**
   * Check authentication status
   */
  async checkAuthStatus() {
    try {
      const hasTokens = await this.loadTokens();
      if (!hasTokens) {
        return { authenticated: false, user: null };
      }
      
      const user = await this.getCurrentUser();
      return {
        authenticated: !!user,
        user: user,
        tokenValid: !!this.accessToken
      };
      
    } catch (error) {
      return { authenticated: false, user: null, error: error.message };
    }
  }

  /**
   * Logout and clear all stored data
   */
  async logout() {
    try {
      // Revoke tokens on server
      if (this.accessToken) {
        try {
          await fetch(`${this.authServer}/oauth/revoke`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ token: this.accessToken })
          });
        } catch (error) {
          console.warn('Failed to revoke token on server:', error);
        }
      }
      
      // Clear local data
      this.currentUser = null;
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiresAt = null;
      
      // Clear stored tokens
      await keytar.deletePassword(this.serviceName, 'access_token');
      await keytar.deletePassword(this.serviceName, 'refresh_token');
      await keytar.deletePassword(this.serviceName, 'token_expires_at');
      
      return { success: true };
      
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }
}

module.exports = { DesktopAuthService };