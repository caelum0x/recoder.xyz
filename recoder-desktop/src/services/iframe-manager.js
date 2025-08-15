/**
 * Professional Iframe Security and Management System
 * Handles secure iframe loading with proper authentication and CSP
 */

const { ipcMain, session } = require('electron');

class IframeSecurityManager {
  constructor(authService, serviceDiscovery) {
    this.authService = authService;
    this.serviceDiscovery = serviceDiscovery;
    this.loadedIframes = new Map();
    this.securityPolicies = new Map();
    
    this.setupIPCHandlers();
    this.setupSecurityPolicies();
  }

  setupIPCHandlers() {
    ipcMain.handle('iframe:load', (event, appName, options = {}) => this.loadSecureIframe(appName, options));
    ipcMain.handle('iframe:reload', (event, appName) => this.reloadIframe(appName));
    ipcMain.handle('iframe:getStatus', (event, appName) => this.getIframeStatus(appName));
    ipcMain.handle('iframe:injectAuth', (event, appName) => this.injectAuthentication(appName));
    ipcMain.handle('iframe:clearSession', (event, appName) => this.clearIframeSession(appName));
  }

  /**
   * Setup security policies for different service types
   */
  setupSecurityPolicies() {
    // Define CSP and security policies for each service category
    this.securityPolicies.set('web-app', {
      allowedOrigins: ['http://localhost:*', 'https://localhost:*'],
      csp: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", "data:", "blob:", "https:"],
        'connect-src': ["'self'", "ws:", "wss:", "http:", "https:"],
        'frame-src': ["'self'"],
        'media-src': ["'self'", "blob:"],
        'font-src': ["'self'", "data:"]
      },
      permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
      sandbox: ['allow-same-origin', 'allow-scripts', 'allow-forms', 'allow-popups', 'allow-downloads']
    });

    this.securityPolicies.set('api', {
      allowedOrigins: ['http://localhost:*'],
      csp: {
        'default-src': ["'none'"],
        'connect-src': ["'self'"]
      },
      permissions: [],
      sandbox: ['allow-same-origin', 'allow-scripts']
    });

