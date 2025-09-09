/**
 * Unified API Gateway for Cross-Platform Synchronization
 * Handles request routing, load balancing, and rate limiting across all platforms
 */

import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { createHash } from 'crypto';

export interface APIRoute {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  handler: string; // Function name or service endpoint
  middleware: string[];
  rateLimit: {
    requests: number;
    window: number; // seconds
    burst: number;
  };
  authentication: {
    required: boolean;
    roles?: string[];
    permissions?: string[];
  };
  platforms: string[]; // Which platforms can access this route
  version: string;
  deprecated?: boolean;
  documentation?: string;
}

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted';
  healthCheck: {
    enabled: boolean;
    interval: number; // seconds
    timeout: number; // seconds
    path: string;
    expectedStatus: number;
  };
  services: ServiceEndpoint[];
}

export interface ServiceEndpoint {
  id: string;
  name: string;
  url: string;
  weight: number;
  healthy: boolean;
  lastHealthCheck: string;
  responseTime: number;
  activeConnections: number;
  totalRequests: number;
  errorRate: number;
  metadata: Record<string, any>;
}

export interface RequestContext {
  id: string;
  userId?: string;
  sessionId?: string;
  platform: string;
  route: APIRoute;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  timestamp: string;
  sourceIP: string;
  userAgent: string;
  rateLimitInfo: {
    remaining: number;
    resetTime: number;
    totalRequests: number;
  };
  loadBalancerInfo: {
    selectedService: string;
    strategy: string;
    responseTime: number;
  };
}

export interface RateLimitRule {
  id: string;
  name: string;
  pattern: string; // Route pattern
  limits: {
    requests: number;
    window: number; // seconds
    burst: number;
  };
  scope: 'global' | 'user' | 'ip' | 'session';
  action: 'allow' | 'throttle' | 'block';
  message?: string;
  enabled: boolean;
}

export interface APIMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  topEndpoints: Array<{
    path: string;
    requests: number;
    averageTime: number;
  }>;
  rateLimitViolations: number;
  healthCheckFailures: number;
  platformUsage: Record<string, number>;
}

