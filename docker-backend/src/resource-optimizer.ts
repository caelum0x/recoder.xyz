/**
 * Resource Optimizer - Auto-scale resources based on usage patterns
 *
 * Features:
 * - Dynamic resource allocation based on usage
 * - Automatic scaling of memory and CPU limits
 * - Resource usage prediction
 * - Cost optimization recommendations
 * - Load balancing across containers
 *
 * Inspired by patterns from libra deployment workflow and dyad performance monitoring
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { healthMonitor, type HealthStatus, type ResourceUsage } from './health-monitor.js';

const docker = new Docker();

// ==================== TYPES ====================

export interface ResourceProfile {
  containerId: string;
  projectId?: string;
  samples: ResourceSample[];
  predictions: ResourcePrediction;
  recommendations: ResourceRecommendation[];
  lastOptimized: number;
}

export interface ResourceSample {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedBytes: number;
  networkRxBytesPerSec: number;
  networkTxBytesPerSec: number;
  pidsCount: number;
}

export interface ResourcePrediction {
  peakCpuPercent: number;
  peakMemoryPercent: number;
  avgCpuPercent: number;
  avgMemoryPercent: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;  // 0-100
}

export interface ResourceRecommendation {
  type: 'scale-up' | 'scale-down' | 'optimize' | 'warning';
  resource: 'cpu' | 'memory' | 'pids' | 'network';
  currentValue: number;
  recommendedValue: number;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedSavings?: number;  // percentage
}

export interface ScalingPolicy {
  minMemoryBytes: number;
  maxMemoryBytes: number;
  minCpuQuota: number;      // percentage * 1000 (e.g., 50000 = 50%)
  maxCpuQuota: number;
  scaleUpThreshold: number;  // percentage - scale up when usage exceeds this
  scaleDownThreshold: number; // percentage - scale down when usage below this
  cooldownPeriodMs: number;  // minimum time between scaling actions
  scaleStepPercent: number;  // how much to scale by each time
}

export interface OptimizerConfig {
  sampleIntervalMs: number;
  sampleRetentionMs: number;
  optimizationIntervalMs: number;
  predictionWindowMs: number;
  defaultPolicy: ScalingPolicy;
}

export interface OptimizationResult {
  containerId: string;
  action: 'scaled-up' | 'scaled-down' | 'no-change';
  changes: Array<{
    resource: string;
    previousValue: number;
    newValue: number;
  }>;
  reason: string;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: OptimizerConfig = {
  sampleIntervalMs: Number(process.env.OPTIMIZER_SAMPLE_INTERVAL_MS) || 10000,  // 10 seconds
  sampleRetentionMs: Number(process.env.OPTIMIZER_SAMPLE_RETENTION_MS) || 3600000,  // 1 hour
  optimizationIntervalMs: Number(process.env.OPTIMIZER_OPTIMIZATION_INTERVAL_MS) || 60000,  // 1 minute
  predictionWindowMs: Number(process.env.OPTIMIZER_PREDICTION_WINDOW_MS) || 300000,  // 5 minutes
  defaultPolicy: {
    minMemoryBytes: 256 * 1024 * 1024,      // 256MB
    maxMemoryBytes: 8 * 1024 * 1024 * 1024,  // 8GB
    minCpuQuota: 25000,                       // 25%
    maxCpuQuota: 400000,                      // 400% (4 CPUs)
    scaleUpThreshold: 80,                     // scale up at 80% usage
    scaleDownThreshold: 30,                   // scale down at 30% usage
    cooldownPeriodMs: 300000,                 // 5 minute cooldown
    scaleStepPercent: 25,                     // scale by 25% each time
  },
};

// ==================== RESOURCE OPTIMIZER ====================

class ResourceOptimizer extends EventEmitter {
  private config: OptimizerConfig;
  private profiles: Map<string, ResourceProfile> = new Map();
  private policies: Map<string, ScalingPolicy> = new Map();
  private lastScalingAction: Map<string, number> = new Map();
  private sampleInterval?: ReturnType<typeof setInterval>;
  private optimizationInterval?: ReturnType<typeof setInterval>;
  private isRunning = false;
  private previousNetworkStats: Map<string, { rx: number; tx: number; timestamp: number }> = new Map();

  constructor(config: Partial<OptimizerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the resource optimizer
   */
  start(): void {
    if (this.isRunning) {
      console.log('[ResourceOptimizer] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[ResourceOptimizer] Starting resource optimization');

    // Start sampling
    this.sampleInterval = setInterval(() => {
      this.collectSamples().catch(err => {
        console.error('[ResourceOptimizer] Error collecting samples:', err.message);
      });
    }, this.config.sampleIntervalMs);

    // Start optimization checks
    this.optimizationInterval = setInterval(() => {
      this.runOptimization().catch(err => {
        console.error('[ResourceOptimizer] Error running optimization:', err.message);
      });
    }, this.config.optimizationIntervalMs);

    // Listen to health monitor for resource data
    healthMonitor.on('status-change', (event: { status: HealthStatus }) => {
      this.processHealthStatus(event.status);
    });

    console.log('[ResourceOptimizer] Started successfully');
  }

  /**
   * Stop the resource optimizer
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = undefined;
    }

    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = undefined;
    }

    console.log('[ResourceOptimizer] Stopped');
  }

  /**
   * Register a container for optimization
   */
  registerContainer(containerId: string, policy?: Partial<ScalingPolicy>): void {
    const fullPolicy: ScalingPolicy = { ...this.config.defaultPolicy, ...policy };
    this.policies.set(containerId, fullPolicy);

    this.profiles.set(containerId, {
      containerId,
      samples: [],
      predictions: {
        peakCpuPercent: 0,
        peakMemoryPercent: 0,
        avgCpuPercent: 0,
        avgMemoryPercent: 0,
        trend: 'stable',
        confidence: 0,
      },
      recommendations: [],
      lastOptimized: 0,
    });

    console.log(`[ResourceOptimizer] Registered container ${containerId.slice(0, 12)}`);
  }

  /**
   * Unregister a container
   */
  unregisterContainer(containerId: string): void {
    this.profiles.delete(containerId);
    this.policies.delete(containerId);
    this.lastScalingAction.delete(containerId);
    this.previousNetworkStats.delete(containerId);

    console.log(`[ResourceOptimizer] Unregistered container ${containerId.slice(0, 12)}`);
  }

  /**
   * Get resource profile for a container
   */
  getProfile(containerId: string): ResourceProfile | null {
    return this.profiles.get(containerId) || null;
  }

  /**
   * Get recommendations for a container
   */
  getRecommendations(containerId: string): ResourceRecommendation[] {
    const profile = this.profiles.get(containerId);
    return profile?.recommendations || [];
  }

  /**
   * Manually trigger optimization for a container
   */
  async optimize(containerId: string): Promise<OptimizationResult> {
    const profile = this.profiles.get(containerId);
    const policy = this.policies.get(containerId);

    if (!profile || !policy) {
      return {
        containerId,
        action: 'no-change',
        changes: [],
        reason: 'Container not registered',
      };
    }

    return this.optimizeContainer(containerId, profile, policy);
  }

  /**
   * Collect resource samples from all registered containers
   */
  private async collectSamples(): Promise<void> {
    const containerIds = Array.from(this.profiles.keys());

    for (const containerId of containerIds) {
      try {
        const sample = await this.getSample(containerId);
        if (sample) {
          this.addSample(containerId, sample);
        }
      } catch (error: any) {
        console.error(`[ResourceOptimizer] Error sampling ${containerId.slice(0, 12)}:`, error.message);
      }
    }
  }

  /**
   * Get a resource sample from a container
   */
  private async getSample(containerId: string): Promise<ResourceSample | null> {
    try {
      const container = docker.getContainer(containerId);
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

      // Network stats (calculate rate)
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        for (const net of Object.values(stats.networks) as any[]) {
          networkRx += net.rx_bytes || 0;
          networkTx += net.tx_bytes || 0;
        }
      }

      const now = Date.now();
      const prevNetwork = this.previousNetworkStats.get(containerId);
      let rxBytesPerSec = 0;
      let txBytesPerSec = 0;

      if (prevNetwork) {
        const timeDelta = (now - prevNetwork.timestamp) / 1000;
        if (timeDelta > 0) {
          rxBytesPerSec = (networkRx - prevNetwork.rx) / timeDelta;
          txBytesPerSec = (networkTx - prevNetwork.tx) / timeDelta;
        }
      }

      this.previousNetworkStats.set(containerId, {
        rx: networkRx,
        tx: networkTx,
        timestamp: now,
      });

      return {
        timestamp: now,
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryPercent: Math.round(memoryPercent * 100) / 100,
        memoryUsedBytes: memoryUsed,
        networkRxBytesPerSec: Math.round(rxBytesPerSec),
        networkTxBytesPerSec: Math.round(txBytesPerSec),
        pidsCount: stats.pids_stats?.current || 0,
      };

    } catch (error: any) {
      return null;
    }
  }

  /**
   * Add a sample to a container's profile
   */
  private addSample(containerId: string, sample: ResourceSample): void {
    const profile = this.profiles.get(containerId);
    if (!profile) return;

    profile.samples.push(sample);

    // Remove old samples
    const cutoff = Date.now() - this.config.sampleRetentionMs;
    profile.samples = profile.samples.filter(s => s.timestamp > cutoff);

    // Update predictions
    this.updatePredictions(profile);
  }

  /**
   * Process health status from health monitor
   */
  private processHealthStatus(status: HealthStatus): void {
    const profile = this.profiles.get(status.containerId);
    if (!profile) return;

    // Use health monitor resource data as a sample
    const sample: ResourceSample = {
      timestamp: status.lastChecked,
      cpuPercent: status.resources.cpuPercent,
      memoryPercent: status.resources.memoryPercent,
      memoryUsedBytes: status.resources.memoryUsedBytes,
      networkRxBytesPerSec: 0,  // Not available from health status
      networkTxBytesPerSec: 0,
      pidsCount: status.resources.pidsCount,
    };

    this.addSample(status.containerId, sample);
  }

  /**
   * Update predictions based on samples
   */
  private updatePredictions(profile: ResourceProfile): void {
    const samples = profile.samples;
    if (samples.length < 3) {
      profile.predictions.confidence = 0;
      return;
    }

    // Calculate statistics
    const cpuValues = samples.map(s => s.cpuPercent);
    const memValues = samples.map(s => s.memoryPercent);

    profile.predictions.peakCpuPercent = Math.max(...cpuValues);
    profile.predictions.peakMemoryPercent = Math.max(...memValues);
    profile.predictions.avgCpuPercent = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
    profile.predictions.avgMemoryPercent = memValues.reduce((a, b) => a + b, 0) / memValues.length;

    // Calculate trend (simple linear regression on memory)
    const recentSamples = samples.slice(-Math.min(10, samples.length));
    if (recentSamples.length >= 3) {
      const slope = this.calculateSlope(recentSamples.map(s => s.memoryPercent));

      if (slope > 1) {
        profile.predictions.trend = 'increasing';
      } else if (slope < -1) {
        profile.predictions.trend = 'decreasing';
      } else {
        profile.predictions.trend = 'stable';
      }
    }

    // Confidence based on sample count and consistency
    const variance = this.calculateVariance(memValues);
    const sampleFactor = Math.min(samples.length / 30, 1);  // Max at 30 samples
    const varianceFactor = Math.max(0, 1 - variance / 100);  // Lower confidence with high variance
    profile.predictions.confidence = Math.round(sampleFactor * varianceFactor * 100);
  }

  /**
   * Calculate slope for trend detection
   */
  private calculateSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Run optimization for all registered containers
   */
  private async runOptimization(): Promise<void> {
    const containerIds = Array.from(this.profiles.keys());

    for (const containerId of containerIds) {
      const profile = this.profiles.get(containerId);
      const policy = this.policies.get(containerId);

      if (!profile || !policy) continue;

      try {
        // Generate recommendations
        this.generateRecommendations(profile, policy);

        // Auto-optimize if enabled
        const result = await this.optimizeContainer(containerId, profile, policy);

        if (result.action !== 'no-change') {
          this.emit('optimization', result);
        }
      } catch (error: any) {
        console.error(`[ResourceOptimizer] Error optimizing ${containerId.slice(0, 12)}:`, error.message);
      }
    }
  }

  /**
   * Generate recommendations for a container
   */
  private generateRecommendations(profile: ResourceProfile, policy: ScalingPolicy): void {
    const recommendations: ResourceRecommendation[] = [];
    const pred = profile.predictions;

    // Memory recommendations
    if (pred.avgMemoryPercent > policy.scaleUpThreshold) {
      recommendations.push({
        type: 'scale-up',
        resource: 'memory',
        currentValue: pred.avgMemoryPercent,
        recommendedValue: pred.avgMemoryPercent + policy.scaleStepPercent,
        reason: `Memory usage consistently above ${policy.scaleUpThreshold}%`,
        priority: pred.avgMemoryPercent > 90 ? 'critical' : 'high',
      });
    } else if (pred.avgMemoryPercent < policy.scaleDownThreshold && pred.trend !== 'increasing') {
      recommendations.push({
        type: 'scale-down',
        resource: 'memory',
        currentValue: pred.avgMemoryPercent,
        recommendedValue: pred.avgMemoryPercent - policy.scaleStepPercent,
        reason: `Memory usage consistently below ${policy.scaleDownThreshold}%`,
        priority: 'low',
        estimatedSavings: Math.round((policy.scaleDownThreshold - pred.avgMemoryPercent) * 0.5),
      });
    }

    // CPU recommendations
    if (pred.avgCpuPercent > policy.scaleUpThreshold) {
      recommendations.push({
        type: 'scale-up',
        resource: 'cpu',
        currentValue: pred.avgCpuPercent,
        recommendedValue: pred.avgCpuPercent + policy.scaleStepPercent,
        reason: `CPU usage consistently above ${policy.scaleUpThreshold}%`,
        priority: pred.avgCpuPercent > 90 ? 'critical' : 'high',
      });
    } else if (pred.avgCpuPercent < policy.scaleDownThreshold && pred.trend !== 'increasing') {
      recommendations.push({
        type: 'scale-down',
        resource: 'cpu',
        currentValue: pred.avgCpuPercent,
        recommendedValue: pred.avgCpuPercent - policy.scaleStepPercent,
        reason: `CPU usage consistently below ${policy.scaleDownThreshold}%`,
        priority: 'low',
        estimatedSavings: Math.round((policy.scaleDownThreshold - pred.avgCpuPercent) * 0.5),
      });
    }

    // Warning for increasing trend
    if (pred.trend === 'increasing' && pred.avgMemoryPercent > 60) {
      recommendations.push({
        type: 'warning',
        resource: 'memory',
        currentValue: pred.avgMemoryPercent,
        recommendedValue: pred.avgMemoryPercent,
        reason: 'Memory usage showing increasing trend - may need scaling soon',
        priority: 'medium',
      });
    }

    profile.recommendations = recommendations;
  }

  /**
   * Optimize a container based on policy and recommendations
   */
  private async optimizeContainer(
    containerId: string,
    profile: ResourceProfile,
    policy: ScalingPolicy
  ): Promise<OptimizationResult> {
    // Check cooldown period
    const lastAction = this.lastScalingAction.get(containerId) || 0;
    if (Date.now() - lastAction < policy.cooldownPeriodMs) {
      return {
        containerId,
        action: 'no-change',
        changes: [],
        reason: 'Cooldown period active',
      };
    }

    // Check confidence
    if (profile.predictions.confidence < 50) {
      return {
        containerId,
        action: 'no-change',
        changes: [],
        reason: 'Insufficient data confidence',
      };
    }

    const changes: OptimizationResult['changes'] = [];
    const pred = profile.predictions;

    try {
      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      let needsUpdate = false;
      const updateConfig: { Memory?: number; MemorySwap?: number; CpuShares?: number; CpuQuota?: number } = {};

      // Memory scaling
      const currentMemory = info.HostConfig?.Memory || 0;

      if (pred.avgMemoryPercent > policy.scaleUpThreshold) {
        const newMemory = Math.min(
          Math.round(currentMemory * (1 + policy.scaleStepPercent / 100)),
          policy.maxMemoryBytes
        );

        if (newMemory > currentMemory && newMemory <= policy.maxMemoryBytes) {
          updateConfig.Memory = newMemory;
          updateConfig.MemorySwap = newMemory;
          changes.push({
            resource: 'memory',
            previousValue: currentMemory,
            newValue: newMemory,
          });
          needsUpdate = true;
        }
      } else if (pred.avgMemoryPercent < policy.scaleDownThreshold) {
        const newMemory = Math.max(
          Math.round(currentMemory * (1 - policy.scaleStepPercent / 100)),
          policy.minMemoryBytes
        );

        if (newMemory < currentMemory && newMemory >= policy.minMemoryBytes) {
          updateConfig.Memory = newMemory;
          updateConfig.MemorySwap = newMemory;
          changes.push({
            resource: 'memory',
            previousValue: currentMemory,
            newValue: newMemory,
          });
          needsUpdate = true;
        }
      }

      // CPU scaling
      const currentCpuQuota = info.HostConfig?.CpuQuota || 0;

      if (pred.avgCpuPercent > policy.scaleUpThreshold) {
        const newCpuQuota = Math.min(
          Math.round(currentCpuQuota * (1 + policy.scaleStepPercent / 100)),
          policy.maxCpuQuota
        );

        if (newCpuQuota > currentCpuQuota && newCpuQuota <= policy.maxCpuQuota) {
          updateConfig.CpuQuota = newCpuQuota;
          changes.push({
            resource: 'cpu',
            previousValue: currentCpuQuota,
            newValue: newCpuQuota,
          });
          needsUpdate = true;
        }
      } else if (pred.avgCpuPercent < policy.scaleDownThreshold) {
        const newCpuQuota = Math.max(
          Math.round(currentCpuQuota * (1 - policy.scaleStepPercent / 100)),
          policy.minCpuQuota
        );

        if (newCpuQuota < currentCpuQuota && newCpuQuota >= policy.minCpuQuota) {
          updateConfig.CpuQuota = newCpuQuota;
          changes.push({
            resource: 'cpu',
            previousValue: currentCpuQuota,
            newValue: newCpuQuota,
          });
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await container.update(updateConfig);
        this.lastScalingAction.set(containerId, Date.now());
        profile.lastOptimized = Date.now();

        const action = changes.some(c => c.newValue > c.previousValue)
          ? 'scaled-up'
          : 'scaled-down';

        console.log(`[ResourceOptimizer] ${action} container ${containerId.slice(0, 12)}:`,
          changes.map(c => `${c.resource}: ${c.previousValue} -> ${c.newValue}`).join(', '));

        return {
          containerId,
          action,
          changes,
          reason: `Resource usage ${action === 'scaled-up' ? 'above' : 'below'} threshold`,
        };
      }

      return {
        containerId,
        action: 'no-change',
        changes: [],
        reason: 'Resources within acceptable range',
      };

    } catch (error: any) {
      console.error(`[ResourceOptimizer] Failed to optimize ${containerId.slice(0, 12)}:`, error.message);
      return {
        containerId,
        action: 'no-change',
        changes: [],
        reason: `Error: ${error.message}`,
      };
    }
  }

  /**
   * Get optimizer statistics
   */
  getStats(): {
    isRunning: boolean;
    registeredContainers: number;
    totalSamples: number;
    totalRecommendations: number;
    config: OptimizerConfig;
  } {
    let totalSamples = 0;
    let totalRecommendations = 0;

    for (const profile of this.profiles.values()) {
      totalSamples += profile.samples.length;
      totalRecommendations += profile.recommendations.length;
    }

    return {
      isRunning: this.isRunning,
      registeredContainers: this.profiles.size,
      totalSamples,
      totalRecommendations,
      config: this.config,
    };
  }

  /**
   * Get all profiles
   */
  getAllProfiles(): ResourceProfile[] {
    return Array.from(this.profiles.values());
  }
}

// ==================== SINGLETON EXPORT ====================

export const resourceOptimizer = new ResourceOptimizer();

export default resourceOptimizer;