    this.securityPolicies.set('dev-server', {
      allowedOrigins: ['http://localhost:*'],
      csp: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["*"],
        'connect-src': ["*"],
        'frame-src': ["'self'"]
      },
      permissions: ['camera', 'microphone'],
      sandbox: ['allow-same-origin', 'allow-scripts', 'allow-forms', 'allow-popups']
    });
  }

  /**
   * Load iframe with proper security and authentication
   */
  async loadSecureIframe(appName, options = {}) {
    try {
      console.log(`🔒 Loading secure iframe for ${appName}...`);

      // Get service information
      const services = this.serviceDiscovery.getAllServices();
      const service = services.find(s => s.id === appName || s.name.toLowerCase().includes(appName));

      if (!service) {
        throw new Error(`Service '${appName}' not found or not discovered`);
      }

      if (service.status !== 'healthy') {
        throw new Error(`Service '${appName}' is not healthy (status: ${service.status})`);
      }

      // Get security policy for this service category
      const securityPolicy = this.securityPolicies.get(service.category) || this.securityPolicies.get('web-app');

      // Prepare authenticated URL
      const authenticatedUrl = await this.prepareAuthenticatedUrl(service, options);

      // Setup security headers and CSP
      await this.setupSecurityHeaders(service, securityPolicy);

      const iframeConfig = {
        id: `iframe-${service.id}`,
        url: authenticatedUrl,
        originalUrl: service.url,
        service: service,
        security: securityPolicy,
        loadedAt: Date.now(),
        status: 'loading',
        authToken: null,
        sessionId: this.generateSessionId()
      };

      // Store iframe configuration
      this.loadedIframes.set(appName, iframeConfig);

      console.log(`✅ Iframe configuration prepared for ${appName}`);

      return {
        success: true,
        config: {
          url: iframeConfig.url,
          allow: securityPolicy.permissions.join('; '),
          sandbox: securityPolicy.sandbox.join(' '),
          sessionId: iframeConfig.sessionId
        },
        service: {
          id: service.id,
          name: service.name,
          category: service.category,
          status: service.status,
          responseTime: service.responseTime
        }
      };

    } catch (error) {
      console.error(`❌ Failed to load iframe for ${appName}:`, error);

      return {
        success: false,
        error: error.message,
        fallback: {
          message: `Unable to load ${appName} in desktop app`,
          action: 'open_external',
          url: this.serviceDiscovery.getServiceUrl(appName)
        }
      };
    }
  }

  /**
   * Prepare authenticated URL for the service
   */
  async prepareAuthenticatedUrl(service, options) {
    let baseUrl = service.url;

    try {
      // Get authentication token if available
      const authStatus = await this.authService.checkAuthStatus();

      if (authStatus.authenticated && authStatus.user) {
        // For web apps that support token authentication
        if (service.category === 'web-app') {
          const token = await this.authService.getValidToken();
          
          // Try different authentication methods based on service
          if (service.id === 'recoder-chat') {
            // For chat, use session-based auth or direct user endpoint
            baseUrl = `${service.url}/chat`;
          } else if (service.id === 'recoder-web') {
            // For web platform, append auth token as query parameter
            const url = new URL(service.url);
            url.searchParams.set('desktop_token', token);
            baseUrl = url.toString();
          }
        }
      } else {
        // Handle unauthenticated access
        if (service.id === 'recoder-chat') {
          // Use guest access for chat
          baseUrl = `${service.url}/api/auth/guest?redirectUrl=${encodeURIComponent(service.url + '/chat')}`;
        }
      }

      // Add desktop app identifier
      const finalUrl = new URL(baseUrl);
      finalUrl.searchParams.set('client', 'desktop');
      finalUrl.searchParams.set('version', '1.0.0');

      return finalUrl.toString();

    } catch (error) {
      console.warn(`Failed to prepare authenticated URL for ${service.id}:`, error);
      return baseUrl;
    }
  }

  /**
   * Setup security headers and CSP for the service
   */
  async setupSecurityHeaders(service, securityPolicy) {
    try {
      const defaultSession = session.defaultSession;

      // Setup webRequest handler for this service domain
      const filter = {
        urls: [`${service.url}/*`]
      };

      // Remove any existing handlers for this service
      defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
        const responseHeaders = { ...details.responseHeaders };

        // Remove restrictive headers that prevent iframe embedding
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['Content-Security-Policy'];

        // Add permissive headers for desktop app
        responseHeaders['X-Frame-Options'] = ['ALLOWALL'];
        
        // Build CSP header
        const cspDirectives = Object.entries(securityPolicy.csp)
          .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
          .join('; ');
        
        responseHeaders['Content-Security-Policy'] = [cspDirectives];

        // Add CORS headers for localhost
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
        responseHeaders['Access-Control-Allow-Headers'] = ['*'];

        callback({ responseHeaders });
      });

      console.log(`🔒 Security headers configured for ${service.id}`);

    } catch (error) {
      console.error(`Failed to setup security headers for ${service.id}:`, error);
    }
  }

  /**
   * Inject authentication into loaded iframe
   */
  async injectAuthentication(appName) {
    try {
      const iframeConfig = this.loadedIframes.get(appName);
      if (!iframeConfig) {
        throw new Error(`Iframe ${appName} not found`);
      }

      const authStatus = await this.authService.checkAuthStatus();
      if (!authStatus.authenticated) {
        throw new Error('User not authenticated');
      }

      const token = await this.authService.getValidToken();
      
      // Prepare authentication injection script
      const authScript = `
        (function() {
          // Store auth token in localStorage
          try {
            localStorage.setItem('recoder_desktop_token', '${token}');
            localStorage.setItem('recoder_desktop_user', '${JSON.stringify(authStatus.user)}');
            
            // Trigger authentication event
            window.dispatchEvent(new CustomEvent('desktop_auth', {
              detail: {
                token: '${token}',
                user: ${JSON.stringify(authStatus.user)},
                source: 'desktop'
              }
            }));
            
            console.log('🔐 Desktop authentication injected');
            return true;
          } catch (error) {
            console.error('Failed to inject desktop authentication:', error);
            return false;
          }
        })();
      `;

      iframeConfig.authToken = token;
      iframeConfig.lastAuthInjection = Date.now();

      return {
        success: true,
        script: authScript,
        token: token,
        user: authStatus.user
      };

    } catch (error) {
      console.error(`Failed to inject authentication for ${appName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reload iframe with fresh configuration
   */
  async reloadIframe(appName) {
    try {
      // Clear existing configuration
      this.loadedIframes.delete(appName);

      // Reload with fresh configuration
      return await this.loadSecureIframe(appName);

    } catch (error) {
      console.error(`Failed to reload iframe ${appName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get status of loaded iframe
   */
  getIframeStatus(appName) {
    const iframeConfig = this.loadedIframes.get(appName);
    
    if (!iframeConfig) {
      return {
        loaded: false,
        error: 'Iframe not found'
      };
    }

    return {
      loaded: true,
      status: iframeConfig.status,
      loadedAt: iframeConfig.loadedAt,
      sessionId: iframeConfig.sessionId,
      authenticated: !!iframeConfig.authToken,
      lastAuthInjection: iframeConfig.lastAuthInjection,
      service: {
        id: iframeConfig.service.id,
        name: iframeConfig.service.name,
        category: iframeConfig.service.category,
        url: iframeConfig.originalUrl
      }
    };
  }

  /**
   * Clear iframe session data
   */
  async clearIframeSession(appName) {
    try {
      const iframeConfig = this.loadedIframes.get(appName);
      if (!iframeConfig) {
        return { success: false, error: 'Iframe not found' };
      }

      // Clear authentication data
      const clearScript = `
        (function() {
          try {
            localStorage.removeItem('recoder_desktop_token');
            localStorage.removeItem('recoder_desktop_user');
            sessionStorage.clear();
            
            // Clear cookies for this domain
            document.cookie.split(";").forEach(function(c) { 
              document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            });
            
            console.log('🧹 Desktop session cleared');
            return true;
          } catch (error) {
            console.error('Failed to clear desktop session:', error);
            return false;
          }
        })();
      `;

      // Reset iframe configuration
      iframeConfig.authToken = null;
      iframeConfig.lastAuthInjection = null;
      iframeConfig.sessionId = this.generateSessionId();

      return {
        success: true,
        script: clearScript,
        sessionId: iframeConfig.sessionId
      };

    } catch (error) {
      console.error(`Failed to clear session for ${appName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `desktop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all loaded iframes
   */
  getAllLoadedIframes() {
    return Array.from(this.loadedIframes.entries()).map(([appName, config]) => ({
      appName,
      ...this.getIframeStatus(appName)
    }));
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.loadedIframes.clear();
    // Remove webRequest handlers
    const defaultSession = session.defaultSession;
    defaultSession.webRequest.onHeadersReceived(null);
  }
}

module.exports = { IframeSecurityManager };