import { EventEmitter } from 'events'

export interface PerformanceMetrics {
  timestamp: Date
  cpu: {
    usage: number
    cores: number
    loadAverage: number[]
  }
  memory: {
    used: number
    free: number
    total: number
    usage: number
  }
  disk: {
    used: number
    free: number
    total: number
    usage: number
  }
  network: {
    bytesIn: number
    bytesOut: number
    packetsIn: number
    packetsOut: number
  }
  processes: {
    active: number
    total: number
    ffmpeg: number
  }
}

export interface ProcessingMetrics {
  queueLength: number
  activeJobs: number
  completedJobs: number
  failedJobs: number
  averageProcessingTime: number
  throughput: number // jobs per hour
  errorRate: number
}

export interface CacheMetrics {
  hits: number
  misses: number
  hitRate: number
  size: number
  maxSize: number
  evictions: number
}

export interface AlertThreshold {
  metric: string
  operator: 'gt' | 'lt' | 'eq'
  value: number
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  enabled: boolean
}

export interface PerformanceAlert {
  id: string
  timestamp: Date
  severity: 'info' | 'warning' | 'error' | 'critical'
  metric: string
  value: number
  threshold: number
  message: string
  resolved: boolean
  resolvedAt?: Date
}

export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics[] = []
  private processingMetrics: ProcessingMetrics[] = []
  private cacheMetrics: CacheMetrics[] = []
  private alerts: PerformanceAlert[] = []
  private alertThresholds: AlertThreshold[] = []
  private monitoringInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private maxHistorySize = 1000

  constructor() {
    super()
    this.setupDefaultThresholds()
  }

  start(intervalMs: number = 10000) {
    if (this.isRunning) return

    this.isRunning = true
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, intervalMs)

    this.emit('monitoring_started', { interval: intervalMs })
  }

  stop() {
    if (!this.isRunning) return

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    this.isRunning = false
    this.emit('monitoring_stopped')
  }

  private async collectMetrics() {
    try {
      const systemMetrics = await this.getSystemMetrics()
      const processingMetrics = await this.getProcessingMetrics()
      const cacheMetrics = await this.getCacheMetrics()

      this.metrics.push(systemMetrics)
      this.processingMetrics.push(processingMetrics)
      this.cacheMetrics.push(cacheMetrics)

      // Limit history size
      if (this.metrics.length > this.maxHistorySize) {
        this.metrics.shift()
      }
      if (this.processingMetrics.length > this.maxHistorySize) {
        this.processingMetrics.shift()
      }
      if (this.cacheMetrics.length > this.maxHistorySize) {
        this.cacheMetrics.shift()
      }

      // Check thresholds and generate alerts
      this.checkThresholds(systemMetrics, processingMetrics, cacheMetrics)

      this.emit('metrics_collected', {
        system: systemMetrics,
        processing: processingMetrics,
        cache: cacheMetrics
      })

    } catch (error) {
      console.error('Error collecting performance metrics:', error)
      this.emit('collection_error', error)
    }
  }

  private async getSystemMetrics(): Promise<PerformanceMetrics> {
    // Mock system metrics - in production, use actual system APIs
    return {
      timestamp: new Date(),
      cpu: {
        usage: Math.random() * 80 + 10, // 10-90%
        cores: 8,
        loadAverage: [
          Math.random() * 2,
          Math.random() * 2,
          Math.random() * 2
        ]
      },
      memory: {
        used: Math.random() * 8 * 1024 * 1024 * 1024, // 0-8GB
        free: Math.random() * 8 * 1024 * 1024 * 1024, // 0-8GB
        total: 16 * 1024 * 1024 * 1024, // 16GB
        usage: Math.random() * 80 + 10 // 10-90%
      },
      disk: {
        used: Math.random() * 500 * 1024 * 1024 * 1024, // 0-500GB
        free: Math.random() * 500 * 1024 * 1024 * 1024, // 0-500GB
        total: 1024 * 1024 * 1024 * 1024, // 1TB
        usage: Math.random() * 60 + 10 // 10-70%
      },
      network: {
        bytesIn: Math.random() * 1024 * 1024 * 100, // 0-100MB
        bytesOut: Math.random() * 1024 * 1024 * 100, // 0-100MB
        packetsIn: Math.random() * 10000,
        packetsOut: Math.random() * 10000
      },
      processes: {
        active: Math.floor(Math.random() * 20) + 5,
        total: Math.floor(Math.random() * 200) + 100,
        ffmpeg: Math.floor(Math.random() * 5)
      }
    }
  }

  private async getProcessingMetrics(): Promise<ProcessingMetrics> {
    // Mock processing metrics - in production, get from actual pipeline
    const now = Date.now()
    const hourAgo = now - (60 * 60 * 1000)
    
    return {
      queueLength: Math.floor(Math.random() * 20),
      activeJobs: Math.floor(Math.random() * 10),
      completedJobs: Math.floor(Math.random() * 100) + 50,
      failedJobs: Math.floor(Math.random() * 10),
      averageProcessingTime: Math.random() * 300 + 60, // 60-360 seconds
      throughput: Math.random() * 50 + 10, // 10-60 jobs/hour
      errorRate: Math.random() * 5 // 0-5%
    }
  }

  private async getCacheMetrics(): Promise<CacheMetrics> {
    // Mock cache metrics - in production, get from Redis or your cache system
    const hits = Math.floor(Math.random() * 1000) + 100
    const misses = Math.floor(Math.random() * 200) + 10
    
    return {
      hits,
      misses,
      hitRate: (hits / (hits + misses)) * 100,
      size: Math.random() * 1024 * 1024 * 100, // 0-100MB
      maxSize: 1024 * 1024 * 500, // 500MB
      evictions: Math.floor(Math.random() * 50)
    }
  }

  private checkThresholds(
    system: PerformanceMetrics,
    processing: ProcessingMetrics,
    cache: CacheMetrics
  ) {
    const checks = [
      { metric: 'cpu.usage', value: system.cpu.usage },
      { metric: 'memory.usage', value: system.memory.usage },
      { metric: 'disk.usage', value: system.disk.usage },
      { metric: 'queueLength', value: processing.queueLength },
      { metric: 'errorRate', value: processing.errorRate },
      { metric: 'cache.hitRate', value: cache.hitRate }
    ]

    for (const check of checks) {
      for (const threshold of this.alertThresholds) {
        if (!threshold.enabled || threshold.metric !== check.metric) continue

        const shouldAlert = this.evaluateThreshold(check.value, threshold)
        
        if (shouldAlert) {
          const existingAlert = this.alerts.find(alert => 
            alert.metric === threshold.metric && 
            !alert.resolved
          )

          if (!existingAlert) {
            const alert: PerformanceAlert = {
              id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date(),
              severity: threshold.severity,
              metric: threshold.metric,
              value: check.value,
              threshold: threshold.value,
              message: threshold.message.replace('{value}', check.value.toFixed(2)),
              resolved: false
            }

            this.alerts.push(alert)
            this.emit('alert_triggered', alert)
          }
        } else {
          // Resolve existing alerts if metric is back to normal
          const existingAlert = this.alerts.find(alert => 
            alert.metric === threshold.metric && 
            !alert.resolved
          )

          if (existingAlert) {
            existingAlert.resolved = true
            existingAlert.resolvedAt = new Date()
            this.emit('alert_resolved', existingAlert)
          }
        }
      }
    }
  }

  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'gt': return value > threshold.value
      case 'lt': return value < threshold.value
      case 'eq': return Math.abs(value - threshold.value) < 0.01
      default: return false
    }
  }

  private setupDefaultThresholds() {
    this.alertThresholds = [
      {
        metric: 'cpu.usage',
        operator: 'gt',
        value: 80,
        severity: 'warning',
        message: 'High CPU usage detected: {value}%',
        enabled: true
      },
      {
        metric: 'cpu.usage',
        operator: 'gt',
        value: 95,
        severity: 'critical',
        message: 'Critical CPU usage: {value}%',
        enabled: true
      },
      {
        metric: 'memory.usage',
        operator: 'gt',
        value: 85,
        severity: 'warning',
        message: 'High memory usage: {value}%',
        enabled: true
      },
      {
        metric: 'memory.usage',
        operator: 'gt',
        value: 95,
        severity: 'critical',
        message: 'Critical memory usage: {value}%',
        enabled: true
      },
      {
        metric: 'disk.usage',
        operator: 'gt',
        value: 90,
        severity: 'warning',
        message: 'Disk space running low: {value}%',
        enabled: true
      },
      {
        metric: 'queueLength',
        operator: 'gt',
        value: 50,
        severity: 'warning',
        message: 'Processing queue is getting long: {value} jobs',
        enabled: true
      },
      {
        metric: 'errorRate',
        operator: 'gt',
        value: 10,
        severity: 'error',
        message: 'High error rate detected: {value}%',
        enabled: true
      },
      {
        metric: 'cache.hitRate',
        operator: 'lt',
        value: 70,
        severity: 'info',
        message: 'Cache hit rate is low: {value}%',
        enabled: true
      }
    ]
  }

  // Public API methods
  getCurrentMetrics(): {
    system: PerformanceMetrics | null
    processing: ProcessingMetrics | null
    cache: CacheMetrics | null
  } {
    return {
      system: this.metrics[this.metrics.length - 1] || null,
      processing: this.processingMetrics[this.processingMetrics.length - 1] || null,
      cache: this.cacheMetrics[this.cacheMetrics.length - 1] || null
    }
  }

  getHistoricalMetrics(hours: number = 24): {
    system: PerformanceMetrics[]
    processing: ProcessingMetrics[]
    cache: CacheMetrics[]
  } {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    return {
      system: this.metrics.filter(m => m.timestamp >= cutoff),
      processing: this.processingMetrics.filter(m => m.timestamp >= cutoff),
      cache: this.cacheMetrics.filter(m => m.timestamp >= cutoff)
    }
  }

  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved)
  }

  getAllAlerts(limit: number = 100): PerformanceAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (alert && !alert.resolved) {
      alert.resolved = true
      alert.resolvedAt = new Date()
      this.emit('alert_resolved', alert)
      return true
    }
    return false
  }

  addThreshold(threshold: AlertThreshold) {
    this.alertThresholds.push(threshold)
    this.emit('threshold_added', threshold)
  }

  updateThreshold(metric: string, updates: Partial<AlertThreshold>) {
    const threshold = this.alertThresholds.find(t => t.metric === metric)
    if (threshold) {
      Object.assign(threshold, updates)
      this.emit('threshold_updated', threshold)
    }
  }

  removeThreshold(metric: string) {
    const index = this.alertThresholds.findIndex(t => t.metric === metric)
    if (index > -1) {
      const removed = this.alertThresholds.splice(index, 1)[0]
      this.emit('threshold_removed', removed)
    }
  }

  getThresholds(): AlertThreshold[] {
    return [...this.alertThresholds]
  }

  getHealthScore(): number {
    const current = this.getCurrentMetrics()
    if (!current.system || !current.processing) return 0

    // Calculate weighted health score
    const cpuScore = Math.max(0, 100 - current.system.cpu.usage)
    const memoryScore = Math.max(0, 100 - current.system.memory.usage)
    const diskScore = Math.max(0, 100 - current.system.disk.usage)
    const queueScore = Math.max(0, 100 - Math.min(current.processing.queueLength * 2, 100))
    const errorScore = Math.max(0, 100 - current.processing.errorRate * 10)

    const weights = {
      cpu: 0.2,
      memory: 0.2,
      disk: 0.15,
      queue: 0.25,
      error: 0.2
    }

    return Math.round(
      cpuScore * weights.cpu +
      memoryScore * weights.memory +
      diskScore * weights.disk +
      queueScore * weights.queue +
      errorScore * weights.error
    )
  }

  generateReport(hours: number = 24): {
    summary: {
      healthScore: number
      uptime: number
      totalAlerts: number
      criticalAlerts: number
    }
    metrics: {
      avgCpuUsage: number
      avgMemoryUsage: number
      avgQueueLength: number
      totalJobsProcessed: number
      errorRate: number
    }
    recommendations: string[]
  } {
    const historical = this.getHistoricalMetrics(hours)
    const alerts = this.alerts.filter(a => 
      a.timestamp >= new Date(Date.now() - hours * 60 * 60 * 1000)
    )

    const avgCpuUsage = historical.system.length > 0 
      ? historical.system.reduce((sum, m) => sum + m.cpu.usage, 0) / historical.system.length
      : 0

    const avgMemoryUsage = historical.system.length > 0
      ? historical.system.reduce((sum, m) => sum + m.memory.usage, 0) / historical.system.length
      : 0

    const avgQueueLength = historical.processing.length > 0
      ? historical.processing.reduce((sum, m) => sum + m.queueLength, 0) / historical.processing.length
      : 0

    const totalJobsProcessed = historical.processing.length > 0
      ? historical.processing[historical.processing.length - 1].completedJobs
      : 0

    const avgErrorRate = historical.processing.length > 0
      ? historical.processing.reduce((sum, m) => sum + m.errorRate, 0) / historical.processing.length
      : 0

    const recommendations = []
    if (avgCpuUsage > 70) recommendations.push('Consider adding more CPU cores or optimizing processing algorithms')
    if (avgMemoryUsage > 80) recommendations.push('Memory usage is high, consider increasing available RAM')
    if (avgQueueLength > 20) recommendations.push('Processing queue is consistently long, consider scaling horizontally')
    if (avgErrorRate > 5) recommendations.push('Error rate is above normal, investigate common failure causes')

    return {
      summary: {
        healthScore: this.getHealthScore(),
        uptime: process.uptime(),
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length
      },
      metrics: {
        avgCpuUsage: Math.round(avgCpuUsage),
        avgMemoryUsage: Math.round(avgMemoryUsage),
        avgQueueLength: Math.round(avgQueueLength),
        totalJobsProcessed,
        errorRate: Math.round(avgErrorRate * 100) / 100
      },
      recommendations
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor()