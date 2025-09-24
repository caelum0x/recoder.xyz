/**
 * Enhanced API Gateway Service
 * Optimized inter-service communication for Recoder.xyz ecosystem
 */

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

interface ServiceEndpoint {
  id: string;
  url: string;
  health: boolean;
  lastCheck: number;
  responseTime: number;
  errorCount: number;
}

interface LoadBalancerConfig {
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';
  healthCheck: {
    interval: number;
    timeout: number;
    path: string;
  };
}

export class EnhancedAPIGateway extends EventEmitter {
  private app: express.Application;
  private redis: Redis;
  private services: Map<string, ServiceEndpoint[]> = new Map();
  private currentIndex: Map<string, number> = new Map();
  private config: LoadBalancerConfig;

  constructor() {
    super();
    this.app = express();
    this.redis = new Redis(process.env.REDIS_URL);
    this.config = {
      algorithm: 'round-robin',
      healthCheck: {
        interval: 30000,
        timeout: 5000,
        path: '/health'
      }
    };
    
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.startHealthChecks();
  }

  private initializeServices() {
    // Define all Recoder.xyz services
    const serviceConfig = {
      'backend': [
        { id: 'backend-1', url: 'http://backend-1:3001', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 },
        { id: 'backend-2', url: 'http://backend-2:3001', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 },
        { id: 'backend-3', url: 'http://backend-3:3001', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 }
      ],
      'production-engine': [
        { id: 'prod-engine-1', url: 'http://production-engine-1:3002', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 },
        { id: 'prod-engine-2', url: 'http://production-engine-2:3002', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 }
      ],
      'chat-platform': [
        { id: 'chat-1', url: 'http://chat-platform-1:3003', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 },
        { id: 'chat-2', url: 'http://chat-platform-2:3003', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 }
      ],
      'ai-hub': [
        { id: 'ai-hub-1', url: 'http://ai-hub-1:3004', health: true, lastCheck: 0, responseTime: 0, errorCount: 0 }
      ]
    };

    Object.entries(serviceConfig).forEach(([service, endpoints]) => {
      this.services.set(service, endpoints);
      this.currentIndex.set(service, 0);
    });
  }

