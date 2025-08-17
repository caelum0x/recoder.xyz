/**
 * Port Management System - Real Implementation
 * Detects and resolves port conflicts automatically
 */

import chalk from 'chalk';
import { Logger } from './logger';
import net from 'net';

export interface PortConfig {
  service: string;
  defaultPort: number;
  envVar?: string;
  required: boolean;
}

export interface PortAssignment {
  service: string;
  port: number;
  available: boolean;
  conflictWith?: string;
}

export class PortManager {
  private static instance: PortManager;
  private portRegistry: Map<string, number> = new Map();
  private serviceConfigs: Map<string, PortConfig> = new Map();

  // Default port configurations
  private readonly DEFAULT_CONFIGS: PortConfig[] = [
    { service: 'web-platform', defaultPort: 3000, envVar: 'WEB_PLATFORM_PORT', required: true },
    { service: 'chat-platform', defaultPort: 3001, envVar: 'CHAT_PLATFORM_PORT', required: true },
    { service: 'backend-api', defaultPort: 8000, envVar: 'BACKEND_API_PORT', required: true },
    { service: 'production-engine', defaultPort: 3002, envVar: 'PRODUCTION_ENGINE_PORT', required: true },
    { service: 'collaboration-server', defaultPort: 8081, envVar: 'COLLAB_PORT', required: false },
    { service: 'auth-service', defaultPort: 8082, envVar: 'AUTH_PORT', required: false },
    { service: 'ollama', defaultPort: 11434, envVar: 'OLLAMA_PORT', required: false },
    { service: 'lm-studio', defaultPort: 1234, envVar: 'LM_STUDIO_PORT', required: false },
  ];

  constructor() {
    this.initializeConfigs();
  }

  static getInstance(): PortManager {
    if (!PortManager.instance) {
      PortManager.instance = new PortManager();
    }
    return PortManager.instance;
  }

  private initializeConfigs(): void {
    this.DEFAULT_CONFIGS.forEach(config => {
      this.serviceConfigs.set(config.service, config);
    });
  }

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Find next available port starting from a given port
   */
  private async findAvailablePort(startPort: number, maxAttempts: number = 100): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available port found starting from ${startPort}`);
  }

  /**
   * Get port for a service, checking environment variables and conflicts
   */
  async getPortForService(serviceName: string): Promise<number> {
    const config = this.serviceConfigs.get(serviceName);
    if (!config) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    // Check if port is already assigned
    const existingPort = this.portRegistry.get(serviceName);
    if (existingPort) {
      return existingPort;
    }

    // Get port from environment variable or use default
    const envPort = config.envVar ? process.env[config.envVar] : undefined;
    const preferredPort = envPort ? parseInt(envPort) : config.defaultPort;

    // Check if preferred port is available
    if (await this.isPortAvailable(preferredPort)) {
      this.portRegistry.set(serviceName, preferredPort);
      Logger.info(`Port assigned for ${serviceName}: ${preferredPort}`);
      return preferredPort;
    }

    // Find alternative port if preferred is not available
    Logger.warn(`Port ${preferredPort} is not available for ${serviceName}, finding alternative...`);
    const availablePort = await this.findAvailablePort(preferredPort + 1);
    
    this.portRegistry.set(serviceName, availablePort);
    Logger.info(`Alternative port assigned for ${serviceName}: ${availablePort}`);
    
    return availablePort;
  }

  /**
   * Reserve a port for a service
   */
  reservePort(serviceName: string, port: number): void {
    this.portRegistry.set(serviceName, port);
  }

  /**
   * Release a port from a service
   */
  releasePort(serviceName: string): void {
    this.portRegistry.delete(serviceName);
  }

  /**
   * Get all current port assignments
   */
  getPortAssignments(): PortAssignment[] {
    const assignments: PortAssignment[] = [];
    
    for (const [service, port] of this.portRegistry.entries()) {
      assignments.push({
        service,
        port,
        available: true // Already assigned, so considered available for this service
      });
    }
    
    return assignments;
  }

  /**
   * Detect and report port conflicts
   */
  async detectConflicts(): Promise<PortAssignment[]> {
    const conflicts: PortAssignment[] = [];
    const portUsage = new Map<number, string[]>();

    // Group services by port
    for (const [service, port] of this.portRegistry.entries()) {
      if (!portUsage.has(port)) {
        portUsage.set(port, []);
      }
      portUsage.get(port)!.push(service);
    }

    // Find conflicts
    for (const [port, services] of portUsage.entries()) {
      if (services.length > 1) {
        services.forEach(service => {
          conflicts.push({
            service,
            port,
            available: false,
            conflictWith: services.filter(s => s !== service).join(', ')
          });
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolve all port conflicts automatically
   */
  async resolveConflicts(): Promise<Map<string, number>> {
    const conflicts = await this.detectConflicts();
    const resolutions = new Map<string, number>();

    if (conflicts.length === 0) {
      Logger.info('No port conflicts detected');
      return resolutions;
    }

    Logger.warn(`Resolving ${conflicts.length} port conflicts...`);

    // Group conflicts by port
    const conflictsByPort = new Map<number, string[]>();
    conflicts.forEach(conflict => {
      if (!conflictsByPort.has(conflict.port)) {
        conflictsByPort.set(conflict.port, []);
      }
      conflictsByPort.get(conflict.port)!.push(conflict.service);
    });

    // Resolve each conflict
    for (const [port, services] of conflictsByPort.entries()) {
      // Keep the first service on the original port
      const [keepService, ...moveServices] = services;
      
      Logger.info(`Keeping ${keepService} on port ${port}`);
      
      // Find new ports for other services
      for (const service of moveServices) {
        try {
          const newPort = await this.findAvailablePort(port + 1);
          this.portRegistry.set(service, newPort);
          resolutions.set(service, newPort);
          Logger.info(`Moved ${service} from port ${port} to ${newPort}`);
        } catch (error) {
          Logger.error(`Failed to find alternative port for ${service}:`, error);
        }
      }
    }

    return resolutions;
  }

  /**
   * Print port status report
   */
  printPortReport(): void {
    console.log(chalk.cyan('\n🔌 Port Configuration Report'));
    console.log(chalk.gray('─'.repeat(60)));

    const assignments = this.getPortAssignments();
    assignments.sort((a, b) => a.port - b.port);

    assignments.forEach(assignment => {
      const status = assignment.available ? chalk.green('✓') : chalk.red('✗');
      const conflict = assignment.conflictWith ? chalk.red(`(conflicts with ${assignment.conflictWith})`) : '';
      
      console.log(`${status} ${chalk.white(assignment.service.padEnd(20))} ${chalk.yellow(assignment.port.toString().padStart(5))} ${conflict}`);
    });

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.green(`Total services: ${assignments.length}`));
  }

  /**
   * Generate environment variables for current port assignments
   */
  generateEnvVars(): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const [service, port] of this.portRegistry.entries()) {
      const config = this.serviceConfigs.get(service);
      if (config?.envVar) {
        envVars[config.envVar] = port.toString();
      }
    }

    return envVars;
  }

  /**
   * Export port configuration to file
   */
  async exportConfig(filePath: string): Promise<void> {
    const config = {
      timestamp: new Date().toISOString(),
      assignments: Object.fromEntries(this.portRegistry.entries()),
      envVars: this.generateEnvVars()
    };

    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    Logger.info(`Port configuration exported to ${filePath}`);
  }
}

export const portManager = PortManager.getInstance();