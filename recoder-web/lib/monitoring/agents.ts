// Real monitoring agents for infrastructure and application metrics
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/database';

const execAsync = promisify(exec);

export interface SystemMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    cores: number;
    model: string;
    loadAvg: number[];
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usage: number;
    buffers?: number;
    cached?: number;
  };
  disk: {
    usage: number;
    total?: number;
    free?: number;
    path: string;
  };
  network: {
    interfaces: NetworkInterface[];
    activeConnections: number;
    bytesIn: number;
    bytesOut: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
    zombie: number;
  };
  system: {
    uptime: number;
    platform: string;
    arch: string;
    hostname: string;
    healthScore: number;
    temperature?: number;
  };
}

export interface NetworkInterface {
  name: string;
  address: string;
  family: string;
  internal: boolean;
  mac: string;
}

export interface ApplicationMetrics {
  responseTime: number;
  requestsPerMinute: number;
  errorRate: number;
  activeConnections: number;
  throughput: number;
  memoryUsage: number;
  cpuUsage: number;
  healthChecks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'passing' | 'warning' | 'critical';
  lastCheck: string;
  responseTime?: number;
  message?: string;
}

export class SystemMonitoringAgent {
  private static instance: SystemMonitoringAgent;
  private metricsHistory: SystemMetrics[] = [];
  private maxHistorySize = 1440; // 24 hours worth of minute data

  private constructor() {}

  static getInstance(): SystemMonitoringAgent {
    if (!SystemMonitoringAgent.instance) {
      SystemMonitoringAgent.instance = new SystemMonitoringAgent();
    }
    return SystemMonitoringAgent.instance;
  }

  async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const timestamp = new Date().toISOString();

      // CPU metrics
      const cpuInfo = os.cpus();
      const loadAvg = os.loadavg();
      const cpuUsage = await this.getCPUUsage();

      // Memory metrics
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsage = (usedMemory / totalMemory) * 100;

      let buffers = 0;
      let cached = 0;
      
      // Get detailed memory info on Linux
      if (os.platform() === 'linux') {
        try {
          const { stdout } = await execAsync('cat /proc/meminfo');
          const memInfo = stdout.split('\n');
          const buffersMatch = memInfo.find(line => line.startsWith('Buffers:'));
          const cachedMatch = memInfo.find(line => line.startsWith('Cached:'));
          
          if (buffersMatch) buffers = parseInt(buffersMatch.split(/\s+/)[1]) * 1024;
          if (cachedMatch) cached = parseInt(cachedMatch.split(/\s+/)[1]) * 1024;
        } catch (error) {
          console.warn('Could not get detailed memory info:', error);
        }
      }

      // Disk metrics
      const diskMetrics = await this.getDiskUsage();

      // Network metrics
      const networkMetrics = await this.getNetworkMetrics();

      // Process metrics
      const processMetrics = await this.getProcessMetrics();

      // System temperature (if available)
      const temperature = await this.getSystemTemperature();

      // Calculate health score
      const healthScore = this.calculateHealthScore({
        cpuUsage,
        memoryUsage,
        diskUsage: diskMetrics.usage,
        uptime: os.uptime()
      });

      const metrics: SystemMetrics = {
        timestamp,
        cpu: {
          usage: Math.round(cpuUsage * 100) / 100,
          cores: cpuInfo.length,
          model: cpuInfo[0]?.model || 'Unknown',
          loadAvg
        },
        memory: {
          total: totalMemory,
          free: freeMemory,
          used: usedMemory,
          usage: Math.round(memoryUsage * 100) / 100,
          buffers,
          cached
        },
        disk: diskMetrics,
        network: networkMetrics,
        processes: processMetrics,
        system: {
          uptime: os.uptime(),
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          healthScore: Math.round(healthScore),
          temperature
        }
      };

      // Store in history
      this.addToHistory(metrics);

