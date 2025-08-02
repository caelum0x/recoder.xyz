interface HealthCheckConfig {
  services: Array<{
    name: string;
    type: 'http' | 'tcp' | 'database' | 'queue' | 'cache' | 'custom';
    endpoint?: string;
    port?: number;
    host?: string;
    timeout: number; // milliseconds
    interval: number; // seconds
    retries: number;
    healthyThreshold: number;
    unhealthyThreshold: number;
    headers?: Record<string, string>;
    expectedStatus?: number[];
    expectedResponse?: string | RegExp;
    customCheck?: () => Promise<HealthResult>;
  }>;
  alerting: {
    enabled: boolean;
    channels: Array<{
      type: 'email' | 'slack' | 'webhook' | 'sms';
      config: Record<string, any>;
      events: ('unhealthy' | 'recovered' | 'degraded' | 'critical')[];
    }>;
    thresholds: {
      warning: number; // percentage of services unhealthy
      critical: number;
    };
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // seconds
    historyRetention: number; // days
    dashboard: {
      enabled: boolean;
      port: number;
      refreshInterval: number;
    };
  };
  dependencies: Array<{
    service: string;
    dependsOn: string[];
    criticality: 'high' | 'medium' | 'low';
  }>;
}

interface HealthResult {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  responseTime: number; // milliseconds
  timestamp: Date;
  message?: string;
  details?: Record<string, any>;
  metadata?: {
    version?: string;
    region?: string;
    instance?: string;
  };
}

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  lastCheck: Date;
  uptime: number; // percentage
  availability: number; // percentage over last 24h
  responseTime: {
    current: number;
    average: number;
    p95: number;
    p99: number;
  };
  checks: {
    total: number;
    passed: number;
    failed: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
  };
  history: HealthResult[];
  dependencies: {
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    impact: 'high' | 'medium' | 'low' | 'none';
  }[];
  incidents: Array<{
    id: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    resolution?: string;
  }>;
}

interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded' | 'maintenance';
  score: number; // 0-100
  services: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
    unknown: number;
  };
  metrics: {
    uptime: number;
    availability: number;
    averageResponseTime: number;
    incidentCount: number;
    mttr: number; // Mean Time To Recovery
    mtbf: number; // Mean Time Between Failures
  };
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    service: string;
    message: string;
    timestamp: Date;
    acknowledged: boolean;
    resolved: boolean;
  }>;
}

interface CircuitBreaker {
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failureThreshold: number;
  recoveryTimeout: number; // seconds
  currentFailures: number;
  lastFailure: Date;
  nextRetry: Date;
  successThreshold: number; // for half-open state
  currentSuccesses: number;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    timeouts: number;
    circuitOpenCount: number;
  };
}

interface HealthMetrics {
  timestamp: Date;
  services: Array<{
    name: string;
    status: string;
    responseTime: number;
    availability: number;
    errorRate: number;
  }>;
  system: {
    cpu: number;
    memory: number;
    disk: number;
    network: {
      latency: number;
      throughput: number;
      errorRate: number;
    };
  };
  alerts: {
    active: number;
    resolved: number;
    acknowledged: number;
  };
  incidents: {
    open: number;
    closed: number;
    averageResolutionTime: number;
  };
}

export class HealthMonitoring {
  private config: HealthCheckConfig;
  private services: Map<string, ServiceHealth> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private metrics: HealthMetrics[] = [];
  private alerts: Map<string, any> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isMonitoring: boolean = false;

  constructor(config: HealthCheckConfig) {
    this.config = config;
    this.initializeServices();
    this.initializeCircuitBreakers();
    this.startMonitoring();
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const services = Array.from(this.services.values());
    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;
    const unknownCount = services.filter(s => s.status === 'unknown').length;

    // Calculate overall system health score
    const totalServices = services.length;
    const score = totalServices > 0 ? 
      (healthyCount * 100 + degradedCount * 50) / totalServices : 100;

    // Determine overall status
    let overall: SystemHealth['overall'] = 'healthy';
    if (score < 50) overall = 'unhealthy';
    else if (score < 80) overall = 'degraded';

    // Calculate system metrics
    const averageUptime = services.length > 0 ?
      services.reduce((sum, s) => sum + s.uptime, 0) / services.length : 100;
    
    const averageAvailability = services.length > 0 ?
      services.reduce((sum, s) => sum + s.availability, 0) / services.length : 100;
    
    const averageResponseTime = services.length > 0 ?
      services.reduce((sum, s) => sum + s.responseTime.average, 0) / services.length : 0;

    const incidentCount = services.reduce((sum, s) => 
      sum + s.incidents.filter(i => !i.endTime).length, 0);

    return {
      overall,
      score,
      services,
      summary: {
        total: totalServices,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        degraded: degradedCount,
        unknown: unknownCount
      },
      metrics: {
        uptime: averageUptime,
        availability: averageAvailability,
        averageResponseTime,
        incidentCount,
        mttr: await this.calculateMTTR(),
        mtbf: await this.calculateMTBF()
      },
      alerts: Array.from(this.alerts.values())
    };
  }