  private setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: [
        'https://recoder.xyz',
        'https://chat.recoder.xyz', 
        'https://app.recoder.xyz',
        'http://localhost:3000',
        'http://localhost:3003'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Compression
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      }
    }));

    // Rate limiting with Redis
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: async (req) => {
        // Dynamic rate limiting based on user tier
        const userTier = await this.getUserTier(req);
        switch (userTier) {
          case 'premium': return 10000;
          case 'pro': return 5000;
          case 'free': return 1000;
          default: return 100;
        }
      },
      keyGenerator: (req) => {
        const userId = this.extractUserId(req);
        return userId || req.ip;
      },
      store: new rateLimit.RedisStore({
        // @ts-ignore
        sendCommand: (...args: string[]) => this.redis.call(...args)
      }),
      message: {
        error: 'Too many requests',
        retryAfter: 60
      }
    });

    this.app.use('/api/', limiter);

    // Request logging and metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logRequest(req, res, duration);
        this.updateMetrics(req.path, duration, res.statusCode);
      });

      next();
    });

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: this.getServicesStatus()
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req: Request, res: Response): Promise<void> => {
      const metrics = await this.getSystemMetrics();
      res.json(metrics);
    });

    // Service routing with load balancing
    this.app.use('/api/backend', this.createServiceProxy('backend'));
    this.app.use('/api/production', this.createServiceProxy('production-engine'));
    this.app.use('/api/chat', this.createServiceProxy('chat-platform'));
    this.app.use('/api/ai', this.createServiceProxy('ai-hub'));

    // WebSocket proxy for real-time features
    this.setupWebSocketProxy();

    // Fallback error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('API Gateway Error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        requestId: this.generateRequestId()
      });
    });
  }

  private createServiceProxy(serviceName: string) {
    return createProxyMiddleware({
      target: 'http://placeholder', // Will be overridden by router
      changeOrigin: true,
      pathRewrite: {
        [`^/api/${serviceName === 'backend' ? 'backend' : serviceName === 'production-engine' ? 'production' : serviceName === 'chat-platform' ? 'chat' : 'ai'}`]: ''
      },
      router: async (req) => {
        const service = await this.selectHealthyService(serviceName);
        return service?.url || 'http://fallback:3000';
      },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${serviceName}:`, err);
        this.handleServiceError(serviceName, err);
        
        // @ts-ignore
        res.status(503).json({
          error: 'Service unavailable',
          service: serviceName,
          message: 'The requested service is temporarily unavailable'
        });
      },
      onProxyReq: (proxyReq, req) => {
        // Add request tracking headers
        proxyReq.setHeader('X-Gateway-Request-Id', this.generateRequestId());
        proxyReq.setHeader('X-Gateway-Timestamp', Date.now().toString());
      },
      onProxyRes: (proxyRes, req) => {
        // Add response headers
        proxyRes.headers['X-Gateway-Response-Time'] = Date.now().toString();
      }
    });
  }

  private async selectHealthyService(serviceName: string): Promise<ServiceEndpoint | null> {
    const services = this.services.get(serviceName);
    if (!services || services.length === 0) return null;

    const healthyServices = services.filter(s => s.health);
    if (healthyServices.length === 0) {
      // No healthy services, try to use any available (circuit breaker open)
      console.warn(`No healthy services for ${serviceName}, using fallback`);
      return services[0];
    }

    // Load balancing algorithm
    switch (this.config.algorithm) {
      case 'round-robin':
        return this.selectRoundRobin(serviceName, healthyServices);
      
      case 'least-connections':
        return this.selectLeastConnections(healthyServices);
      
      case 'weighted':
        return this.selectWeighted(healthyServices);
      
      default:
        return healthyServices[0];
    }
  }

  private selectRoundRobin(serviceName: string, services: ServiceEndpoint[]): ServiceEndpoint {
    const currentIdx = this.currentIndex.get(serviceName) || 0;
    const selectedService = services[currentIdx % services.length];
    this.currentIndex.set(serviceName, (currentIdx + 1) % services.length);
    return selectedService;
  }

  private selectLeastConnections(services: ServiceEndpoint[]): ServiceEndpoint {
    // For now, use response time as a proxy for connections
    return services.reduce((best, current) => 
      current.responseTime < best.responseTime ? current : best
    );
  }

  private selectWeighted(services: ServiceEndpoint[]): ServiceEndpoint {
    // Weight based on inverse of response time and error rate
    const weights = services.map(s => {
      const errorPenalty = s.errorCount * 10;
      const responsePenalty = s.responseTime;
      return Math.max(1, 1000 - errorPenalty - responsePenalty);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < services.length; i++) {
      random -= weights[i];
      if (random <= 0) return services[i];
    }

    return services[0];
  }

  private startHealthChecks() {
    setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheck.interval);

    // Initial health check
    this.performHealthChecks();
  }

  private async performHealthChecks() {
    for (const [serviceName, endpoints] of this.services.entries()) {
      const healthPromises = endpoints.map(endpoint => this.checkServiceHealth(endpoint));
      await Promise.allSettled(healthPromises);
    }

    // Emit health status update
    this.emit('health-update', this.getServicesStatus());
  }

  private async checkServiceHealth(endpoint: ServiceEndpoint): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${endpoint.url}${this.config.healthCheck.path}`, {
        method: 'GET',
        timeout: this.config.healthCheck.timeout,
        headers: {
          'User-Agent': 'Recoder-Gateway-HealthCheck/1.0'
        }
      });

      const responseTime = Date.now() - startTime;
      const wasHealthy = endpoint.health;
      
      endpoint.health = response.status === 200;
      endpoint.responseTime = responseTime;
      endpoint.lastCheck = Date.now();

      if (endpoint.health) {
        endpoint.errorCount = Math.max(0, endpoint.errorCount - 1); // Gradual recovery
      }

      // Log status changes
      if (wasHealthy !== endpoint.health) {
        console.log(`Service ${endpoint.id} status changed: ${wasHealthy ? 'healthy' : 'unhealthy'} -> ${endpoint.health ? 'healthy' : 'unhealthy'}`);
        this.emit('service-status-change', { endpoint, previousHealth: wasHealthy });
      }

    } catch (error) {
      endpoint.health = false;
      endpoint.errorCount += 1;
      endpoint.responseTime = Date.now() - startTime;
      endpoint.lastCheck = Date.now();

      console.error(`Health check failed for ${endpoint.id}:`, error);
    }
  }

  private handleServiceError(serviceName: string, error: Error) {
    const services = this.services.get(serviceName);
    if (services) {
      // Increase error count for all services of this type
      services.forEach(service => {
        service.errorCount += 1;
        if (service.errorCount > 5) {
          service.health = false;
        }
      });
    }

    this.emit('service-error', { serviceName, error });
  }

  private getServicesStatus() {
    const status: any = {};
    
    for (const [serviceName, endpoints] of this.services.entries()) {
      const healthyCount = endpoints.filter(e => e.health).length;
      const totalCount = endpoints.length;
      const avgResponseTime = endpoints
        .filter(e => e.health)
        .reduce((sum, e) => sum + e.responseTime, 0) / Math.max(1, healthyCount);

      status[serviceName] = {
        healthy: healthyCount,
        total: totalCount,
        availability: (healthyCount / totalCount) * 100,
        averageResponseTime: Math.round(avgResponseTime),
        endpoints: endpoints.map(e => ({
          id: e.id,
          health: e.health,
          responseTime: e.responseTime,
          errorCount: e.errorCount,
          lastCheck: new Date(e.lastCheck).toISOString()
        }))
      };
    }

    return status;
  }

  private async getSystemMetrics() {
    const [
      requestMetrics,
      errorMetrics,
      responseTimeMetrics
    ] = await Promise.all([
      this.redis.hgetall('gateway:metrics:requests'),
      this.redis.hgetall('gateway:metrics:errors'),
      this.redis.hgetall('gateway:metrics:response_times')
    ]);

    return {
      requests: requestMetrics,
      errors: errorMetrics,
      responseTimes: responseTimeMetrics,
      services: this.getServicesStatus(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  private setupWebSocketProxy() {
    // WebSocket proxy setup for real-time features
    const WebSocketProxy = require('http-proxy-middleware').createProxyMiddleware;
    
    this.app.use('/ws', WebSocketProxy({
      target: 'ws://chat-platform:3003',
      ws: true,
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error('WebSocket proxy error:', err);
      }
    }));
  }

  private async getUserTier(req: Request): Promise<string> {
    try {
      const token = this.extractToken(req);
      if (!token) return 'anonymous';

      const userInfo = await this.redis.get(`user:${this.extractUserId(req)}:tier`);
      return userInfo || 'free';
    } catch (error) {
      return 'free';
    }
  }

  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  private extractUserId(req: Request): string | null {
    // Extract user ID from JWT token
    try {
      const token = this.extractToken(req);
      if (!token) return null;

      // Decode JWT without verification (just for user ID)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.sub || payload.userId;
    } catch (error) {
      return null;
    }
  }

  private logRequest(req: Request, res: Response, duration: number) {
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };

    // Log to console and metrics
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    
    // Store metrics in Redis
    this.updateMetrics(req.path, duration, res.statusCode);
  }

  private async updateMetrics(path: string, duration: number, statusCode: number) {
    const hour = new Date().getHours();
    const key = `gateway:metrics:${hour}`;

    await this.redis.hincrby(`${key}:requests`, path, 1);
    await this.redis.hincrby(`${key}:response_times`, path, duration);
    
    if (statusCode >= 400) {
      await this.redis.hincrby(`${key}:errors`, path, 1);
    }

    // Set expiry for hourly metrics
    await this.redis.expire(`${key}:requests`, 86400); // 24 hours
    await this.redis.expire(`${key}:response_times`, 86400);
    await this.redis.expire(`${key}:errors`, 86400);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public start(port: number = 8080) {
    this.app.listen(port, () => {
      console.log(`🚀 Enhanced API Gateway running on port ${port}`);
      console.log(`📊 Health checks running every ${this.config.healthCheck.interval / 1000}s`);
      console.log(`⚡ Load balancing algorithm: ${this.config.algorithm}`);
    });
  }
}

// Export for use
export default EnhancedAPIGateway;