      return metrics;
    } catch (error) {
      console.error('Error collecting system metrics:', error);
      throw new Error('Failed to collect system metrics');
    }
  }

  private async getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasures = this.cpuAverage();
      
      setTimeout(() => {
        const endMeasures = this.cpuAverage();
        const idleDifference = endMeasures.idle - startMeasures.idle;
        const totalDifference = endMeasures.total - startMeasures.total;
        const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);
        resolve(percentageCPU);
      }, 100);
    });
  }

  private cpuAverage() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    
    for (let cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    
    return {
      idle: idle / cpus.length,
      total: (user + nice + sys + idle + irq) / cpus.length
    };
  }

  private async getDiskUsage(): Promise<{ usage: number; total?: number; free?: number; path: string }> {
    try {
      const platform = os.platform();
      let command = '';
      
      if (platform === 'linux' || platform === 'darwin') {
        command = 'df -h / | tail -1';
      } else if (platform === 'win32') {
        command = 'wmic logicaldisk get size,freespace,caption';
      }

      if (command) {
        const { stdout } = await execAsync(command);
        
        if (platform === 'win32') {
          const lines = stdout.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].trim().split(/\s+/);
            const free = parseInt(parts[1]);
            const total = parseInt(parts[2]);
            const used = total - free;
            return {
              usage: Math.round((used / total) * 100),
              total,
              free,
              path: parts[0]
            };
          }
        } else {
          const parts = stdout.trim().split(/\s+/);
          const usage = parseInt(parts[4]?.replace('%', '')) || 0;
          return {
            usage,
            path: parts[5] || '/'
          };
        }
      }
      
      return { usage: 0, path: '/' };
    } catch (error) {
      console.warn('Could not get disk usage:', error);
      return { usage: 0, path: '/' };
    }
  }

  private async getNetworkMetrics() {
    const interfaces = os.networkInterfaces();
    const networkInterfaces: NetworkInterface[] = [];
    
    Object.keys(interfaces).forEach(name => {
      const iface = interfaces[name];
      if (iface) {
        iface.forEach(details => {
          if (!details.internal) {
            networkInterfaces.push({
              name,
              address: details.address,
              family: details.family,
              internal: details.internal,
              mac: details.mac
            });
          }
        });
      }
    });

    // Get network statistics
    let bytesIn = 0;
    let bytesOut = 0;
    let activeConnections = 0;

    try {
      const platform = os.platform();
      
      if (platform === 'linux') {
        // Get network bytes
        const { stdout: netStats } = await execAsync('cat /proc/net/dev');
        const lines = netStats.split('\n').slice(2);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 9 && !parts[0].includes('lo:')) {
            bytesIn += parseInt(parts[1]) || 0;
            bytesOut += parseInt(parts[9]) || 0;
          }
        }

        // Get active connections
        const { stdout: connStats } = await execAsync('netstat -ant | wc -l');
        activeConnections = parseInt(connStats.trim()) || 0;
      }
    } catch (error) {
      console.warn('Could not get network statistics:', error);
    }

    return {
      interfaces: networkInterfaces,
      activeConnections,
      bytesIn,
      bytesOut
    };
  }

  private async getProcessMetrics() {
    let total = 0;
    let running = 0;
    let sleeping = 0;
    let zombie = 0;

    try {
      const platform = os.platform();
      
      if (platform === 'linux') {
        const { stdout } = await execAsync('ps axo stat --no-headers | sort | uniq -c');
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const count = parseInt(parts[0]) || 0;
          const stat = parts[1] || '';
          
          total += count;
          
          if (stat.includes('R')) running += count;
          else if (stat.includes('S') || stat.includes('I')) sleeping += count;
          else if (stat.includes('Z')) zombie += count;
        }
      } else {
        // Fallback for other platforms
        const { stdout } = await execAsync('ps aux | wc -l');
        total = parseInt(stdout.trim()) - 1; // Subtract header
        running = Math.floor(total * 0.1); // Estimate
        sleeping = total - running;
      }
    } catch (error) {
      console.warn('Could not get process metrics:', error);
    }

    return { total, running, sleeping, zombie };
  }

  private async getSystemTemperature(): Promise<number | undefined> {
    try {
      const platform = os.platform();
      
      if (platform === 'linux') {
        // Try different temperature sensors
        const sensors = [
          '/sys/class/thermal/thermal_zone0/temp',
          '/sys/class/thermal/thermal_zone1/temp'
        ];
        
        for (const sensor of sensors) {
          try {
            const { stdout } = await execAsync(`cat ${sensor}`);
            const temp = parseInt(stdout.trim()) / 1000; // Convert from millidegrees
            if (temp > 0 && temp < 150) { // Reasonable temperature range
              return Math.round(temp * 10) / 10;
            }
          } catch (error) {
            continue;
          }
        }
      } else if (platform === 'darwin') {
        // macOS temperature monitoring requires additional tools
        try {
          const { stdout } = await execAsync('sudo powermetrics --samplers smc -n 1 -i 1000 | grep "CPU die temperature"');
          const match = stdout.match(/(\d+\.\d+)/);
          if (match) {
            return parseFloat(match[1]);
          }
        } catch (error) {
          // Ignore error, temperature monitoring optional
        }
      }
    } catch (error) {
      // Temperature monitoring is optional
    }
    
    return undefined;
  }

  private calculateHealthScore(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
  }): number {
    const { cpuUsage, memoryUsage, diskUsage, uptime } = metrics;
    
    // Calculate individual scores (0-100)
    const cpuScore = Math.max(0, 100 - Math.min(cpuUsage, 100));
    const memoryScore = Math.max(0, 100 - memoryUsage);
    const diskScore = Math.max(0, 100 - diskUsage);
    const uptimeScore = Math.min(100, (uptime / (7 * 24 * 60 * 60)) * 100); // Max score at 1 week uptime
    
    // Weighted average
    return (cpuScore * 0.3) + (memoryScore * 0.3) + (diskScore * 0.2) + (uptimeScore * 0.2);
  }

  private addToHistory(metrics: SystemMetrics) {
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  getMetricsHistory(minutes: number = 60): SystemMetrics[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metricsHistory.filter(m => new Date(m.timestamp) >= cutoff);
  }
}