  async checkService(serviceName: string): Promise<HealthResult> {
    const serviceConfig = this.config.services.find(s => s.name === serviceName);
    if (!serviceConfig) {
      throw new Error(`Service ${serviceName} not found`);
    }

    const startTime = Date.now();
    let result: HealthResult;

    try {
      result = await this.performHealthCheck(serviceConfig);
      result.responseTime = Date.now() - startTime;
      result.timestamp = new Date();

      // Update service health
      await this.updateServiceHealth(serviceName, result);
      
      // Update circuit breaker
      await this.updateCircuitBreaker(serviceName, result);

    } catch (error) {
      result = {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { error: error instanceof Error ? error.stack : String(error) }
      };

      await this.updateServiceHealth(serviceName, result);
      await this.updateCircuitBreaker(serviceName, result);
    }

    return result;
  }

  async checkAllServices(): Promise<Map<string, HealthResult>> {
    const results = new Map<string, HealthResult>();
    
    const promises = this.config.services.map(async (service) => {
      const result = await this.checkService(service.name);
      results.set(service.name, result);
    });

    await Promise.all(promises);
    
    // Check for system-wide issues
    await this.evaluateSystemHealth(results);
    
    return results;
  }

  async addService(service: HealthCheckConfig['services'][0]): Promise<void> {
    // Add to config
    this.config.services.push(service);
    
    // Initialize service health
    const serviceHealth: ServiceHealth = {
      name: service.name,
      status: 'unknown',
      lastCheck: new Date(),
      uptime: 100,
      availability: 100,
      responseTime: {
        current: 0,
        average: 0,
        p95: 0,
        p99: 0
      },
      checks: {
        total: 0,
        passed: 0,
        failed: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0
      },
      history: [],
      dependencies: [],
      incidents: []
    };

    this.services.set(service.name, serviceHealth);
    
    // Initialize circuit breaker
    this.circuitBreakers.set(service.name, {
      service: service.name,
      state: 'closed',
      failureThreshold: service.unhealthyThreshold,
      recoveryTimeout: 30,
      currentFailures: 0,
      lastFailure: new Date(0),
      nextRetry: new Date(0),
      successThreshold: service.healthyThreshold,
      currentSuccesses: 0,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timeouts: 0,
        circuitOpenCount: 0
      }
    });

