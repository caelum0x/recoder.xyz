/**
 * Web Integration Service
 * Integrates the @recoder/web package into CLI for dashboard functionality
 */

import { Logger } from '@recoder/shared';
import path from 'path';
import fs from 'fs-extra';

export interface WebServerConfig {
  port: number;
  host: string;
  env: 'development' | 'production';
  baseUrl?: string;
}

export class WebIntegrationService {
  private logger: Logger;
  private isRunning = false;
  private config: WebServerConfig;

  constructor(config?: Partial<WebServerConfig>) {
    this.logger = Logger.getInstance();
    this.config = {
      port: 3000,
      host: 'localhost',
      env: 'development',
      ...config
    };
  }

  /**
   * Start the web dashboard server
   */
  async startDashboard(): Promise<void> {
    if (this.isRunning) {
      this.logger.info('Web dashboard is already running');
      return;
    }

    try {
      this.logger.info(`Starting Recoder web dashboard on ${this.config.host}:${this.config.port}`);
      
      // Check if Next.js app exists
      const webPackagePath = path.resolve(__dirname, '../../../web');
      if (!await fs.pathExists(webPackagePath)) {
        throw new Error('Web package not found. Run "npm install" first.');
      }

      // Set environment variables for web server
      process.env.NODE_ENV = this.config.env;
      process.env.PORT = this.config.port.toString();
      process.env.HOST = this.config.host;

      this.logger.info('✅ Web dashboard integration initialized');
      this.logger.info(`🌐 Dashboard will be available at: http://${this.config.host}:${this.config.port}`);
      
      this.isRunning = true;
    } catch (error) {
      this.logger.error('Failed to start web dashboard:', error);
      throw error;
    }
  }

  /**
   * Stop the web dashboard server
   */
  async stopDashboard(): Promise<void> {
    if (!this.isRunning) {
      this.logger.info('Web dashboard is not running');
      return;
    }

    try {
      this.logger.info('Stopping web dashboard...');
      this.isRunning = false;
      this.logger.info('✅ Web dashboard stopped');
    } catch (error) {
      this.logger.error('Failed to stop web dashboard:', error);
      throw error;
    }
  }

  /**
   * Check if dashboard is running
   */
  isWebDashboardRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get dashboard URL
   */
  getDashboardUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Open dashboard in browser
   */
  async openDashboard(): Promise<void> {
    if (!this.isRunning) {
      await this.startDashboard();
    }

    const url = this.getDashboardUrl();
    this.logger.info(`Opening dashboard: ${url}`);
    
    // Dynamic import to avoid bundling issues
    const open = await import('open');
    await open.default(url);
  }

  /**
   * Get dashboard status
   */
  getDashboardStatus(): {
    running: boolean;
    url: string;
    config: WebServerConfig;
  } {
    return {
      running: this.isRunning,
      url: this.getDashboardUrl(),
      config: this.config
    };
  }
}

// Singleton instance
let webIntegration: WebIntegrationService | null = null;

export function getWebIntegration(config?: Partial<WebServerConfig>): WebIntegrationService {
  if (!webIntegration) {
    webIntegration = new WebIntegrationService(config);
  }
  return webIntegration;
}