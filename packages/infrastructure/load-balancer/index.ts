interface LoadBalancerConfig {
  id: string;
  name: string;
  algorithm: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted-round-robin' | 'least-response-time' | 'random';
  healthCheck: {
    enabled: boolean;
    interval: number; // seconds
    timeout: number; // seconds
    healthyThreshold: number;
    unhealthyThreshold: number;
    path: string;
    expectedStatus: number[];
    expectedResponse?: string;
  };
  stickySessions: {
    enabled: boolean;
    method: 'cookie' | 'ip' | 'header';
    name?: string;
    duration?: number; // seconds
  };
  ssl: {
    enabled: boolean;
    certificate?: string;
    privateKey?: string;
    redirect: boolean; // redirect HTTP to HTTPS
  };
  rateLimit: {
    enabled: boolean;
    requestsPerSecond: number;
    burstSize: number;
    windowSize: number; // seconds
  };
  compression: {
    enabled: boolean;
    types: string[];
    minSize: number; // bytes
  };
  monitoring: {
    metrics: boolean;
    logging: boolean;
    alerting: boolean;
  };
}

interface UpstreamServer {
  id: string;
  host: string;
  port: number;
  weight: number; // for weighted algorithms
  maxConnections?: number;
  status: 'healthy' | 'unhealthy' | 'draining' | 'maintenance';
  lastChecked: Date;
  responseTime: number; // ms
  activeConnections: number;
  totalRequests: number;
  failedRequests: number;
  metadata: {
    datacenter?: string;
    zone?: string;
    version?: string;
    capacity?: number;
  };
}

interface LoadBalancerMetrics {
  timestamp: Date;
  requestsPerSecond: number;
  totalRequests: number;
  totalErrors: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  activeConnections: number;
  upstream: {
    serverId: string;
    requests: number;
    errors: number;
    responseTime: number;
    connections: number;
  }[];
  errorRates: {
    '4xx': number;
    '5xx': number;
    timeouts: number;
    connectionErrors: number;
  };
}

interface TrafficRule {
  id: string;
  name: string;
  priority: number;
  condition: {
    type: 'path' | 'header' | 'query' | 'ip' | 'geo' | 'time' | 'user-agent';
    field?: string;
    operator: 'equals' | 'contains' | 'regex' | 'in' | 'range';
    value: string | string[] | number[];
  };
  action: {
    type: 'route' | 'redirect' | 'block' | 'rewrite' | 'rate-limit';
    target?: string[];
    status?: number;
    headers?: Record<string, string>;
    limit?: number;
  };
  enabled: boolean;
}

