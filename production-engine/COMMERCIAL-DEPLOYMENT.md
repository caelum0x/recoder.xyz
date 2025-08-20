# Commercial Production Engine Deployment Guide

This guide covers deploying the Recoder Production Engine as a commercial service with full monetization, billing, and enterprise features.

## 🚀 Key Commercial Features

- **OpenRouter AI Integration**: Access to 50+ premium AI models
- **Multi-tier Billing System**: Free, Professional, Business, and Enterprise plans
- **Advanced Rate Limiting**: Per-user quotas and concurrent request management
- **Usage Analytics**: Comprehensive tracking and cost optimization
- **SOC 2 Compliance**: Built-in security and compliance scanning
- **Enterprise Features**: Custom quotas, on-premise deployment, dedicated support

## 📋 Prerequisites

### Required Services
- **PostgreSQL 13+**: For user data, subscriptions, and billing
- **Redis 6+**: For caching, sessions, and rate limiting
- **OpenRouter API Key**: For AI model access ([Get one here](https://openrouter.ai/keys))
- **Stripe Account**: For payment processing (optional but recommended)

### Infrastructure Requirements
- **Memory**: Minimum 2GB RAM, recommended 4GB+
- **CPU**: Minimum 2 cores, recommended 4+ cores
- **Storage**: Minimum 20GB, recommended 100GB+
- **Network**: Stable internet connection with low latency

## 🔧 Installation & Setup

### 1. Clone and Install Dependencies

```bash
cd production-engine
npm install
```

### 2. Environment Configuration

Copy the commercial environment template:

```bash
cp .env.commercial.example .env
```

Configure the required environment variables:

```bash
# REQUIRED: OpenRouter API Key
OPENROUTER_API_KEY=your-openrouter-api-key-here

# REQUIRED: Database connections
DATABASE_URL=postgresql://username:password@localhost:5432/recoder_production
REDIS_URL=redis://localhost:6379

# RECOMMENDED: Stripe for payments
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### 3. Database Setup

Create PostgreSQL database and run migrations:

```bash
# Create database
createdb recoder_production

# Run migrations (if using Prisma)
npx prisma generate
npx prisma migrate deploy
```

### 4. Build and Start

```bash
# Build the application
npm run build

# Start in production mode
npm start
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│  Production     │────│   OpenRouter    │
│   (nginx/ALB)   │    │   Engine API    │    │   AI Service    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
            ┌───────▼────┐ ┌──▼──┐ ┌─────▼─────┐
            │ PostgreSQL │ │Redis│ │  Stripe   │
            │ Database   │ │Cache│ │ Payments  │
            └────────────┘ └─────┘ └───────────┘
```

## 💰 Pricing Tiers Configuration

The system comes with 4 built-in pricing tiers:

### Free Tier
- 100 requests/month
- 50K tokens/month
- Standard models only
- Community support

### Professional ($29/month)
- 2K requests/month
- 1M tokens/month
- All premium models
- Email support

### Business ($99/month)
- 10K requests/month
- 5M tokens/month
- SOC 2 compliance features
- Priority support

### Enterprise ($499/month)
- 100K requests/month
- 50M tokens/month
- Custom deployment
- Dedicated support

## 🔒 Security & Compliance

### Built-in Security Features
- **API Authentication**: Required API keys or user tokens
- **Rate Limiting**: Configurable per-user limits
- **Input Sanitization**: Prevents prompt injection attacks
- **Audit Logging**: Comprehensive request/response logging
- **SOC 2 Compliance**: Automated security scanning

### Compliance Configuration

Enable SOC 2 compliance features in environment:

```bash
SOC2_COMPLIANCE_ENABLED=true
AUDIT_LOG_LEVEL=info
DATA_RETENTION_DAYS=90
```

## 📊 Monitoring & Analytics

### Health Monitoring

The service provides comprehensive health endpoints:

```bash
# Overall service health
curl https://your-domain.com/api/status

# OpenRouter service health
curl https://your-domain.com/api/openrouter/health

# Rate limiting status
curl https://your-domain.com/api/rate-limit/user123
```

### Usage Analytics

Track usage patterns and optimize costs:

```bash
# Get user usage analytics
curl https://your-domain.com/api/billing/usage/user123

# Get pricing information
curl https://your-domain.com/api/billing/pricing
```

## 🚀 Production Deployment Options

### Option 1: Docker Deployment

```dockerfile
# Dockerfile included - build and deploy
docker build -t recoder-production-engine .
docker run -p 3002:3002 --env-file .env recoder-production-engine
```

### Option 2: Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recoder-production-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: recoder-production-engine
  template:
    metadata:
      labels:
        app: recoder-production-engine
    spec:
      containers:
      - name: production-engine
        image: your-registry/recoder-production-engine:latest
        ports:
        - containerPort: 3002
        env:
        - name: OPENROUTER_API_KEY
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: openrouter-api-key
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: database-url
```

### Option 3: AWS/Cloud Deployment

Configure for AWS ECS, Google Cloud Run, or similar:

```bash
# Environment variables for cloud deployment
CLOUD_PROVIDER=aws
REGION=us-east-1
LOAD_BALANCER_ARN=your-alb-arn
AUTO_SCALING_GROUP=recoder-production-asg
```

## 🔧 Advanced Configuration

### Custom Rate Limiting

Configure per-tier rate limits:

```javascript
// Custom tier configuration
const customTier = {
  id: 'startup',
  name: 'Startup',
  monthlyPrice: 199,
  limits: {
    requestsPerMonth: 50000,
    tokensPerMonth: 10000000,
    concurrentRequests: 10,
    premiumModels: true
  }
};
```

### Enterprise Features

Enable enterprise-specific features:

```bash
ENABLE_ENTERPRISE_FEATURES=true
ENABLE_ON_PREMISE_DEPLOYMENT=true
ENABLE_CUSTOM_MODELS=true
ENABLE_DEDICATED_INFRASTRUCTURE=true
```

### API Integration Examples

#### Authentication
```javascript
// API request with authentication
const response = await fetch('https://api.recoder.xyz/api/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key',
    'X-User-Id': 'user123'
  },
  body: JSON.stringify({
    description: 'Create a React login component',
    type: 'web',
    framework: 'react'
  })
});
```

#### Rate Limiting Response
```javascript
// Handle rate limiting
if (response.status === 429) {
  const data = await response.json();
  console.log(`Rate limited. Retry after: ${data.retryAfter} seconds`);
  console.log(`Remaining requests: ${data.remaining.requests}`);
}
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Deploy multiple instances behind a load balancer
- Use Redis for shared session/rate limiting state
- Configure database connection pooling

### Performance Optimization
- Enable Redis caching for frequent requests
- Configure CDN for static assets
- Implement request deduplication

### Cost Optimization
- Monitor OpenRouter usage and costs
- Implement model selection based on request complexity
- Use caching to reduce API calls

## 🔍 Troubleshooting

### Common Issues

1. **OpenRouter API Key Invalid**
   ```bash
   # Check API key configuration
   curl https://openrouter.ai/api/v1/models \
     -H "Authorization: Bearer $OPENROUTER_API_KEY"
   ```

2. **Database Connection Failed**
   ```bash
   # Test database connection
   pg_isready -h localhost -p 5432
   ```

3. **Rate Limiting Not Working**
   ```bash
   # Check Redis connection
   redis-cli ping
   ```

### Performance Issues

1. **High Latency**
   - Check OpenRouter model selection
   - Verify network connectivity
   - Monitor database query performance

2. **Memory Usage**
   - Adjust Node.js heap size
   - Configure garbage collection
   - Monitor concurrent request limits

## 💼 Commercial Success Metrics

Track these KPIs for commercial success:

- **Monthly Recurring Revenue (MRR)**
- **Customer Acquisition Cost (CAC)**
- **Customer Lifetime Value (CLV)**
- **API Usage Growth**
- **Model Performance**
- **Customer Satisfaction**

## 🆘 Support & Maintenance

### Monitoring Setup
- Set up health checks and alerts
- Configure log aggregation
- Monitor API usage and costs

### Backup Strategy
- Database backups (daily)
- Configuration backups
- User data export capabilities

### Update Procedures
- Rolling deployment strategy
- Database migration procedures
- API versioning strategy

## 📞 Getting Support

For commercial deployment support:

1. **Documentation**: Check this guide first
2. **GitHub Issues**: Report bugs and feature requests
3. **Enterprise Support**: Contact for custom solutions
4. **Community**: Join the developer community

---

## 🎯 Next Steps

1. Set up your OpenRouter API key
2. Configure your database and Redis
3. Deploy to your cloud provider
4. Set up monitoring and alerting
5. Configure your payment processing
6. Launch and start monetizing!

Your commercial AI code generation service is ready to generate revenue! 🚀