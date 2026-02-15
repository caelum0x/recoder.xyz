/**
 * Health Monitor - Advanced container health checks and monitoring
 *
 * Features:
 * - Deep health checks (HTTP, TCP, exec)
 * - Resource usage monitoring (CPU, memory, disk)
 * - Automatic unhealthy container detection
 * - Health history tracking
 * - Alerting callbacks
 *
 * Inspired by patterns from libra deployment workflow and open-lovable sandbox management
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import http from 'http';
import net from 'net';

const docker = new Docker();

// ==================== TYPES ====================

export interface HealthStatus {
  containerId: string;
  projectId?: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  checks: HealthCheckResult[];
  resources: ResourceUsage;
  lastChecked: number;
  uptimeMs: number;
  consecutiveFailures: number;
}

export interface HealthCheckResult {
  name: string;
  type: 'http' | 'tcp' | 'exec' | 'resource';
  passed: boolean;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pidsCount: number;
}

export interface HealthCheckConfig {
  httpEndpoints?: HttpHealthCheck[];
  tcpPorts?: TcpHealthCheck[];
  execCommands?: ExecHealthCheck[];
  resourceThresholds?: ResourceThresholds;
}

export interface HttpHealthCheck {
  name: string;
  path: string;
  port: number;
  expectedStatus?: number;
  timeoutMs?: number;
}

export interface TcpHealthCheck {
  name: string;
  port: number;
  timeoutMs?: number;
}

export interface ExecHealthCheck {
  name: string;
  command: string[];
  expectedExitCode?: number;
  timeoutMs?: number;
}

export interface ResourceThresholds {
  maxCpuPercent?: number;
  maxMemoryPercent?: number;
  maxPids?: number;
}

export interface HealthMonitorConfig {
  checkIntervalMs: number;
  unhealthyThreshold: number;      // Consecutive failures before unhealthy
  degradedThreshold: number;       // Consecutive failures before degraded
  historySize: number;             // Number of health checks to keep
  defaultTimeoutMs: number;
}

export interface ContainerHealthHistory {
  containerId: string;
  checks: Array<{
    timestamp: number;
    status: HealthStatus['status'];
    checks: HealthCheckResult[];
  }>;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: Number(process.env.HEALTH_CHECK_INTERVAL_MS) || 30000,  // 30 seconds
  unhealthyThreshold: Number(process.env.HEALTH_UNHEALTHY_THRESHOLD) || 5,  // Increased from 3 - more tolerant
  degradedThreshold: Number(process.env.HEALTH_DEGRADED_THRESHOLD) || 2,   // Increased from 1 - less sensitive
  historySize: Number(process.env.HEALTH_HISTORY_SIZE) || 100,
  defaultTimeoutMs: 5000,
};

const DEFAULT_RESOURCE_THRESHOLDS: ResourceThresholds = {
  maxCpuPercent: 90,
  maxMemoryPercent: 85,
  maxPids: 200,
};

// ==================== HEALTH MONITOR ====================

export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private containerConfigs: Map<string, HealthCheckConfig> = new Map();
  private healthHistory: Map<string, ContainerHealthHistory> = new Map();
  private currentStatus: Map<string, HealthStatus> = new Map();
  private monitoringInterval?: ReturnType<typeof setInterval>;
  private isMonitoring = false;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring containers
   */
  start(): void {
    if (this.isMonitoring) {
      console.log('[HealthMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log(`[HealthMonitor] Starting health monitoring (interval: ${this.config.checkIntervalMs}ms)`);

    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks().catch(err => {
        console.error('[HealthMonitor] Error running health checks:', err.message);
      });
    }, this.config.checkIntervalMs);

    // Run initial check
    this.runHealthChecks().catch(err => {
      console.error('[HealthMonitor] Error running initial health checks:', err.message);
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    console.log('[HealthMonitor] Stopped health monitoring');
  }

  /**
   * Register a container for health monitoring
   */
  registerContainer(containerId: string, config: HealthCheckConfig = {}): void {
    this.containerConfigs.set(containerId, config);
    this.healthHistory.set(containerId, { containerId, checks: [] });

    console.log(`[HealthMonitor] Registered container ${containerId.slice(0, 12)} for monitoring`);
  }

  /**
   * Unregister a container from health monitoring
   */
  unregisterContainer(containerId: string): void {
    this.containerConfigs.delete(containerId);
    this.healthHistory.delete(containerId);
    this.currentStatus.delete(containerId);

    console.log(`[HealthMonitor] Unregistered container ${containerId.slice(0, 12)}`);
  }

  /**
   * Get current health status for a container
   */
  getHealthStatus(containerId: string): HealthStatus | null {
    return this.currentStatus.get(containerId) || null;
  }

  /**
   * Get health history for a container
   */
  getHealthHistory(containerId: string): ContainerHealthHistory | null {
    return this.healthHistory.get(containerId) || null;
  }

  /**
   * Get all unhealthy containers
   */
  getUnhealthyContainers(): HealthStatus[] {
    return Array.from(this.currentStatus.values()).filter(
      s => s.status === 'unhealthy'
    );
  }

  /**
   * Get all degraded containers
   */
  getDegradedContainers(): HealthStatus[] {
    return Array.from(this.currentStatus.values()).filter(
      s => s.status === 'degraded'
    );
  }

  /**
   * Run health check for a specific container immediately
   */
  async checkContainer(containerId: string): Promise<HealthStatus> {
    const config = this.containerConfigs.get(containerId) || {};
    return this.performHealthCheck(containerId, config);
  }

  /**
   * Run health checks for all registered containers
   */
  private async runHealthChecks(): Promise<void> {
    const containerIds = Array.from(this.containerConfigs.keys());

    if (containerIds.length === 0) return;

    const checkPromises = containerIds.map(async containerId => {
      try {
        const config = this.containerConfigs.get(containerId) || {};
        const status = await this.performHealthCheck(containerId, config);

        this.updateStatus(containerId, status);
        this.recordHistory(containerId, status);

        return status;
      } catch (error: any) {
        console.error(`[HealthMonitor] Error checking ${containerId.slice(0, 12)}:`, error.message);
        return null;
      }
    });

    await Promise.allSettled(checkPromises);
  }

  /**
   * Perform comprehensive health check on a container
   */
  private async performHealthCheck(
    containerId: string,
    config: HealthCheckConfig
  ): Promise<HealthStatus> {
    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];
    const prevStatus = this.currentStatus.get(containerId);

    try {
      // Get container info
      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      if (!info.State.Running) {
        return this.createUnhealthyStatus(containerId, checks, prevStatus, 'Container not running');
      }

      // Get resource usage
      const resources = await this.getResourceUsage(container);

      // Run HTTP health checks
      if (config.httpEndpoints) {
        for (const endpoint of config.httpEndpoints) {
          const result = await this.checkHttpEndpoint(container, endpoint);
          checks.push(result);
        }
      }

      // Run TCP health checks
      if (config.tcpPorts) {
        for (const tcpCheck of config.tcpPorts) {
          const result = await this.checkTcpPort(container, tcpCheck);
          checks.push(result);
        }
      }

      // Run exec health checks
      if (config.execCommands) {
        for (const execCheck of config.execCommands) {
          const result = await this.checkExecCommand(container, execCheck);
          checks.push(result);
        }
      }

      // Run resource threshold checks
      const thresholds = config.resourceThresholds || DEFAULT_RESOURCE_THRESHOLDS;
      checks.push(this.checkResourceThresholds(resources, thresholds));

      // Determine overall status
      const failedChecks = checks.filter(c => !c.passed);
      const consecutiveFailures = failedChecks.length > 0
        ? (prevStatus?.consecutiveFailures || 0) + 1
        : 0;

      let status: HealthStatus['status'];
      if (consecutiveFailures >= this.config.unhealthyThreshold) {
        status = 'unhealthy';
      } else if (consecutiveFailures >= this.config.degradedThreshold) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      const uptimeMs = info.State.StartedAt
        ? Date.now() - new Date(info.State.StartedAt).getTime()
        : 0;

      return {
        containerId,
        projectId: info.Config.Labels?.['recoder.project'],
        status,
        checks,
        resources,
        lastChecked: Date.now(),
        uptimeMs,
        consecutiveFailures,
      };

    } catch (error: any) {
      return this.createUnhealthyStatus(containerId, checks, prevStatus, error.message);
    }
  }

  /**
   * Get container resource usage
   */
  private async getResourceUsage(container: Docker.Container): Promise<ResourceUsage> {
    try {
      const stats = await container.stats({ stream: false }) as any;

      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                       stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage -
                         stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0
        ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100
        : 0;

      // Memory usage
      const memoryUsed = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const memoryPercent = memoryLimit > 0 ? (memoryUsed / memoryLimit) * 100 : 0;

      // Network stats
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        for (const net of Object.values(stats.networks) as any[]) {
          networkRx += net.rx_bytes || 0;
          networkTx += net.tx_bytes || 0;
        }
      }

      // Block I/O stats
      let blockRead = 0;
      let blockWrite = 0;
      if (stats.blkio_stats?.io_service_bytes_recursive) {
        for (const io of stats.blkio_stats.io_service_bytes_recursive) {
          if (io.op === 'Read') blockRead += io.value;
          if (io.op === 'Write') blockWrite += io.value;
        }
      }

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsedBytes: memoryUsed,
        memoryLimitBytes: memoryLimit,
        memoryPercent: Math.round(memoryPercent * 100) / 100,
        networkRxBytes: networkRx,
        networkTxBytes: networkTx,
        blockReadBytes: blockRead,
        blockWriteBytes: blockWrite,
        pidsCount: stats.pids_stats?.current || 0,
      };

    } catch (error: any) {
      console.error('[HealthMonitor] Error getting resource usage:', error.message);
      return {
        cpuPercent: 0,
        memoryUsedBytes: 0,
        memoryLimitBytes: 0,
        memoryPercent: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        blockReadBytes: 0,
        blockWriteBytes: 0,
        pidsCount: 0,
      };
    }
  }

  /**
   * HTTP health check
   */
  private async checkHttpEndpoint(
    container: Docker.Container,
    check: HttpHealthCheck
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeout = check.timeoutMs || this.config.defaultTimeoutMs;
    const expectedStatus = check.expectedStatus || 200;

    return new Promise(resolve => {
      const req = http.request({
        hostname: 'localhost',
        port: check.port,
        path: check.path,
        method: 'GET',
        timeout,
      }, res => {
        const passed = res.statusCode === expectedStatus;
        resolve({
          name: check.name,
          type: 'http',
          passed,
          durationMs: Date.now() - startTime,
          message: passed ? 'OK' : `Expected ${expectedStatus}, got ${res.statusCode}`,
          details: { statusCode: res.statusCode, path: check.path },
        });
      });

      req.on('error', (err: any) => {
        resolve({
          name: check.name,
          type: 'http',
          passed: false,
          durationMs: Date.now() - startTime,
          message: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          name: check.name,
          type: 'http',
          passed: false,
          durationMs: Date.now() - startTime,
          message: 'Request timed out',
        });
      });

      req.end();
    });
  }

  /**
   * TCP port health check
   */
  private async checkTcpPort(
    container: Docker.Container,
    check: TcpHealthCheck
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeout = check.timeoutMs || this.config.defaultTimeoutMs;

    return new Promise(resolve => {
      const socket = new net.Socket();

      socket.setTimeout(timeout);

      socket.connect(check.port, 'localhost', () => {
        socket.destroy();
        resolve({
          name: check.name,
          type: 'tcp',
          passed: true,
          durationMs: Date.now() - startTime,
          message: 'Port is open',
          details: { port: check.port },
        });
      });

      socket.on('error', (err: any) => {
        socket.destroy();
        resolve({
          name: check.name,
          type: 'tcp',
          passed: false,
          durationMs: Date.now() - startTime,
          message: err.message,
          details: { port: check.port },
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          name: check.name,
          type: 'tcp',
          passed: false,
          durationMs: Date.now() - startTime,
          message: 'Connection timed out',
          details: { port: check.port },
        });
      });
    });
  }

  /**
   * Exec command health check
   */
  private async checkExecCommand(
    container: Docker.Container,
    check: ExecHealthCheck
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeout = check.timeoutMs || this.config.defaultTimeoutMs;
    const expectedExitCode = check.expectedExitCode ?? 0;

    try {
      const exec = await container.exec({
        Cmd: check.command,
        AttachStdout: true,
        AttachStderr: true,
      });

      const result = await Promise.race([
        exec.start({ Detach: false }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Exec timed out')), timeout)
        ),
      ]) as any;

      // Get exit code
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode;
      const passed = exitCode === expectedExitCode;

      return {
        name: check.name,
        type: 'exec',
        passed,
        durationMs: Date.now() - startTime,
        message: passed ? 'Command succeeded' : `Exit code ${exitCode}, expected ${expectedExitCode}`,
        details: { command: check.command.join(' '), exitCode },
      };

    } catch (error: any) {
      return {
        name: check.name,
        type: 'exec',
        passed: false,
        durationMs: Date.now() - startTime,
        message: error.message,
      };
    }
  }

  /**
   * Resource threshold check
   */
  private checkResourceThresholds(
    resources: ResourceUsage,
    thresholds: ResourceThresholds
  ): HealthCheckResult {
    const issues: string[] = [];

    if (thresholds.maxCpuPercent && resources.cpuPercent > thresholds.maxCpuPercent) {
      issues.push(`CPU ${resources.cpuPercent.toFixed(1)}% > ${thresholds.maxCpuPercent}%`);
    }

    if (thresholds.maxMemoryPercent && resources.memoryPercent > thresholds.maxMemoryPercent) {
      issues.push(`Memory ${resources.memoryPercent.toFixed(1)}% > ${thresholds.maxMemoryPercent}%`);
    }

    if (thresholds.maxPids && resources.pidsCount > thresholds.maxPids) {
      issues.push(`PIDs ${resources.pidsCount} > ${thresholds.maxPids}`);
    }

    return {
      name: 'resource-thresholds',
      type: 'resource',
      passed: issues.length === 0,
      durationMs: 0,
      message: issues.length === 0 ? 'Resources within limits' : issues.join(', '),
      details: { resources, thresholds },
    };
  }

  /**
   * Create unhealthy status
   */
  private createUnhealthyStatus(
    containerId: string,
    checks: HealthCheckResult[],
    prevStatus: HealthStatus | undefined,
    message: string
  ): HealthStatus {
    return {
      containerId,
      status: 'unhealthy',
      checks: [
        ...checks,
        {
          name: 'container-state',
          type: 'exec',
          passed: false,
          durationMs: 0,
          message,
        },
      ],
      resources: {
        cpuPercent: 0,
        memoryUsedBytes: 0,
        memoryLimitBytes: 0,
        memoryPercent: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        blockReadBytes: 0,
        blockWriteBytes: 0,
        pidsCount: 0,
      },
      lastChecked: Date.now(),
      uptimeMs: 0,
      consecutiveFailures: (prevStatus?.consecutiveFailures || 0) + 1,
    };
  }

  /**
   * Update status and emit events
   */
  private updateStatus(containerId: string, status: HealthStatus): void {
    const prevStatus = this.currentStatus.get(containerId);
    this.currentStatus.set(containerId, status);

    // Emit status change events
    if (prevStatus?.status !== status.status) {
      console.log(`[HealthMonitor] Container ${containerId.slice(0, 12)} status: ${prevStatus?.status || 'unknown'} -> ${status.status}`);

      this.emit('status-change', {
        containerId,
        previousStatus: prevStatus?.status || 'unknown',
        currentStatus: status.status,
        status,
      });

      if (status.status === 'unhealthy') {
        this.emit('unhealthy', status);
      } else if (status.status === 'degraded') {
        this.emit('degraded', status);
      } else if (prevStatus?.status !== 'healthy' && status.status === 'healthy') {
        this.emit('recovered', status);
      }
    }
  }

  /**
   * Record status in history
   */
  private recordHistory(containerId: string, status: HealthStatus): void {
    let history = this.healthHistory.get(containerId);

    if (!history) {
      history = { containerId, checks: [] };
      this.healthHistory.set(containerId, history);
    }

    history.checks.push({
      timestamp: status.lastChecked,
      status: status.status,
      checks: status.checks,
    });

    // Trim history to configured size
    if (history.checks.length > this.config.historySize) {
      history.checks = history.checks.slice(-this.config.historySize);
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    isMonitoring: boolean;
    registeredContainers: number;
    healthyContainers: number;
    degradedContainers: number;
    unhealthyContainers: number;
    unknownContainers: number;
    config: HealthMonitorConfig;
  } {
    const statuses = Array.from(this.currentStatus.values());

    return {
      isMonitoring: this.isMonitoring,
      registeredContainers: this.containerConfigs.size,
      healthyContainers: statuses.filter(s => s.status === 'healthy').length,
      degradedContainers: statuses.filter(s => s.status === 'degraded').length,
      unhealthyContainers: statuses.filter(s => s.status === 'unhealthy').length,
      unknownContainers: statuses.filter(s => s.status === 'unknown').length,
      config: this.config,
    };
  }

  /**
   * Get all current statuses
   */
  getAllStatuses(): HealthStatus[] {
    return Array.from(this.currentStatus.values());
  }

  /**
   * Get recovery history - containers that transitioned from unhealthy/degraded back to healthy
   */
  getRecoveryHistory(): Array<{
    containerId: string;
    projectId?: string;
    recoveredAt: number;
    previousStatus: string;
    downtimeMs: number;
  }> {
    const recoveries: Array<{
      containerId: string;
      projectId?: string;
      recoveredAt: number;
      previousStatus: string;
      downtimeMs: number;
    }> = [];

    for (const [containerId, history] of this.healthHistory) {
      const checks = history.checks;
      for (let i = 1; i < checks.length; i++) {
        const prev = checks[i - 1];
        const curr = checks[i];
        if (
          (prev.status === 'unhealthy' || prev.status === 'degraded') &&
          curr.status === 'healthy'
        ) {
          // Find how long the container was down
          let downtimeStart = prev.timestamp;
          for (let j = i - 2; j >= 0; j--) {
            if (checks[j].status === 'healthy') break;
            downtimeStart = checks[j].timestamp;
          }

          const currentStatus = this.currentStatus.get(containerId);
          recoveries.push({
            containerId,
            projectId: currentStatus?.projectId,
            recoveredAt: curr.timestamp,
            previousStatus: prev.status,
            downtimeMs: curr.timestamp - downtimeStart,
          });
        }
      }
    }

    return recoveries.sort((a, b) => b.recoveredAt - a.recoveredAt).slice(0, 50);
  }
}

// ==================== SINGLETON EXPORT ====================

export const healthMonitor = new HealthMonitor();

export default healthMonitor;
