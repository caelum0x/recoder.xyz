#!/usr/bin/env node

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Unified Error Handler for Recoder Code
 * Coordinates all error handling to prevent conflicts
 */
class UnifiedErrorHandler {
  constructor() {
    this.isInitialized = false;
    this.errorHandlers = new Map();
    this.errorStats = {
      api: 0,
      mcp: 0,
      network: 0,
      general: 0
    };
    this.suppressedErrors = new Set([
      'ENOTFOUND your-resource.openai.azure.com', // Expected MCP connection failure
      'ECONNREFUSED', // Expected for localhost services
      'socket hang up', // Expected for unavailable services
      'EMFILE: too many open files', // File watcher resource exhaustion
      'spawn EBADF' // Process spawn errors for unavailable tools
    ]);
  }

  /**
   * Initialize unified error handling (call once)
   */
  initialize() {
    if (this.isInitialized) return;

    // Remove any existing handlers to prevent conflicts
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('uncaughtException');

    // Set up unified handlers
    process.on('unhandledRejection', (reason, promise) => {
      this.handleUnhandledRejection(reason, promise);
    });

    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    this.isInitialized = true;
    console.log(chalk.gray('🛡️  Unified error handler initialized'));
  }

  /**
   * Register a specific error handler for a domain
   */
  registerHandler(domain, handler) {
    this.errorHandlers.set(domain, handler);
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejection(reason, promise) {
    const errorInfo = this.analyzeError(reason);
    
    // Try domain-specific handlers first
    if (this.tryDomainHandler(errorInfo.domain, reason)) {
      return;
    }

    // Handle based on error type
    switch (errorInfo.type) {
      case 'api':
        this.handleAPIError(reason);
        break;
      case 'mcp':
        this.handleMCPError(reason);
        break;
      case 'network':
        this.handleNetworkError(reason);
        break;
      default:
        this.handleGenericError(reason, 'unhandled_rejection');
    }
  }

  /**
   * Handle uncaught exceptions
   */
  handleUncaughtException(error) {
    const errorInfo = this.analyzeError(error);
    
    // Try domain-specific handlers first
    if (this.tryDomainHandler(errorInfo.domain, error)) {
      return;
    }

    // Log critical error
    console.error(chalk.red('🚨 Critical Error:'), error.message);
    if (process.env.RECODER_DEBUG === 'true') {
      console.error(error.stack);
    }
    
    // Don't exit process - maintain availability
    this.errorStats.general++;
  }

  /**
   * Analyze error to determine type and handling strategy
   */
  analyzeError(error) {
    const message = error?.message || error?.toString() || '';
    const code = error?.code || '';
    const status = error?.response?.status || error?.status;

    // API errors
    if (status || message.includes('credits') || message.includes('OpenRouter')) {
      return { type: 'api', domain: 'openrouter', severity: 'medium' };
    }

    // MCP connection errors
    if (message.includes('your-resource.openai.azure.com') || 
        message.includes('localhost:8080') ||
        code === 'ENOTFOUND' || 
        code === 'ECONNREFUSED' ||
        message.includes('socket hang up')) {
      return { type: 'mcp', domain: 'mcp', severity: 'low' };
    }

    // Network errors
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || message.includes('network')) {
      return { type: 'network', domain: 'network', severity: 'medium' };
    }

    return { type: 'generic', domain: 'general', severity: 'high' };
  }

  /**
   * Try domain-specific handler
   */
  tryDomainHandler(domain, error) {
    const handler = this.errorHandlers.get(domain);
    if (handler) {
      try {
        handler(error);
        return true;
      } catch (handlerError) {
        console.log(chalk.yellow(`⚠️  Error handler for ${domain} failed:`, handlerError.message));
      }
    }
    return false;
  }

  /**
   * Handle API errors (402, 401, etc.)
   */
  handleAPIError(error) {
    const status = error?.response?.status || error?.status;
    
    if (status) {
      switch (status) {
        case 401:
          console.error(chalk.red('🔑 Authentication failed - check your API key'));
          break;
        case 402:
          console.error(chalk.yellow('💳 Insufficient credits - add credits to your account'));
          break;
        case 429:
          console.error(chalk.yellow('⏱️  Rate limited - please wait before trying again'));
          break;
        default:
          console.error(chalk.red(`🌐 API Error (${status}):`, error.message));
      }
    } else {
      console.error(chalk.red('🌐 API Error:'), error.message);
    }
    
    this.errorStats.api++;
  }

  /**
   * Handle MCP connection errors (graceful degradation)
   */
  handleMCPError(error) {
    const message = error?.message || error?.toString();
    
    // Check if this is a suppressed (expected) error
    if (this.suppressedErrors.has(message) || 
        this.suppressedErrors.some(suppressed => message.includes(suppressed))) {
      // Silently track but don't display
      this.errorStats.mcp++;
      return;
    }

    // Log non-critical MCP errors quietly
    if (process.env.RECODER_DEBUG === 'true') {
      console.log(chalk.gray('🔌 MCP service unavailable:'), message);
    }
    
    this.errorStats.mcp++;
  }

  /**
   * Handle network errors
   */
  handleNetworkError(error) {
    const message = error?.message || error?.toString();
    
    // Check if this is a suppressed error first
    if (this.suppressedErrors.has(message) || 
        this.suppressedErrors.some(suppressed => message.includes(suppressed))) {
      this.errorStats.network++;
      return; // Silently handle
    }

    console.log(chalk.yellow('🌐 Network issue detected - some features may be limited'));
    if (process.env.RECODER_DEBUG === 'true') {
      console.log(chalk.gray('Details:'), error.message);
    }
    this.errorStats.network++;
  }

  /**
   * Handle generic errors
   */
  handleGenericError(error, type = 'generic') {
    console.error(chalk.red('⚠️  Error:'), error?.message || error);
    if (process.env.RECODER_DEBUG === 'true' && error?.stack) {
      console.error(chalk.gray('Stack:'), error.stack);
    }
    this.errorStats.general++;
  }

  /**
   * Get error statistics
   */
  getStats() {
    return { ...this.errorStats };
  }

  /**
   * Reset error statistics
   */
  resetStats() {
    this.errorStats = { api: 0, mcp: 0, network: 0, general: 0 };
  }

  /**
   * Check if system is healthy (low error rates)
   */
  isHealthy() {
    const total = Object.values(this.errorStats).reduce((a, b) => a + b, 0);
    return total < 10 && this.errorStats.general < 3;
  }
}

// Global singleton instance
const unifiedErrorHandler = new UnifiedErrorHandler();

module.exports = UnifiedErrorHandler;
module.exports.instance = unifiedErrorHandler;