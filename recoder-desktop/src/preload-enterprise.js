/**
 * RECODER.XYZ ENTERPRISE PRELOAD SCRIPT
 * Secure bridge between main process and renderer with enterprise-grade API
 */

const { contextBridge, ipcRenderer } = require('electron');

// Enterprise API Bridge
contextBridge.exposeInMainWorld('recoderAPI', {
  // Application Management
  app: {
    getState: () => ipcRenderer.invoke('app:get-state'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    getConfig: () => ipcRenderer.invoke('app:get-config'),
    
    // Event listeners
    onStateUpdate: (callback) => {
      ipcRenderer.on('app:state-update', callback);
      return () => ipcRenderer.removeListener('app:state-update', callback);
    },
    onNavigate: (callback) => {
      ipcRenderer.on('app:navigate', callback);
      return () => ipcRenderer.removeListener('app:navigate', callback);
    }
  },
  
  // Enterprise Service Management
  services: {
    getAll: () => ipcRenderer.invoke('services:get-all'),
    getHealthy: () => ipcRenderer.invoke('services:get-healthy'),
    discover: () => ipcRenderer.invoke('services:discover'),
    healthCheck: () => ipcRenderer.invoke('services:health-check'),
    
    // Event listeners
    onDiscoveryComplete: (callback) => {
      ipcRenderer.on('services:discovery-complete', callback);
      return () => ipcRenderer.removeListener('services:discovery-complete', callback);
    },
    onServiceDiscovered: (callback) => {
      ipcRenderer.on('services:service-discovered', callback);
      return () => ipcRenderer.removeListener('services:service-discovered', callback);
    },
    onServiceUnhealthy: (callback) => {
      ipcRenderer.on('services:service-unhealthy', callback);
      return () => ipcRenderer.removeListener('services:service-unhealthy', callback);
    }
  },
  
  // Enterprise Application Loading
  apps: {
    load: (appName, options = {}) => ipcRenderer.invoke('app:load', appName, options),
    
    // Predefined app loaders with enterprise features
    loadChat: (options = {}) => ipcRenderer.invoke('app:load', 'chat', options),
    loadWeb: (options = {}) => ipcRenderer.invoke('app:load', 'web', options),
    loadExtension: (options = {}) => ipcRenderer.invoke('app:load', 'extension', options),
    
    // Panel loaders
    loadDashboard: () => ipcRenderer.invoke('app:load', 'dashboard'),
    loadSettings: () => ipcRenderer.invoke('app:load', 'settings'),
    loadOfflineAI: () => ipcRenderer.invoke('app:load', 'offline-ai')
  },
  
  // Enterprise Authentication
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:get-status'),
    
    // Event listeners
    onStatusChange: (callback) => {
      ipcRenderer.on('auth:status-change', callback);
      return () => ipcRenderer.removeListener('auth:status-change', callback);
    }
  },
  
  // Enterprise AI Integration
  ai: {
    checkOllama: () => ipcRenderer.invoke('ai:check-ollama'),
    generate: (options) => ipcRenderer.invoke('ai:generate', options),
    
    // Predefined AI operations
    generateCode: (prompt, options = {}) => ipcRenderer.invoke('ai:generate', {
      prompt: `Generate production-ready code for: ${prompt}`,
      model: options.model || 'llama3:latest',
      temperature: options.temperature || 0.3,
      ...options
    }),
    
    explainCode: (code, options = {}) => ipcRenderer.invoke('ai:generate', {
      prompt: `Explain this code in detail:\n\n${code}`,
      model: options.model || 'llama3:latest',
      temperature: options.temperature || 0.5,
      ...options
    }),
    
    reviewCode: (code, options = {}) => ipcRenderer.invoke('ai:generate', {
      prompt: `Review this code for issues, improvements, and best practices:\n\n${code}`,
      model: options.model || 'llama3:latest',
      temperature: options.temperature || 0.4,
      ...options
    }),
    
    optimizeCode: (code, options = {}) => ipcRenderer.invoke('ai:generate', {
      prompt: `Optimize this code for performance and readability:\n\n${code}`,
      model: options.model || 'llama3:latest',
      temperature: options.temperature || 0.3,
      ...options
    })
  },
  
  // System Integration
  system: {
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
    
    // Platform-specific operations
    showInFolder: (path) => ipcRenderer.invoke('system:show-in-folder', path),
    copyToClipboard: (text) => ipcRenderer.invoke('system:copy-to-clipboard', text),
    
    // System information
    getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
    getMemoryUsage: () => ipcRenderer.invoke('system:get-memory-usage'),
    getCPUUsage: () => ipcRenderer.invoke('system:get-cpu-usage')
  },
  
  // Enterprise Updates
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    
    // Event listeners
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update:available', callback);
      return () => ipcRenderer.removeListener('update:available', callback);
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update:downloaded', callback);
      return () => ipcRenderer.removeListener('update:downloaded', callback);
    }
  },

  // Enterprise Telemetry
  telemetry: {
    getReport: (timeframe = '24h') => ipcRenderer.invoke('telemetry:get-report', timeframe),
    getSummary: () => ipcRenderer.invoke('telemetry:get-summary'),
    trackEvent: (eventName, data) => ipcRenderer.invoke('telemetry:track-event', eventName, data),
    isEnabled: () => ipcRenderer.invoke('telemetry:is-enabled'),
    
    // Convenience methods for common tracking
    trackUserAction: (action, context, metadata = {}) => 
      ipcRenderer.invoke('telemetry:track-event', 'user-action', { action, context, ...metadata }),
    
    trackPerformance: (operation, duration, metadata = {}) =>
      ipcRenderer.invoke('telemetry:track-event', 'performance', { operation, duration, ...metadata }),
    
    trackError: (error, context, metadata = {}) =>
      ipcRenderer.invoke('telemetry:track-event', 'error', { 
        message: error.message, 
        stack: error.stack,
        context,
        ...metadata 
      })
  },
  
  // Enterprise Utilities
  utils: {
    // ID generation
    generateId: () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    generateUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },
    
    // Time formatting
    formatTime: (timestamp) => new Date(timestamp).toLocaleString(),
    formatRelativeTime: (timestamp) => {
      const diff = Date.now() - timestamp;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return `${seconds}s ago`;
    },
    
    // Data formatting
    formatBytes: (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    formatNumber: (num) => {
      return new Intl.NumberFormat().format(num);
    },
    
    // Performance utilities
    debounce: (func, wait) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },
    
    throttle: (func, limit) => {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },
    
    // Data validation
    isValidUrl: (string) => {
      try {
        new URL(string);
        return true;
      } catch (_) {
        return false;
      }
    },
    
    isValidEmail: (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    },
    
    // Security utilities
    sanitizeHtml: (html) => {
      const div = document.createElement('div');
      div.textContent = html;
      return div.innerHTML;
    },
    
    escapeRegex: (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  },
  
  // Development & Debug Tools
  dev: {
    isDevMode: () => process.env.NODE_ENV === 'development',
    
    // Logging with enterprise context
    log: (...args) => console.log('[Recoder Enterprise]', ...args),
    warn: (...args) => console.warn('[Recoder Enterprise]', ...args),
    error: (...args) => console.error('[Recoder Enterprise]', ...args),
    
    // Performance monitoring
    mark: (name) => performance.mark(name),
    measure: (name, startMark, endMark) => performance.measure(name, startMark, endMark),
    getEntriesByType: (type) => performance.getEntriesByType(type),
    
    // Memory monitoring
    getMemoryInfo: () => {
      if (performance.memory) {
        return {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        };
      }
      return null;
    },
    
    // Network monitoring
    getConnectionInfo: () => {
      return {
        online: navigator.onLine,
        connectionType: navigator.connection?.effectiveType || 'unknown',
        downlink: navigator.connection?.downlink || 0,
        rtt: navigator.connection?.rtt || 0
      };
    }
  },
  
  // Enterprise Constants
  constants: {
    APP_NAME: 'Recoder Desktop Enterprise',
    VERSION: '1.0.0',
    BUILD_TYPE: 'Enterprise',
    
    // Service categories
    SERVICE_CATEGORIES: {
      AI_PLATFORM: 'ai-platform',
      WEB_PLATFORM: 'web-platform',
      DEVELOPMENT_TOOLS: 'development-tools',
      API_SERVICE: 'api-service'
    },
    
    // Status types
    STATUS_TYPES: {
      HEALTHY: 'healthy',
      DEGRADED: 'degraded',
      UNHEALTHY: 'unhealthy',
      OFFLINE: 'offline'
    },
    
    // Panel types
    PANEL_TYPES: {
      DASHBOARD: 'dashboard',
      SETTINGS: 'settings',
      OFFLINE_AI: 'offline-ai'
    },
    
    // AI models
    AI_MODELS: {
      OLLAMA: {
        LLAMA3: 'llama3:latest',
        CODELLAMA: 'codellama:latest',
        MISTRAL: 'mistral:latest'
      },
      OPENAI: {
        GPT4: 'gpt-4',
        GPT3_5: 'gpt-3.5-turbo'
      },
      ANTHROPIC: {
        CLAUDE3: 'claude-3-sonnet',
        CLAUDE3_HAIKU: 'claude-3-haiku'
      }
    }
  }
});

