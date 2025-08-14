# @recoder/performance

High-performance monitoring, caching, and optimization utilities for Recoder.xyz

## Features

- 🚀 **Performance Monitoring** - Real-time system metrics, response times, and alerts
- 🔄 **Redis Caching** - Production-ready Redis cache with fallback mechanisms  
- 🌐 **CDN Management** - Asset optimization and edge caching integration
- 🛡️ **Performance Middleware** - Comprehensive Express.js middleware stack
- 📊 **Real-time Analytics** - Live performance tracking and health monitoring

## Installation

```bash
npm install @recoder/performance
```

## Quick Start

```typescript
import { PerformanceManager } from '@recoder/performance';

// Initialize performance manager
const performanceManager = new PerformanceManager({
  redis: { 
    url: 'redis://localhost:6379' 
  },
  monitoring: { 
    interval: 5000, 
    enableAlerts: true 
  }
});

await performanceManager.initialize();

// Get health status
const health = await performanceManager.getHealthStatus();
console.log('System Health:', health);
```

## Individual Components

### Performance Monitor

```typescript
import { PerformanceMonitor } from '@recoder/performance/monitoring';

const monitor = new PerformanceMonitor({
  interval: 5000,
  enableAlerts: true
});

await monitor.start();

// Record request performance
monitor.recordRequest(250); // 250ms response time

// Get metrics
const metrics = monitor.getMetrics();
console.log('Performance:', metrics);
```

### Redis Cache

```typescript
import { RedisCache } from '@recoder/performance/caching';

const cache = new RedisCache('redis://localhost:6379', {
  defaultTTL: 3600,
  enableFallback: true
});

await cache.connect();

// Cache operations
await cache.set('key', { data: 'value' }, 3600);
const value = await cache.get('key');
```

### Performance Middleware

```typescript
import express from 'express';
import { middlewareStacks } from '@recoder/performance/middleware';

const app = express();

// Full production middleware stack
app.use(...middlewareStacks.full({
  rateLimiting: { max: 100, windowMs: 15 * 60 * 1000 },
  security: { enableCORS: true, enableHelmet: true }
}));

app.listen(3000);
```

### CDN Manager

```typescript
import { CDNManager } from '@recoder/performance/cdn';

const cdn = new CDNManager({
  provider: 'cloudflare',
  baseUrl: 'https://cdn.example.com',
  enableCompression: true
});

await cdn.initialize();

// Upload files
const result = await cdn.uploadFile('./dist/app.js');
console.log('CDN URL:', result.url);
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# CDN Configuration  
CDN_PROVIDER=cloudflare
CDN_BASE_URL=https://cdn.example.com
CDN_API_KEY=your-api-key

# Monitoring
MONITORING_INTERVAL=5000
ENABLE_ALERTS=true
```

## Features in Detail

### Performance Monitoring
- Real-time CPU, memory, and response time tracking
- Configurable alerting thresholds
- Event loop lag detection
- Error rate monitoring
- Performance scoring and health status

### Redis Caching
- High-performance Redis integration
- Automatic fallback to in-memory cache
- Connection pooling and retry logic
- Cache statistics and health monitoring
- Configurable TTL and compression

### Middleware Stack
- Request/response logging
- Rate limiting with Redis backend
- Security headers (Helmet functionality)
- Error handling and monitoring
- Health check endpoints
- CORS configuration

### CDN Management
- Multi-provider CDN support (Cloudflare, AWS, etc.)
- Automatic asset optimization
- Image resizing and format conversion
- Cache purging and invalidation
- Bandwidth and usage analytics

## Scripts

```bash
# Build the package
npm run build

# Start in production
npm start

# Development with watch mode
npm run dev

# Type checking
npm run typecheck

# Clean build artifacts
npm run clean
```

## License

MIT - Part of the Recoder.xyz ecosystem