export class UnifiedAPIGateway {
  private redis: Redis;
  private routes: Map<string, APIRoute> = new Map();
  private services: Map<string, ServiceEndpoint> = new Map();
  private rateLimitRules: Map<string, RateLimitRule> = new Map();
  private loadBalancers: Map<string, LoadBalancerConfig> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private requestQueue: Map<string, Array<() => void>> = new Map();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_GATEWAY_DB || '4'),
      keyPrefix: 'recoder:gateway:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    this.initializeDefaultRateLimits();
    this.initializeDefaultServices();
    this.startHealthChecks();
  }

  /**
   * Register API route
   */
  registerRoute(route: APIRoute): void {
    const routeKey = `${route.method}:${route.path}`;
    this.routes.set(routeKey, route);
    
    // Store in Redis for persistence
    this.redis.hset('routes', routeKey, JSON.stringify(route));
  }

  /**
   * Register service endpoint
   */
  registerService(service: ServiceEndpoint): void {
    this.services.set(service.id, service);
    
    // Store in Redis for persistence
    this.redis.hset('services', service.id, JSON.stringify(service));
    
    // Start health checks for this service
    this.startServiceHealthCheck(service);
  }

  /**
   * Handle incoming HTTP request
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      // Parse request
      const url = parse(req.url || '', true);
      const path = url.pathname || '/';
      const method = req.method || 'GET';
      const query = url.query as Record<string, string>;
      
      // Extract platform from headers or user agent
      const platform = this.extractPlatform(req);
      
      // Find matching route
      const route = this.findRoute(method, path);
      if (!route) {
        this.sendErrorResponse(res, 404, 'Route not found');
        return;
      }

      // Create request context
      const context: RequestContext = {
        id: requestId,
        platform,
        route,
        method,
        path,
        headers: req.headers as Record<string, string>,
        query,
        body: await this.parseBody(req),
        timestamp: new Date().toISOString(),
        sourceIP: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        rateLimitInfo: { remaining: 0, resetTime: 0, totalRequests: 0 },
        loadBalancerInfo: { selectedService: '', strategy: '', responseTime: 0 },
      };

      // Authentication check
      if (route.authentication.required) {
        const authResult = await this.authenticateRequest(context);
        if (!authResult.success) {
          this.sendErrorResponse(res, 401, authResult.message);
          return;
        }
        context.userId = authResult.userId;
        context.sessionId = authResult.sessionId;
      }

      // Rate limiting check
      const rateLimitResult = await this.checkRateLimit(context);
      if (!rateLimitResult.allowed) {
        context.rateLimitInfo = rateLimitResult.info;
        this.sendErrorResponse(res, 429, rateLimitResult.message, {
          'X-RateLimit-Remaining': rateLimitResult.info.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.info.resetTime.toString(),
        });
        return;
      }
      context.rateLimitInfo = rateLimitResult.info;

      // Load balancing
      const service = await this.selectService(route);
      if (!service) {
        this.sendErrorResponse(res, 503, 'Service unavailable');
        return;
      }

      // Forward request to selected service
      const response = await this.forwardRequest(context, service);
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      await this.updateMetrics(context, service, responseTime, response.success);

      // Send response
      if (response.success) {
        res.writeHead(response.statusCode, response.headers);
        res.end(response.body);
      } else {
        this.sendErrorResponse(res, response.statusCode, response.error || 'Unknown error');
      }

    } catch (error) {
      console.error('Gateway request error:', error);
      this.sendErrorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Handle WebSocket connections
   */
  handleWebSocket(ws: WebSocket, req: IncomingMessage): void {
    const platform = this.extractPlatform(req);
    const connectionId = this.generateRequestId();
    
    this.wsConnections.set(connectionId, ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(connectionId, message, platform);
      } catch (error) {
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      this.wsConnections.delete(connectionId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.wsConnections.delete(connectionId);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      connectionId,
      platform,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Find matching route
   */
  private findRoute(method: string, path: string): APIRoute | null {
    // First, try exact match
    const exactKey = `${method}:${path}`;
    if (this.routes.has(exactKey)) {
      return this.routes.get(exactKey)!;
    }

    // Then, try pattern matching
    for (const [routeKey, route] of this.routes.entries()) {
      if (route.method === method && this.matchPath(route.path, path)) {
        return route;
      }
    }

    return null;
  }

  /**
   * Match path patterns (simple implementation)
   */
  private matchPath(pattern: string, path: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/:\w+/g, '([^/]+)') // Replace :param with capture group
      .replace(/\*/g, '.*'); // Replace * with wildcard
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Authenticate request
   */
  private async authenticateRequest(context: RequestContext): Promise<{
    success: boolean;
    userId?: string;
    sessionId?: string;
    message: string;
  }> {
    const authHeader = context.headers['authorization'];
    if (!authHeader) {
      return { success: false, message: 'Authorization header required' };
    }

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return { success: false, message: 'Invalid authorization format' };
    }

    // Validate token (simplified - use proper JWT validation in production)
    try {
      // Check if session exists in Redis
      const sessionData = await this.redis.get(`session:${token}`);
      if (!sessionData) {
        return { success: false, message: 'Invalid or expired token' };
      }

      const session = JSON.parse(sessionData);
      return {
        success: true,
        userId: session.userId,
        sessionId: session.sessionId,
        message: 'Authenticated',
      };
    } catch (error) {
      return { success: false, message: 'Authentication failed' };
    }
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(context: RequestContext): Promise<{
    allowed: boolean;
    message: string;
    info: {
      remaining: number;
      resetTime: number;
      totalRequests: number;
    };
  }> {
    const rule = this.findRateLimitRule(context.path);
    if (!rule || !rule.enabled) {
      return {
        allowed: true,
        message: 'No rate limit',
        info: { remaining: -1, resetTime: 0, totalRequests: 0 },
      };
    }

    const key = this.getRateLimitKey(rule, context);
    const window = rule.limits.window;
    const limit = rule.limits.requests;

    // Use Redis sliding window
    const now = Date.now();
    const windowStart = now - (window * 1000);

    // Remove old entries
    await this.redis.zremrangebyscore(`ratelimit:${key}`, 0, windowStart);

    // Count current requests
    const currentRequests = await this.redis.zcard(`ratelimit:${key}`);

    if (currentRequests >= limit) {
      const oldestRequest = await this.redis.zrange(`ratelimit:${key}`, 0, 0, 'WITHSCORES');
      const resetTime = oldestRequest.length > 0 ? 
        parseInt(oldestRequest[1]) + (window * 1000) : 
        now + (window * 1000);

      return {
        allowed: false,
        message: rule.message || 'Rate limit exceeded',
        info: {
          remaining: 0,
          resetTime,
          totalRequests: currentRequests,
        },
      };
    }

    // Add current request
    await this.redis.zadd(`ratelimit:${key}`, now, `${now}-${Math.random()}`);
    await this.redis.expire(`ratelimit:${key}`, window);

    return {
      allowed: true,
      message: 'Rate limit passed',
      info: {
        remaining: limit - currentRequests - 1,
        resetTime: now + (window * 1000),
        totalRequests: currentRequests + 1,
      },
    };
  }

  /**
   * Select service for load balancing
   */
  private async selectService(route: APIRoute): Promise<ServiceEndpoint | null> {
    const healthyServices = Array.from(this.services.values())
      .filter(service => service.healthy);

    if (healthyServices.length === 0) {
      return null;
    }

    // Simple round-robin for now
    const serviceIndex = Date.now() % healthyServices.length;
    return healthyServices[serviceIndex];
  }

  /**
   * Forward request to service
   */
  private async forwardRequest(
    context: RequestContext,
    service: ServiceEndpoint
  ): Promise<{
    success: boolean;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    error?: string;
  }> {
    try {
      const url = `${service.url}${context.path}`;
      const queryString = new URLSearchParams(context.query).toString();
      const fullUrl = queryString ? `${url}?${queryString}` : url;

      const response = await fetch(fullUrl, {
        method: context.method,
        headers: {
          ...context.headers,
          'X-Request-ID': context.id,
          'X-Platform': context.platform,
          'X-User-ID': context.userId || '',
        },
        body: context.method !== 'GET' ? JSON.stringify(context.body) : undefined,
      });

      const responseBody = await response.text();

      return {
        success: response.ok,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        error: response.ok ? undefined : `Service returned ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: 502,
        headers: {},
        body: '',
        error: `Service connection failed: ${error}`,
      };
    }
  }

  /**
   * Update metrics
   */
  private async updateMetrics(
    context: RequestContext,
    service: ServiceEndpoint,
    responseTime: number,
    success: boolean
  ): Promise<void> {
    const metricsKey = `metrics:${new Date().toISOString().split('T')[0]}`;
    
    // Update service metrics
    service.totalRequests++;
    service.responseTime = (service.responseTime + responseTime) / 2;
    if (!success) {
      service.errorRate = (service.errorRate + 1) / service.totalRequests;
    }

    // Update global metrics
    await this.redis.hincrby(metricsKey, 'totalRequests', 1);
    await this.redis.hincrby(metricsKey, success ? 'successfulRequests' : 'failedRequests', 1);
    await this.redis.hincrby(metricsKey, `platform:${context.platform}`, 1);
    
    // Update endpoint metrics
    await this.redis.hincrby(`endpoint:${context.path}`, 'requests', 1);
    await this.redis.hincrby(`endpoint:${context.path}`, 'totalTime', responseTime);
  }

  /**
   * Initialize default rate limits
   */
  private initializeDefaultRateLimits(): void {
    const defaultRules: RateLimitRule[] = [
      {
        id: 'global',
        name: 'Global Rate Limit',
        pattern: '*',
        limits: { requests: 1000, window: 3600, burst: 100 },
        scope: 'ip',
        action: 'throttle',
        enabled: true,
      },
      {
        id: 'auth',
        name: 'Authentication Rate Limit',
        pattern: '/api/auth/*',
        limits: { requests: 10, window: 300, burst: 5 },
        scope: 'ip',
        action: 'block',
        enabled: true,
      },
      {
        id: 'api',
        name: 'API Rate Limit',
        pattern: '/api/*',
        limits: { requests: 100, window: 60, burst: 20 },
        scope: 'user',
        action: 'throttle',
        enabled: true,
      },
    ];

    defaultRules.forEach(rule => {
      this.rateLimitRules.set(rule.id, rule);
    });
  }

  /**
   * Initialize default services
   */
  private initializeDefaultServices(): void {
    const defaultServices: ServiceEndpoint[] = [
      {
        id: 'web-primary',
        name: 'Web Application Primary',
        url: process.env.WEB_SERVICE_URL || 'http://localhost:3000',
        weight: 1,
        healthy: true,
        lastHealthCheck: new Date().toISOString(),
        responseTime: 0,
        activeConnections: 0,
        totalRequests: 0,
        errorRate: 0,
        metadata: { version: '1.0.0', region: 'us-east-1' },
      },
    ];

    defaultServices.forEach(service => {
      this.registerService(service);
    });
  }

  /**
   * Start health checks for all services
   */
  private startHealthChecks(): void {
    this.services.forEach(service => {
      this.startServiceHealthCheck(service);
    });
  }

  /**
   * Start health check for specific service
   */
  private startServiceHealthCheck(service: ServiceEndpoint): void {
    const interval = setInterval(async () => {
      try {
        const healthUrl = `${service.url}/health`;
        const startTime = Date.now();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        const healthy = response.status === 200;

        // Update service health
        service.healthy = healthy;
        service.lastHealthCheck = new Date().toISOString();
        service.responseTime = responseTime;

        // Store updated service
        await this.redis.hset('services', service.id, JSON.stringify(service));

      } catch (error) {
        service.healthy = false;
        service.lastHealthCheck = new Date().toISOString();
        
        await this.redis.hset('services', service.id, JSON.stringify(service));
        console.error(`Health check failed for service ${service.id}:`, error);
      }
    }, 30000); // Check every 30 seconds

    this.healthCheckIntervals.set(service.id, interval);
  }

  /**
   * Helper methods
   */
  private extractPlatform(req: IncomingMessage): string {
    const platformHeader = req.headers['x-platform'] as string;
    if (platformHeader) return platformHeader;

    const userAgent = req.headers['user-agent'] || '';
    
    if (userAgent.includes('recoder-cli')) return 'cli';
    if (userAgent.includes('recoder-vscode')) return 'vscode';
    if (userAgent.includes('recoder-mobile')) return 'mobile';
    if (userAgent.includes('recoder-desktop')) return 'desktop';
    
    return 'web';
  }

  private generateRequestId(): string {
    return createHash('sha256')
      .update(`${Date.now()}_${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
    });
  }

  private findRateLimitRule(path: string): RateLimitRule | null {
    for (const rule of this.rateLimitRules.values()) {
      if (this.matchPath(rule.pattern, path)) {
        return rule;
      }
    }
    return null;
  }

  private getRateLimitKey(rule: RateLimitRule, context: RequestContext): string {
    switch (rule.scope) {
      case 'user':
        return `${rule.id}:user:${context.userId || 'anonymous'}`;
      case 'session':
        return `${rule.id}:session:${context.sessionId || 'anonymous'}`;
      case 'ip':
        return `${rule.id}:ip:${context.sourceIP}`;
      default:
        return `${rule.id}:global`;
    }
  }

  private sendErrorResponse(
    res: ServerResponse,
    statusCode: number,
    message: string,
    headers: Record<string, string> = {}
  ): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      ...headers,
    });
    res.end(JSON.stringify({ error: message, timestamp: new Date().toISOString() }));
  }

  private async handleWebSocketMessage(
    connectionId: string,
    message: any,
    platform: string
  ): Promise<void> {
    const ws = this.wsConnections.get(connectionId);
    if (!ws) return;

    try {
      // Handle different message types
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        
        case 'subscribe':
          // Handle subscription to real-time events
          if (message.channel) {
            await this.redis.sadd(`subscribers:${message.channel}`, connectionId);
            ws.send(JSON.stringify({ type: 'subscribed', channel: message.channel }));
          }
          break;
        
        case 'unsubscribe':
          // Handle unsubscription
          if (message.channel) {
            await this.redis.srem(`subscribers:${message.channel}`, connectionId);
            ws.send(JSON.stringify({ type: 'unsubscribed', channel: message.channel }));
          }
          break;
        
        default:
          ws.send(JSON.stringify({ error: 'Unknown message type' }));
      }
    } catch (error) {
      console.error('WebSocket message handling error:', error);
      ws.send(JSON.stringify({ error: 'Message processing failed' }));
    }
  }

  /**
   * Get API metrics
   */
  async getMetrics(): Promise<APIMetrics> {
    const today = new Date().toISOString().split('T')[0];
    const metricsKey = `metrics:${today}`;
    
    const metrics = await this.redis.hgetall(metricsKey);
    
    return {
      totalRequests: parseInt(metrics.totalRequests || '0'),
      successfulRequests: parseInt(metrics.successfulRequests || '0'),
      failedRequests: parseInt(metrics.failedRequests || '0'),
      averageResponseTime: 0, // Calculate from service data
      requestsPerSecond: 0, // Calculate based on time window
      errorRate: 0, // Calculate from success/failed ratio
      topEndpoints: [], // Get from endpoint metrics
      rateLimitViolations: parseInt(metrics.rateLimitViolations || '0'),
      healthCheckFailures: parseInt(metrics.healthCheckFailures || '0'),
      platformUsage: Object.keys(metrics)
        .filter(key => key.startsWith('platform:'))
        .reduce((acc, key) => {
          const platform = key.replace('platform:', '');
          acc[platform] = parseInt(metrics[key] || '0');
          return acc;
        }, {} as Record<string, number>),
    };
  }

  /**
   * Close connections and cleanup
   */
  async disconnect(): Promise<void> {
    // Clear health check intervals
    this.healthCheckIntervals.forEach(interval => clearInterval(interval));
    
    // Close WebSocket connections
    this.wsConnections.forEach(ws => ws.close());
    
    // Close Redis connection
    await this.redis.disconnect();
  }
}

// Export singleton instance
export const apiGateway = new UnifiedAPIGateway();