    // Start monitoring
    await this.startServiceMonitoring(service);
  }

  async removeService(serviceName: string): Promise<void> {
    // Stop monitoring
    const interval = this.checkIntervals.get(serviceName);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(serviceName);
    }

    // Remove from config
    this.config.services = this.config.services.filter(s => s.name !== serviceName);
    
    // Remove from runtime data
    this.services.delete(serviceName);
    this.circuitBreakers.delete(serviceName);
  }

  async pauseMonitoring(serviceName?: string): Promise<void> {
    if (serviceName) {
      const interval = this.checkIntervals.get(serviceName);
      if (interval) {
        clearInterval(interval);
        this.checkIntervals.delete(serviceName);
      }
    } else {
      // Pause all monitoring
      for (const [name, interval] of this.checkIntervals.entries()) {
        clearInterval(interval);
      }
      this.checkIntervals.clear();
      this.isMonitoring = false;
    }
  }

  async resumeMonitoring(serviceName?: string): Promise<void> {
    if (serviceName) {
      const service = this.config.services.find(s => s.name === serviceName);
      if (service) {
        await this.startServiceMonitoring(service);
      }
    } else {
      // Resume all monitoring
      await this.startMonitoring();
    }
  }

  async getServiceHistory(serviceName: string, timeRange?: { start: Date; end: Date }): Promise<{
    service: ServiceHealth;
    timeline: Array<{
      timestamp: Date;
      status: string;
      responseTime: number;
      message?: string;
    }>;
    incidents: Array<{
      id: string;
      start: Date;
      end?: Date;
      duration?: number;
      severity: string;
      description: string;
    }>;
    metrics: {
      availability: number;
      averageResponseTime: number;
      errorRate: number;
      uptime: number;
    };
  }> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    let history = service.history;
    if (timeRange) {
      history = history.filter(h => 
        h.timestamp >= timeRange.start && h.timestamp <= timeRange.end
      );
    }

    const timeline = history.map(h => ({
      timestamp: h.timestamp,
      status: h.status,
      responseTime: h.responseTime,
      message: h.message
    }));

    const incidents = service.incidents
      .filter(i => {
        if (!timeRange) return true;
        return i.startTime >= timeRange.start && 
               (i.endTime ? i.endTime <= timeRange.end : true);
      })
      .map(i => ({
        id: i.id,
        start: i.startTime,
        end: i.endTime,
        duration: i.duration,
        severity: String(i.severity),
        description: i.description
      }));

    // Calculate metrics for the time range
    const totalChecks = history.length;
    const successfulChecks = history.filter(h => h.status === 'healthy').length;
    const availability = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;
    const averageResponseTime = totalChecks > 0 ?
      history.reduce((sum, h) => sum + h.responseTime, 0) / totalChecks : 0;
    const errorRate = totalChecks > 0 ? ((totalChecks - successfulChecks) / totalChecks) * 100 : 0;

    return {
      service,
      timeline,
      incidents,
      metrics: {
        availability,
        averageResponseTime,
        errorRate,
        uptime: availability
      }
    };
  }

  async createAlert(alert: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    service: string;
    message: string;
    details?: Record<string, any>;
  }): Promise<string> {
    const alertId = this.generateAlertId();
    const alertData = {
      id: alertId,
      ...alert,
      timestamp: new Date(),
      acknowledged: false,
      resolved: false
    };

    this.alerts.set(alertId, alertData);

    // Send notifications if configured
    if (this.config.alerting.enabled) {
      await this.sendNotifications(alertData);
    }

    return alertId;
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
    }
  }

  async resolveAlert(alertId: string, resolution?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      alert.resolution = resolution;
    }
  }

  async getMetrics(timeRange?: { start: Date; end: Date }): Promise<{
    current: HealthMetrics;
    historical: HealthMetrics[];
    summary: {
      systemHealth: number;
      availability: number;
      averageResponseTime: number;
      incidentRate: number;
      alertRate: number;
    };
    trends: {
      availability: 'improving' | 'stable' | 'degrading';
      responseTime: 'improving' | 'stable' | 'degrading';
      errorRate: 'improving' | 'stable' | 'degrading';
    };
  }> {
    const current = await this.getCurrentMetrics();
    
    let historical = this.metrics;
    if (timeRange) {
      historical = this.metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const systemHealth = await this.getSystemHealth();
    const summary = {
      systemHealth: systemHealth.score,
      availability: systemHealth.metrics.availability,
      averageResponseTime: systemHealth.metrics.averageResponseTime,
      incidentRate: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.incidents.open, 0) / historical.length : 0,
      alertRate: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.alerts.active, 0) / historical.length : 0
    };

    const trends = await this.calculateTrends(historical);

    return { current, historical, summary, trends };
  }

  private async initializeServices(): Promise<void> {
    for (const service of this.config.services) {
      const serviceHealth: ServiceHealth = {
        name: service.name,
        status: 'unknown',
        lastCheck: new Date(),
        uptime: 100,
        availability: 100,
        responseTime: {
          current: 0,
          average: 0,
          p95: 0,
          p99: 0
        },
        checks: {
          total: 0,
          passed: 0,
          failed: 0,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0
        },
        history: [],
        dependencies: this.getDependencies(service.name),
        incidents: []
      };

      this.services.set(service.name, serviceHealth);
    }
  }

  private initializeCircuitBreakers(): void {
    for (const service of this.config.services) {
      this.circuitBreakers.set(service.name, {
        service: service.name,
        state: 'closed',
        failureThreshold: service.unhealthyThreshold,
        recoveryTimeout: 30,
        currentFailures: 0,
        lastFailure: new Date(0),
        nextRetry: new Date(0),
        successThreshold: service.healthyThreshold,
        currentSuccesses: 0,
        metrics: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          timeouts: 0,
          circuitOpenCount: 0
        }
      });
    }
  }

  private async startMonitoring(): Promise<void> {
    this.isMonitoring = true;
    
    for (const service of this.config.services) {
      await this.startServiceMonitoring(service);
    }

    // Start metrics collection
    if (this.config.monitoring.enabled) {
      setInterval(async () => {
        const metrics = await this.getCurrentMetrics();
        this.metrics.push(metrics);
        
        // Keep only last 1000 metrics
        if (this.metrics.length > 1000) {
          this.metrics.splice(0, this.metrics.length - 1000);
        }
      }, this.config.monitoring.metricsInterval * 1000);
    }
  }

  private async startServiceMonitoring(service: HealthCheckConfig['services'][0]): Promise<void> {
    const interval = setInterval(async () => {
      try {
        await this.checkService(service.name);
      } catch (error) {
        console.error(`Error checking service ${service.name}:`, error);
      }
    }, service.interval * 1000);

    this.checkIntervals.set(service.name, interval);

    // Perform initial check
    await this.checkService(service.name);
  }

  private async performHealthCheck(service: HealthCheckConfig['services'][0]): Promise<HealthResult> {
    switch (service.type) {
      case 'http':
        return await this.httpHealthCheck(service);
      case 'tcp':
        return await this.tcpHealthCheck(service);
      case 'database':
        return await this.databaseHealthCheck(service);
      case 'queue':
        return await this.queueHealthCheck(service);
      case 'cache':
        return await this.cacheHealthCheck(service);
      case 'custom':
        if (service.customCheck) {
          return await service.customCheck();
        }
        throw new Error('Custom check function not provided');
      default:
        throw new Error(`Unknown service type: ${service.type}`);
    }
  }

  private async httpHealthCheck(service: HealthCheckConfig['services'][0]): Promise<HealthResult> {
    // Mock HTTP health check
    const isHealthy = Math.random() > 0.1; // 90% success rate
    const responseTime = 50 + Math.random() * 200; // 50-250ms
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime,
      timestamp: new Date(),
      message: isHealthy ? 'Service is responding' : 'Service is not responding',
      details: {
        endpoint: service.endpoint,
        statusCode: isHealthy ? 200 : 500
      }
    };
  }

  private async tcpHealthCheck(service: HealthCheckConfig['services'][0]): Promise<HealthResult> {
    // Mock TCP health check
    const isHealthy = Math.random() > 0.05; // 95% success rate
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: 10 + Math.random() * 50,
      timestamp: new Date(),
      message: isHealthy ? 'TCP connection successful' : 'TCP connection failed',
      details: {
        host: service.host,
        port: service.port
      }
    };
  }

  private async databaseHealthCheck(service: HealthCheckConfig['services'][0]): Promise<HealthResult> {
    // Mock database health check
    const isHealthy = Math.random() > 0.03; // 97% success rate
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: 20 + Math.random() * 100,
      timestamp: new Date(),
      message: isHealthy ? 'Database connection successful' : 'Database connection failed',
      details: {
        connectionCount: Math.floor(Math.random() * 100),
        activeQueries: Math.floor(Math.random() * 20)
      }
    };
  }

  private async queueHealthCheck(service: HealthCheckConfig['services'][0]): Promise<HealthResult> {
    // Mock queue health check
    const isHealthy = Math.random() > 0.02; // 98% success rate
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: 5 + Math.random() * 30,
      timestamp: new Date(),
      message: isHealthy ? 'Queue is operational' : 'Queue is not responding',
      details: {
        queueSize: Math.floor(Math.random() * 1000),
        processingRate: Math.floor(Math.random() * 100)
      }
    };
  }

  private async cacheHealthCheck(service: HealthCheckConfig['services'][0]): Promise<HealthResult> {
    // Mock cache health check
    const isHealthy = Math.random() > 0.01; // 99% success rate
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: 1 + Math.random() * 10,
      timestamp: new Date(),
      message: isHealthy ? 'Cache is operational' : 'Cache is not responding',
      details: {
        hitRate: 80 + Math.random() * 20,
        memoryUsage: Math.floor(Math.random() * 100)
      }
    };
  }

  private async updateServiceHealth(serviceName: string, result: HealthResult): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    // Update basic fields
    service.lastCheck = result.timestamp;
    service.status = result.status;
    service.responseTime.current = result.responseTime;

    // Update check counts
    service.checks.total++;
    if (result.status === 'healthy') {
      service.checks.passed++;
      service.checks.consecutiveSuccesses++;
      service.checks.consecutiveFailures = 0;
    } else {
      service.checks.failed++;
      service.checks.consecutiveFailures++;
      service.checks.consecutiveSuccesses = 0;
    }

    // Update response time statistics
    service.history.push(result);
    if (service.history.length > 1000) {
      service.history.splice(0, service.history.length - 1000);
    }

    const responseTimes = service.history.map(h => h.responseTime);
    service.responseTime.average = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;
    service.responseTime.p95 = this.calculatePercentile(responseTimes, 95);
    service.responseTime.p99 = this.calculatePercentile(responseTimes, 99);

    // Update availability
    const recentHistory = service.history.slice(-100); // Last 100 checks
    const successfulChecks = recentHistory.filter(h => h.status === 'healthy').length;
    service.availability = recentHistory.length > 0 ? (successfulChecks / recentHistory.length) * 100 : 100;

    // Update uptime
    service.uptime = service.checks.total > 0 ? (service.checks.passed / service.checks.total) * 100 : 100;

    // Check for incidents
    await this.checkForIncidents(serviceName, result);

    // Generate alerts if needed
    await this.checkAlertConditions(serviceName, service);
  }

  private async updateCircuitBreaker(serviceName: string, result: HealthResult): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    if (!circuitBreaker) return;

    circuitBreaker.metrics.totalRequests++;

    if (result.status === 'healthy') {
      circuitBreaker.metrics.successfulRequests++;
      
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.currentSuccesses++;
        if (circuitBreaker.currentSuccesses >= circuitBreaker.successThreshold) {
          circuitBreaker.state = 'closed';
          circuitBreaker.currentFailures = 0;
        }
      } else if (circuitBreaker.state === 'closed') {
        circuitBreaker.currentFailures = 0;
      }
    } else {
      circuitBreaker.metrics.failedRequests++;
      circuitBreaker.currentFailures++;
      circuitBreaker.lastFailure = new Date();

      if (circuitBreaker.state === 'closed' && 
          circuitBreaker.currentFailures >= circuitBreaker.failureThreshold) {
        circuitBreaker.state = 'open';
        circuitBreaker.metrics.circuitOpenCount++;
        circuitBreaker.nextRetry = new Date(Date.now() + circuitBreaker.recoveryTimeout * 1000);
      } else if (circuitBreaker.state === 'half-open') {
        circuitBreaker.state = 'open';
        circuitBreaker.nextRetry = new Date(Date.now() + circuitBreaker.recoveryTimeout * 1000);
      }
    }

    // Transition from open to half-open
    if (circuitBreaker.state === 'open' && new Date() >= circuitBreaker.nextRetry) {
      circuitBreaker.state = 'half-open';
      circuitBreaker.currentSuccesses = 0;
    }
  }

  private async checkForIncidents(serviceName: string, result: HealthResult): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    // Check if we need to start a new incident
    if (result.status === 'unhealthy' && service.checks.consecutiveFailures === 1) {
      const incident = {
        id: this.generateIncidentId(),
        startTime: new Date(),
        severity: (service.checks.consecutiveFailures > 5 ? 'critical' : 'medium') as 'low' | 'medium' | 'high' | 'critical',
        description: `Service ${serviceName} is unhealthy: ${result.message}`
      };
      
      service.incidents.push(incident);
      
      await this.createAlert({
        severity: 'error',
        service: serviceName,
        message: `New incident: ${incident.description}`,
        details: { incidentId: incident.id }
      });
    }

    // Check if we need to close an incident
    if (result.status === 'healthy' && service.checks.consecutiveSuccesses >= 3) {
      const openIncident = service.incidents.find(i => !i.endTime);
      if (openIncident) {
        openIncident.endTime = new Date();
        openIncident.duration = openIncident.endTime.getTime() - openIncident.startTime.getTime();
        openIncident.resolution = 'Service recovered automatically';
        
        await this.createAlert({
          severity: 'info',
          service: serviceName,
          message: `Incident resolved: Service ${serviceName} has recovered`,
          details: { incidentId: openIncident.id }
        });
      }
    }
  }

  private async checkAlertConditions(serviceName: string, service: ServiceHealth): Promise<void> {
    // Alert on consecutive failures
    if (service.checks.consecutiveFailures >= 3) {
      await this.createAlert({
        severity: 'warning',
        service: serviceName,
        message: `Service ${serviceName} has ${service.checks.consecutiveFailures} consecutive failures`
      });
    }

    // Alert on low availability
    if (service.availability < 95) {
      await this.createAlert({
        severity: 'error',
        service: serviceName,
        message: `Service ${serviceName} availability is ${service.availability.toFixed(2)}%`
      });
    }

    // Alert on high response time
    if (service.responseTime.average > 5000) {
      await this.createAlert({
        severity: 'warning',
        service: serviceName,
        message: `Service ${serviceName} average response time is ${service.responseTime.average.toFixed(0)}ms`
      });
    }
  }

  private async evaluateSystemHealth(results: Map<string, HealthResult>): Promise<void> {
    const unhealthyServices = Array.from(results.values()).filter(r => r.status === 'unhealthy');
    const totalServices = results.size;
    const unhealthyPercentage = totalServices > 0 ? (unhealthyServices.length / totalServices) * 100 : 0;

    if (unhealthyPercentage >= this.config.alerting.thresholds.critical) {
      await this.createAlert({
        severity: 'critical',
        service: 'system',
        message: `System health critical: ${unhealthyPercentage.toFixed(1)}% of services are unhealthy`
      });
    } else if (unhealthyPercentage >= this.config.alerting.thresholds.warning) {
      await this.createAlert({
        severity: 'warning',
        service: 'system',
        message: `System health warning: ${unhealthyPercentage.toFixed(1)}% of services are unhealthy`
      });
    }
  }

  private getDependencies(serviceName: string): ServiceHealth['dependencies'] {
    const deps = this.config.dependencies.find(d => d.service === serviceName);
    if (!deps) return [];

    return deps.dependsOn.map(depName => ({
      name: depName,
      status: 'degraded',
      impact: deps.criticality
    }));
  }

  private async calculateMTTR(): Promise<number> {
    // Mock MTTR calculation
    return 25; // 25 minutes
  }

  private async calculateMTBF(): Promise<number> {
    // Mock MTBF calculation
    return 720; // 12 hours
  }

  private async getCurrentMetrics(): Promise<HealthMetrics> {
    const services = Array.from(this.services.values());
    const activeAlerts = Array.from(this.alerts.values()).filter(a => !a.resolved);
    const openIncidents = services.reduce((sum, s) => 
      sum + s.incidents.filter(i => !i.endTime).length, 0);

    return {
      timestamp: new Date(),
      services: services.map(s => ({
        name: s.name,
        status: s.status,
        responseTime: s.responseTime.current,
        availability: s.availability,
        errorRate: s.checks.total > 0 ? (s.checks.failed / s.checks.total) * 100 : 0
      })),
      system: {
        cpu: 45 + Math.random() * 30,
        memory: 60 + Math.random() * 25,
        disk: 30 + Math.random() * 40,
        network: {
          latency: 10 + Math.random() * 20,
          throughput: 80 + Math.random() * 20,
          errorRate: Math.random() * 5
        }
      },
      alerts: {
        active: activeAlerts.length,
        resolved: Array.from(this.alerts.values()).filter(a => a.resolved).length,
        acknowledged: Array.from(this.alerts.values()).filter(a => a.acknowledged).length
      },
      incidents: {
        open: openIncidents,
        closed: services.reduce((sum, s) => 
          sum + s.incidents.filter(i => i.endTime).length, 0),
        averageResolutionTime: 25 // minutes
      }
    };
  }

  private async calculateTrends(historical: HealthMetrics[]): Promise<{
    availability: 'improving' | 'stable' | 'degrading';
    responseTime: 'improving' | 'stable' | 'degrading';
    errorRate: 'improving' | 'stable' | 'degrading';
  }> {
    // Mock trend calculation
    return {
      availability: 'stable',
      responseTime: 'improving',
      errorRate: 'stable'
    };
  }

  private async sendNotifications(alert: any): Promise<void> {
    // Mock notification sending
    console.log(`Sending alert notification: ${alert.message}`);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateIncidentId(): string {
    return `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export {
  type HealthCheckConfig,
  type HealthResult,
  type ServiceHealth,
  type SystemHealth,
  type CircuitBreaker,
  type HealthMetrics
};