// Legacy API compatibility
contextBridge.exposeInMainWorld('electronAPI', {
  // Basic compatibility methods
  loadApp: (appName) => ipcRenderer.invoke('app:load', appName),
  getAppList: () => ipcRenderer.invoke('services:get-all'),
  
  // AI compatibility
  checkOllamaStatus: () => ipcRenderer.invoke('ai:check-ollama'),
  generateCodeOffline: (options) => ipcRenderer.invoke('ai:generate', options),
  
  // System compatibility
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  
  // Updates compatibility
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install')
});

// Enterprise Performance Monitoring
const enterprisePerformance = {
  startTime: Date.now(),
  marks: new Map(),
  measures: new Map(),
  
  mark(name) {
    performance.mark(name);
    this.marks.set(name, Date.now());
  },
  
  measure(name, startMark, endMark) {
    performance.measure(name, startMark, endMark);
    const duration = performance.getEntriesByName(name, 'measure')[0]?.duration || 0;
    this.measures.set(name, duration);
    return duration;
  },
  
  getMetrics() {
    return {
      startTime: this.startTime,
      uptime: Date.now() - this.startTime,
      marks: Object.fromEntries(this.marks),
      measures: Object.fromEntries(this.measures),
      memory: window.recoderAPI?.dev?.getMemoryInfo?.() || null,
      connection: window.recoderAPI?.dev?.getConnectionInfo?.() || null
    };
  }
};

// Expose performance monitoring
contextBridge.exposeInMainWorld('enterprisePerformance', enterprisePerformance);

// Enterprise Security Monitoring
const enterpriseSecurity = {
  violations: [],
  
  reportViolation(type, details) {
    const violation = {
      type,
      details,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    this.violations.push(violation);
    console.warn('[Enterprise Security]', violation);
    
    // Report to main process if available
    if (window.recoderAPI?.dev?.isDevMode?.()) {
      console.log('Security violation reported:', violation);
    }
  },
  
  getViolations() {
    return this.violations;
  }
};

// Expose security monitoring
contextBridge.exposeInMainWorld('enterpriseSecurity', enterpriseSecurity);

// Performance tracking
window.addEventListener('load', () => {
  enterprisePerformance.mark('ui-loaded');
  
  console.log('🏢 Enterprise UI Performance:', {
    loadTime: performance.now(),
    memory: window.recoderAPI?.dev?.getMemoryInfo?.(),
    timing: performance.getEntriesByType('navigation')[0]
  });
});

// Security event monitoring
window.addEventListener('securitypolicyviolation', (event) => {
  enterpriseSecurity.reportViolation('csp', {
    directive: event.violatedDirective,
    blockedURI: event.blockedURI,
    originalPolicy: event.originalPolicy
  });
});

// Error monitoring
window.addEventListener('error', (event) => {
  console.error('🚨 Enterprise UI Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled Promise Rejection:', {
    reason: event.reason,
    promise: event.promise
  });
});

console.log('✅ Enterprise preload script initialized');
console.log('🏢 Recoder Desktop Enterprise API ready');
console.log('📊 Performance monitoring active');
console.log('🔒 Security monitoring active');