interface CircuitBreaker {
  serverId: string;
  state: 'closed' | 'open' | 'half-open';
  failureThreshold: number;
  recoveryTimeout: number; // seconds
  currentFailures: number;
  lastFailure: Date;
  nextRetry: Date;
  successThreshold: number; // for half-open state
  currentSuccesses: number;
}

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private upstreams: Map<string, UpstreamServer> = new Map();
  private metrics: LoadBalancerMetrics[] = [];
  private rules: Map<string, TrafficRule> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private connections: Map<string, number> = new Map();
  private rateLimiters: Map<string, any> = new Map();

  constructor(config: LoadBalancerConfig) {
    this.config = config;
    this.initializeHealthChecks();
    this.initializeMetricsCollection();
  }

  async addUpstream(server: Omit<UpstreamServer, 'id' | 'status' | 'lastChecked' | 'activeConnections' | 'totalRequests' | 'failedRequests'>): Promise<UpstreamServer> {
    const upstream: UpstreamServer = {
      ...server,
      id: this.generateUpstreamId(),
      status: 'healthy',
      lastChecked: new Date(),
      activeConnections: 0,
      totalRequests: 0,
      failedRequests: 0
    };

    this.upstreams.set(upstream.id, upstream);
    
    // Initialize circuit breaker
    this.circuitBreakers.set(upstream.id, {
      serverId: upstream.id,
      state: 'closed',
      failureThreshold: 5,
      recoveryTimeout: 30,
      currentFailures: 0,
      lastFailure: new Date(0),
      nextRetry: new Date(0),
      successThreshold: 3,
      currentSuccesses: 0
    });

    return upstream;
  }

  async removeUpstream(serverId: string): Promise<void> {
    const upstream = this.upstreams.get(serverId);
    if (!upstream) {
      throw new Error(`Upstream server ${serverId} not found`);
    }

    // Gracefully drain connections
    upstream.status = 'draining';
    
    // Wait for existing connections to complete
    await this.waitForDraining(serverId);
    
    this.upstreams.delete(serverId);
    this.circuitBreakers.delete(serverId);
  }

  async routeRequest(request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    clientIp: string;
    body?: any;
  }): Promise<{
    upstream: UpstreamServer;
    sessionId?: string;
    cacheKey?: string;
    proxyHeaders: Record<string, string>;
  }> {
    // Apply traffic rules
    const ruleResult = await this.applyTrafficRules(request);
    if (ruleResult.action.type === 'block') {
      throw new Error('Request blocked by traffic rule');
    }
    if (ruleResult.action.type === 'redirect') {
      throw new Error(`Redirect to ${ruleResult.action.target}`);
    }

    // Check rate limits
    if (this.config.rateLimit.enabled) {
      await this.checkRateLimit(request.clientIp);
    }

    // Select upstream server
    const upstream = await this.selectUpstream(request);
    if (!upstream) {
      throw new Error('No healthy upstream servers available');
    }

    // Handle sticky sessions
    let sessionId: string | undefined;
    if (this.config.stickySessions.enabled) {
      sessionId = await this.handleStickySession(request, upstream);
    }

    // Generate proxy headers
    const proxyHeaders = this.generateProxyHeaders(request, upstream);

    // Update metrics
    this.updateRequestMetrics(upstream.id);

    return {
      upstream,
      sessionId,
      proxyHeaders
    };
  }

  async selectUpstream(request: any): Promise<UpstreamServer | null> {
    const healthyUpstreams = Array.from(this.upstreams.values())
      .filter(server => this.isServerAvailable(server));

    if (healthyUpstreams.length === 0) {
      return null;
    }

    switch (this.config.algorithm) {
      case 'round-robin':
        return this.roundRobinSelection(healthyUpstreams);
      case 'least-connections':
        return this.leastConnectionsSelection(healthyUpstreams);
      case 'weighted-round-robin':
        return this.weightedRoundRobinSelection(healthyUpstreams);
      case 'least-response-time':
        return this.leastResponseTimeSelection(healthyUpstreams);
      case 'ip-hash':
        return this.ipHashSelection(healthyUpstreams, request.clientIp);
      case 'random':
        return this.randomSelection(healthyUpstreams);
      default:
        return this.roundRobinSelection(healthyUpstreams);
    }
  }

  async healthCheck(): Promise<void> {
    const promises = Array.from(this.upstreams.values()).map(async (server) => {
      try {
        const startTime = Date.now();
        const response = await this.performHealthCheck(server);
        const responseTime = Date.now() - startTime;

        server.responseTime = responseTime;
        server.lastChecked = new Date();

        if (response.healthy) {
          await this.markServerHealthy(server);
        } else {
          await this.markServerUnhealthy(server);
        }
      } catch (error) {
        await this.markServerUnhealthy(server);
      }
    });

    await Promise.all(promises);
  }

  async getMetrics(timeRange?: { start: Date; end: Date }): Promise<{
    current: LoadBalancerMetrics;
    historical: LoadBalancerMetrics[];
    summary: {
      totalRequests: number;
      errorRate: number;
      averageResponseTime: number;
      uptime: number;
      healthyServers: number;
      totalServers: number;
    };
  }> {
    const current = this.getCurrentMetrics();
    
    let historical = this.metrics;
    if (timeRange) {
      historical = this.metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const summary = {
      totalRequests: historical.reduce((sum, m) => sum + m.totalRequests, 0),
      errorRate: historical.length > 0 ? 
        historical.reduce((sum, m) => sum + m.totalErrors, 0) / 
        historical.reduce((sum, m) => sum + m.totalRequests, 0) * 100 : 0,
      averageResponseTime: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.averageResponseTime, 0) / historical.length : 0,
      uptime: this.calculateUptime(),
      healthyServers: Array.from(this.upstreams.values()).filter(s => s.status === 'healthy').length,
      totalServers: this.upstreams.size
    };

    return { current, historical, summary };
  }

  async updateConfiguration(updates: Partial<LoadBalancerConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    
    // Reinitialize components if needed
    if (updates.healthCheck) {
      this.initializeHealthChecks();
    }
  }

  async addTrafficRule(rule: Omit<TrafficRule, 'id'>): Promise<TrafficRule> {
    const newRule: TrafficRule = {
      ...rule,
      id: this.generateRuleId()
    };
    
    this.rules.set(newRule.id, newRule);
    return newRule;
  }

  async enableMaintenance(serverId: string): Promise<void> {
    const server = this.upstreams.get(serverId);
    if (server) {
      server.status = 'maintenance';
      // Gracefully drain existing connections
      await this.waitForDraining(serverId);
    }
  }

  async disableMaintenance(serverId: string): Promise<void> {
    const server = this.upstreams.get(serverId);
    if (server) {
      server.status = 'healthy';
      // Reset circuit breaker
      const circuitBreaker = this.circuitBreakers.get(serverId);
      if (circuitBreaker) {
        circuitBreaker.state = 'closed';
        circuitBreaker.currentFailures = 0;
      }
    }
  }

  private isServerAvailable(server: UpstreamServer): boolean {
    if (server.status !== 'healthy') {
      return false;
    }

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(server.id);
    if (circuitBreaker && circuitBreaker.state === 'open') {
      // Check if we should try half-open
      if (new Date() >= circuitBreaker.nextRetry) {
        circuitBreaker.state = 'half-open';
        circuitBreaker.currentSuccesses = 0;
        return true;
      }
      return false;
    }

    // Check connection limits
    if (server.maxConnections && server.activeConnections >= server.maxConnections) {
      return false;
    }

    return true;
  }

  private roundRobinSelection(servers: UpstreamServer[]): UpstreamServer {
    // Simple round-robin implementation
    const sortedServers = servers.sort((a, b) => a.totalRequests - b.totalRequests);
    return sortedServers[0];
  }

  private leastConnectionsSelection(servers: UpstreamServer[]): UpstreamServer {
    return servers.reduce((min, server) => 
      server.activeConnections < min.activeConnections ? server : min
    );
  }

  private weightedRoundRobinSelection(servers: UpstreamServer[]): UpstreamServer {
    const totalWeight = servers.reduce((sum, server) => sum + server.weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const server of servers) {
      currentWeight += server.weight;
      if (random <= currentWeight) {
        return server;
      }
    }
    
    return servers[0];
  }

  private leastResponseTimeSelection(servers: UpstreamServer[]): UpstreamServer {
    return servers.reduce((min, server) => 
      server.responseTime < min.responseTime ? server : min
    );
  }

  private ipHashSelection(servers: UpstreamServer[], clientIp: string): UpstreamServer {
    const hash = this.hashString(clientIp);
    const index = hash % servers.length;
    return servers[index];
  }

  private randomSelection(servers: UpstreamServer[]): UpstreamServer {
    const index = Math.floor(Math.random() * servers.length);
    return servers[index];
  }

  private async performHealthCheck(server: UpstreamServer): Promise<{ healthy: boolean }> {
    // Mock health check implementation
    const url = `http://${server.host}:${server.port}${this.config.healthCheck.path}`;
    
    try {
      // In real implementation, would make HTTP request with timeout
      const isHealthy = Math.random() > 0.1; // 90% healthy rate for simulation
      return { healthy: isHealthy };
    } catch (error) {
      return { healthy: false };
    }
  }

  private async markServerHealthy(server: UpstreamServer): Promise<void> {
    const wasUnhealthy = server.status !== 'healthy';
    server.status = 'healthy';
    
    // Reset circuit breaker on successful health check
    const circuitBreaker = this.circuitBreakers.get(server.id);
    if (circuitBreaker && circuitBreaker.state !== 'closed') {
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.currentSuccesses++;
        if (circuitBreaker.currentSuccesses >= circuitBreaker.successThreshold) {
          circuitBreaker.state = 'closed';
          circuitBreaker.currentFailures = 0;
        }
      }
    }
    
    if (wasUnhealthy) {
      console.log(`Server ${server.id} marked as healthy`);
    }
  }

  private async markServerUnhealthy(server: UpstreamServer): Promise<void> {
    const wasHealthy = server.status === 'healthy';
    server.status = 'unhealthy';
    
    // Update circuit breaker
    const circuitBreaker = this.circuitBreakers.get(server.id);
    if (circuitBreaker) {
      circuitBreaker.currentFailures++;
      circuitBreaker.lastFailure = new Date();
      
      if (circuitBreaker.currentFailures >= circuitBreaker.failureThreshold) {
        circuitBreaker.state = 'open';
        circuitBreaker.nextRetry = new Date(Date.now() + circuitBreaker.recoveryTimeout * 1000);
      }
    }
    
    if (wasHealthy) {
      console.log(`Server ${server.id} marked as unhealthy`);
    }
  }

  private async applyTrafficRules(request: any): Promise<TrafficRule> {
    const applicableRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of applicableRules) {
      if (await this.evaluateRuleCondition(rule.condition, request)) {
        return rule;
      }
    }

    // Default rule - allow
    return {
      id: 'default',
      name: 'Default Allow',
      priority: 999999,
      condition: { type: 'path', operator: 'equals', value: '*' },
      action: { type: 'route' },
      enabled: true
    };
  }

  private async evaluateRuleCondition(condition: TrafficRule['condition'], request: any): Promise<boolean> {
    let value: string;
    
    switch (condition.type) {
      case 'path':
        value = request.path;
        break;
      case 'header':
        value = request.headers[condition.field!] || '';
        break;
      case 'ip':
        value = request.clientIp;
        break;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return value.includes(condition.value as string);
      case 'regex':
        return new RegExp(condition.value as string).test(value);
      case 'in':
        return (condition.value as string[]).includes(value);
      default:
        return false;
    }
  }

  private async checkRateLimit(clientIp: string): Promise<void> {
    const key = `rate_limit_${clientIp}`;
    const limiter = this.rateLimiters.get(key);
    
    if (!limiter) {
      // Initialize rate limiter for this IP
      this.rateLimiters.set(key, {
        requests: 1,
        windowStart: Date.now(),
        lastRequest: Date.now()
      });
      return;
    }

    const now = Date.now();
    const windowSize = this.config.rateLimit.windowSize * 1000;
    
    // Reset window if expired
    if (now - limiter.windowStart > windowSize) {
      limiter.requests = 1;
      limiter.windowStart = now;
      limiter.lastRequest = now;
      return;
    }

    limiter.requests++;
    limiter.lastRequest = now;

    if (limiter.requests > this.config.rateLimit.requestsPerSecond) {
      throw new Error('Rate limit exceeded');
    }
  }

  private async handleStickySession(request: any, upstream: UpstreamServer): Promise<string> {
    switch (this.config.stickySessions.method) {
      case 'cookie':
        const cookieName = this.config.stickySessions.name || 'lb_session';
        const sessionId = request.headers[cookieName] || this.generateSessionId();
        return sessionId;
      case 'ip':
        return this.hashString(request.clientIp).toString();
      case 'header':
        const headerName = this.config.stickySessions.name || 'X-Session-ID';
        return request.headers[headerName] || this.generateSessionId();
      default:
        return this.generateSessionId();
    }
  }

  private generateProxyHeaders(request: any, upstream: UpstreamServer): Record<string, string> {
    return {
      'X-Forwarded-For': request.clientIp,
      'X-Forwarded-Proto': request.headers['x-forwarded-proto'] || 'http',
      'X-Forwarded-Host': request.headers.host,
      'X-Real-IP': request.clientIp,
      'X-Load-Balancer': this.config.name,
      'X-Upstream-Server': upstream.id
    };
  }

  private updateRequestMetrics(serverId: string): void {
    const server = this.upstreams.get(serverId);
    if (server) {
      server.totalRequests++;
      server.activeConnections++;
    }
  }

  private getCurrentMetrics(): LoadBalancerMetrics {
    const totalRequests = Array.from(this.upstreams.values())
      .reduce((sum, server) => sum + server.totalRequests, 0);
    
    const totalErrors = Array.from(this.upstreams.values())
      .reduce((sum, server) => sum + server.failedRequests, 0);
    
    const averageResponseTime = Array.from(this.upstreams.values())
      .reduce((sum, server) => sum + server.responseTime, 0) / this.upstreams.size;

    return {
      timestamp: new Date(),
      requestsPerSecond: totalRequests / 60, // Simplified calculation
      totalRequests,
      totalErrors,
      averageResponseTime,
      p95ResponseTime: averageResponseTime * 1.5, // Simplified
      p99ResponseTime: averageResponseTime * 2, // Simplified
      activeConnections: Array.from(this.upstreams.values())
        .reduce((sum, server) => sum + server.activeConnections, 0),
      upstream: Array.from(this.upstreams.values()).map(server => ({
        serverId: server.id,
        requests: server.totalRequests,
        errors: server.failedRequests,
        responseTime: server.responseTime,
        connections: server.activeConnections
      })),
      errorRates: {
        '4xx': totalErrors * 0.3, // Simplified
        '5xx': totalErrors * 0.7, // Simplified
        timeouts: totalErrors * 0.1,
        connectionErrors: totalErrors * 0.2
      }
    };
  }

  private calculateUptime(): number {
    // Simplified uptime calculation
    return 99.9;
  }

  private async waitForDraining(serverId: string): Promise<void> {
    const server = this.upstreams.get(serverId);
    if (!server) return;

    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    const startTime = Date.now();

    while (server.activeConnections > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  private initializeHealthChecks(): void {
    if (this.config.healthCheck.enabled) {
      setInterval(() => {
        this.healthCheck().catch(console.error);
      }, this.config.healthCheck.interval * 1000);
    }
  }

  private initializeMetricsCollection(): void {
    setInterval(() => {
      const metrics = this.getCurrentMetrics();
      this.metrics.push(metrics);
      
      // Keep only last 1000 metrics
      if (this.metrics.length > 1000) {
        this.metrics.splice(0, this.metrics.length - 1000);
      }
    }, 10000); // Collect every 10 seconds
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private generateUpstreamId(): string {
    return `upstream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export {
  type LoadBalancerConfig,
  type UpstreamServer,
  type LoadBalancerMetrics,
  type TrafficRule,
  type CircuitBreaker
};