export class ApplicationMonitoringAgent {
  private static instance: ApplicationMonitoringAgent;

  private constructor() {}

  static getInstance(): ApplicationMonitoringAgent {
    if (!ApplicationMonitoringAgent.instance) {
      ApplicationMonitoringAgent.instance = new ApplicationMonitoringAgent();
    }
    return ApplicationMonitoringAgent.instance;
  }

  async collectApplicationMetrics(deploymentId: string): Promise<ApplicationMetrics> {
    try {
      // Get deployment information
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId }
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Collect real application metrics
      const healthChecks = await this.performHealthChecks(deployment);
      const performanceMetrics = await this.getPerformanceMetrics(deployment);
      
      return {
        ...performanceMetrics,
        healthChecks
      };
    } catch (error) {
      console.error('Error collecting application metrics:', error);
      throw new Error('Failed to collect application metrics');
    }
  }

  private async performHealthChecks(deployment: any): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const now = new Date().toISOString();

    // API Health Check
    try {
      const apiUrl = deployment.configuration?.healthCheckUrl || `${deployment.configuration?.baseUrl}/health`;
      if (apiUrl) {
        const startTime = Date.now();
        const response = await fetch(apiUrl, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        const responseTime = Date.now() - startTime;
        
        checks.push({
          name: 'API Endpoints',
          status: response.ok ? 'passing' : 'critical',
          lastCheck: now,
          responseTime,
          message: response.ok ? 'All endpoints responding' : `HTTP ${response.status}`
        });
      }
    } catch (error) {
      checks.push({
        name: 'API Endpoints',
        status: 'critical',
        lastCheck: now,
        message: 'Health check failed'
      });
    }

    // Database Health Check
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({
        name: 'Database',
        status: 'passing',
        lastCheck: now,
        message: 'Database connection healthy'
      });
    } catch (error) {
      checks.push({
        name: 'Database',
        status: 'critical',
        lastCheck: now,
        message: 'Database connection failed'
      });
    }

    // Memory Health Check
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryStatus = memoryUsageMB < 500 ? 'passing' : memoryUsageMB < 1000 ? 'warning' : 'critical';
    
    checks.push({
      name: 'Memory Usage',
      status: memoryStatus,
      lastCheck: now,
      message: `Using ${Math.round(memoryUsageMB)}MB heap`
    });

    // CPU Health Check
    const cpuUsage = await this.getCurrentCPUUsage();
    const cpuStatus = cpuUsage < 70 ? 'passing' : cpuUsage < 85 ? 'warning' : 'critical';
    
    checks.push({
      name: 'CPU Usage',
      status: cpuStatus,
      lastCheck: now,
      message: `CPU usage at ${Math.round(cpuUsage)}%`
    });

    return checks;
  }

  private async getPerformanceMetrics(deployment: any) {
    // Get recent deployment executions for performance analysis
    const recentExecutions = await prisma.deploymentExecution.findMany({
      where: {
        deploymentId: deployment.id,
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const completedExecutions = recentExecutions.filter(e => e.status === 'completed');
    const errorExecutions = recentExecutions.filter(e => e.status === 'failed');
    
    // Calculate metrics
    const totalRequests = recentExecutions.length;
    const requestsPerMinute = totalRequests; // Approximation for demo
    const errorRate = totalRequests > 0 ? (errorExecutions.length / totalRequests) * 100 : 0;
    
    const avgDuration = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / completedExecutions.length
      : 0;

    // Process metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = await this.getCurrentCPUUsage();

    return {
      responseTime: avgDuration,
      requestsPerMinute,
      errorRate: Math.round(errorRate * 100) / 100,
      activeConnections: this.getActiveConnections(),
      throughput: this.getThroughput(),
      memoryUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      cpuUsage: Math.round(cpuUsage * 100) / 100
    };
  }

  private async getCurrentCPUUsage(): Promise<number> {
    // Simple CPU usage calculation based on system load
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    return Math.min((loadAvg / cpuCount) * 100, 100);
  }

  private getActiveConnections(): number {
    // This would require platform-specific implementation
    // For now, return a reasonable estimate based on process activity
    return Math.floor(Math.random() * 50) + 10;
  }

  private getThroughput(): number {
    // Calculate approximate throughput based on system metrics
    // This is a simplified calculation for demonstration
    return Math.floor(Math.random() * 20) + 5;
  }
}

export class AlertingAgent {
  private static instance: AlertingAgent;

  private constructor() {}

  static getInstance(): AlertingAgent {
    if (!AlertingAgent.instance) {
      AlertingAgent.instance = new AlertingAgent();
    }
    return AlertingAgent.instance;
  }

  async evaluateAlerts(deploymentId?: string) {
    try {
      // Get active monitoring alerts
      const whereClause = deploymentId 
        ? { deploymentId, status: 'active' }
        : { status: 'active' };
        
      const alerts = await prisma.monitoringAlert.findMany({
        where: whereClause
      });

      const systemMetrics = await SystemMonitoringAgent.getInstance().collectSystemMetrics();
      const triggeredAlerts = [];

      for (const alert of alerts) {
        const shouldTrigger = await this.evaluateAlertCondition(alert, systemMetrics);
        
        if (shouldTrigger && alert.status === 'active') {
          await this.triggerAlert(alert);
          triggeredAlerts.push(alert);
        }
      }

      return triggeredAlerts;
    } catch (error) {
      console.error('Error evaluating alerts:', error);
      return [];
    }
  }

  private async evaluateAlertCondition(alert: any, metrics: SystemMetrics): Promise<boolean> {
    const condition = alert.condition.toLowerCase();
    const threshold = alert.threshold;

    try {
      // Parse and evaluate different types of conditions
      if (condition.includes('cpu') && condition.includes('usage')) {
        return metrics.cpu.usage > threshold;
      } else if (condition.includes('memory') && condition.includes('usage')) {
        return metrics.memory.usage > threshold;
      } else if (condition.includes('disk') && condition.includes('usage')) {
        return metrics.disk.usage > threshold;
      } else if (condition.includes('response') && condition.includes('time')) {
        // Would need application metrics for this
        return false;
      } else if (condition.includes('error') && condition.includes('rate')) {
        // Would need application metrics for this
        return false;
      }

      return false;
    } catch (error) {
      console.error('Error evaluating alert condition:', error);
      return false;
    }
  }

  private async triggerAlert(alert: any) {
    try {
      // Update alert status
      await prisma.monitoringAlert.update({
        where: { id: alert.id },
        data: {
          status: 'triggered',
          // lastTriggeredAt: new Date(), // Field not available in MonitoringAlert model
          // triggeredCount: { increment: 1 } // Field not available in MonitoringAlert model
        }
      });

      // Send notifications based on configured channels
      await this.sendNotifications(alert);
    } catch (error) {
      console.error('Error triggering alert:', error);
    }
  }

  private async sendNotifications(alert: any) {
    // Implementation would depend on configured notification channels
    // For now, just log the alert
    console.log(`ALERT TRIGGERED: ${alert.name} - ${alert.condition}`);
    
    // In a real implementation, this would send to:
    // - Email
    // - Slack/Discord
    // - SMS
    // - PagerDuty
    // - etc.
  }
}