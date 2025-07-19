const { BaseGenerator } = require('./baseGenerator');
const { logger } = require('../utils/logger');
const path = require('path');

class ProductionGenerator extends BaseGenerator {
  constructor(options = {}) {
    super(options);
    this.registerProductionTemplates();
  }

  registerProductionTemplates() {
    // Docker templates
    this.registerTemplate('dockerfile', (data) => this.generateDockerfile(data));
    this.registerTemplate('dockerCompose', (data) => this.generateDockerCompose(data));
    this.registerTemplate('dockerIgnore', (data) => this.generateDockerIgnore(data));

    // CI/CD templates
    this.registerTemplate('githubActions', (data) => this.generateGithubActions(data));
    this.registerTemplate('gitlabCI', (data) => this.generateGitlabCI(data));
    this.registerTemplate('jenkinsfile', (data) => this.generateJenkinsfile(data));

    // Configuration templates
    this.registerTemplate('nginx', (data) => this.generateNginxConfig(data));
    this.registerTemplate('pm2', (data) => this.generatePM2Config(data));
    this.registerTemplate('env', (data) => this.generateEnvTemplate(data));

    // Monitoring templates
    this.registerTemplate('prometheus', (data) => this.generatePrometheusConfig(data));
    this.registerTemplate('grafana', (data) => this.generateGrafanaConfig(data));
    this.registerTemplate('logging', (data) => this.generateLoggingConfig(data));

    // Security templates
    this.registerTemplate('helmet', (data) => this.generateHelmetConfig(data));
    this.registerTemplate('cors', (data) => this.generateCorsConfig(data));
    this.registerTemplate('security', (data) => this.generateSecurityConfig(data));
  }

  async generate(input, context = {}) {
    try {
      this.validateInput(input, ['projectName', 'projectType']);

      const result = await this.performAsyncGeneration(input, async () => {
        const config = this.mergeConfigurations(
          this.getDefaultProductionConfig(),
          input,
          context
        );

        const structure = await this.generateProductionStructure(config);
        return await this.generateFromStructure(structure);
      });

      return this.createGenerationResult(true, {
        productionType: input.projectType,
        deployment: input.deployment || 'docker',
        environment: input.environment || 'production'
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  getDefaultProductionConfig() {
    return {
      deployment: 'docker',
      environment: 'production',
      monitoring: true,
      logging: true,
      security: true,
      ci: 'github',
      webServer: 'nginx',
      processManager: 'pm2',
      database: 'postgresql',
      cache: 'redis',
      queue: 'redis',
      scaling: {
        replicas: 3,
        autoscaling: true,
        loadBalancer: true
      },
      security: {
        https: true,
        cors: true,
        helmet: true,
        rateLimit: true
      },
      monitoring: {
        prometheus: true,
        grafana: true,
        alerts: true
      }
    };
  }

  async generateProductionStructure(config) {
    const structure = {};

    // Docker configuration
    if (config.deployment === 'docker') {
      structure['Dockerfile'] = { template: 'dockerfile', data: config };
      structure['docker-compose.yml'] = { template: 'dockerCompose', data: config };
      structure['.dockerignore'] = { template: 'dockerIgnore', data: config };
    }

    // CI/CD configuration
    if (config.ci === 'github') {
      structure['.github'] = {
        'workflows': {
          'deploy.yml': { template: 'githubActions', data: config }
        }
      };
    } else if (config.ci === 'gitlab') {
      structure['.gitlab-ci.yml'] = { template: 'gitlabCI', data: config };
    } else if (config.ci === 'jenkins') {
      structure['Jenkinsfile'] = { template: 'jenkinsfile', data: config };
    }

    // Web server configuration
    if (config.webServer === 'nginx') {
      structure['nginx'] = {
        'nginx.conf': { template: 'nginx', data: config }
      };
    }

    // Process management
    if (config.processManager === 'pm2') {
      structure['ecosystem.config.js'] = { template: 'pm2', data: config };
    }

    // Environment configuration
    structure['.env.production'] = { template: 'env', data: config };
    structure['.env.example'] = { template: 'env', data: { ...config, example: true } };

    // Monitoring configuration
    if (config.monitoring.prometheus) {
      structure['monitoring'] = {
        'prometheus.yml': { template: 'prometheus', data: config },
        'grafana': {
          'dashboard.json': { template: 'grafana', data: config }
        }
      };
    }

    // Security configuration
    structure['config'] = {
      'security.js': { template: 'security', data: config },
      'cors.js': { template: 'cors', data: config },
      'helmet.js': { template: 'helmet', data: config }
    };

    // Logging configuration
    structure['config']['logging.js'] = { template: 'logging', data: config };

    // Health check and readiness probes
    structure['health.js'] = this.generateHealthCheck(config);
    structure['scripts'] = {
      'deploy.sh': this.generateDeployScript(config),
      'rollback.sh': this.generateRollbackScript(config),
      'backup.sh': this.generateBackupScript(config)
    };

    return structure;
  }

  generateDockerfile(data) {
    const {
      projectType = 'node',
      nodeVersion = '18-alpine',
      port = 3000,
      buildSteps = [],
      dependencies = []
    } = data;

    return `# Production Dockerfile for ${data.projectName}
FROM node:${nodeVersion} AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build application
${buildSteps.map(step => `RUN ${step}`).join('\n')}

# Production stage
FROM node:${nodeVersion}

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to app user
USER nodejs

# Expose port
EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node health.js || exit 1

# Start application
CMD ["node", "dist/server.js"]`;
  }

  generateDockerCompose(data) {
    const services = this.generateDockerServices(data);
    
    return `# Docker Compose for ${data.projectName}
version: '3.8'

services:
${Object.entries(services).map(([name, config]) => 
  `  ${name}:\n${this.formatDockerService(config)}`
).join('\n\n')}

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  app_network:
    driver: bridge`;
  }

  generateDockerServices(data) {
    const services = {};

    // Main application service
    services.app = {
      build: {
        context: '.',
        dockerfile: 'Dockerfile'
      },
      ports: [`${data.port || 3000}:${data.port || 3000}`],
      environment: [
        'NODE_ENV=production',
        'DATABASE_URL=${DATABASE_URL}',
        'REDIS_URL=${REDIS_URL}'
      ],
      depends_on: ['postgres', 'redis'],
      networks: ['app_network'],
      restart: 'unless-stopped',
      deploy: {
        replicas: data.scaling?.replicas || 3,
        resources: {
          limits: { memory: '512M', cpus: '0.5' },
          reservations: { memory: '256M', cpus: '0.25' }
        }
      }
    };

    // Database service
    if (data.database === 'postgresql') {
      services.postgres = {
        image: 'postgres:15-alpine',
        environment: [
          'POSTGRES_DB=${POSTGRES_DB}',
          'POSTGRES_USER=${POSTGRES_USER}',
          'POSTGRES_PASSWORD=${POSTGRES_PASSWORD}'
        ],
        volumes: ['postgres_data:/var/lib/postgresql/data'],
        networks: ['app_network'],
        restart: 'unless-stopped'
      };
    }

    // Cache service
    if (data.cache === 'redis') {
      services.redis = {
        image: 'redis:7-alpine',
        command: 'redis-server --appendonly yes',
        volumes: ['redis_data:/data'],
        networks: ['app_network'],
        restart: 'unless-stopped'
      };
    }

    // Load balancer
    if (data.webServer === 'nginx') {
      services.nginx = {
        image: 'nginx:alpine',
        ports: ['80:80', '443:443'],
        volumes: [
          './nginx/nginx.conf:/etc/nginx/nginx.conf',
          './nginx/ssl:/etc/nginx/ssl'
        ],
        depends_on: ['app'],
        networks: ['app_network'],
        restart: 'unless-stopped'
      };
    }

    // Monitoring services
    if (data.monitoring?.prometheus) {
      services.prometheus = {
        image: 'prom/prometheus:latest',
        ports: ['9090:9090'],
        volumes: [
          './monitoring/prometheus.yml:/etc/prometheus/prometheus.yml',
          'prometheus_data:/prometheus'
        ],
        networks: ['app_network'],
        restart: 'unless-stopped'
      };

      services.grafana = {
        image: 'grafana/grafana:latest',
        ports: ['3001:3000'],
        environment: [
          'GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}'
        ],
        volumes: [
          'grafana_data:/var/lib/grafana',
          './monitoring/grafana:/etc/grafana/provisioning'
        ],
        networks: ['app_network'],
        restart: 'unless-stopped'
      };
    }

    return services;
  }

  formatDockerService(config) {
    const lines = [];
    
    for (const [key, value] of Object.entries(config)) {
      if (Array.isArray(value)) {
        lines.push(`    ${key}:`);
        value.forEach(item => lines.push(`      - ${item}`));
      } else if (typeof value === 'object') {
        lines.push(`    ${key}:`);
        for (const [subKey, subValue] of Object.entries(value)) {
          if (Array.isArray(subValue)) {
            lines.push(`      ${subKey}:`);
            subValue.forEach(item => lines.push(`        - ${item}`));
          } else if (typeof subValue === 'object') {
            lines.push(`      ${subKey}:`);
            for (const [subSubKey, subSubValue] of Object.entries(subValue)) {
              lines.push(`        ${subSubKey}: ${subSubValue}`);
            }
          } else {
            lines.push(`      ${subKey}: ${subValue}`);
          }
        }
      } else {
        lines.push(`    ${key}: ${value}`);
      }
    }
    
    return lines.join('\n');
  }

  generateDockerIgnore(data) {
    return `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Build output
dist/
build/

# Environment files
.env
.env.local
.env.development
.env.test
.env.production

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Git
.git/
.gitignore

# Docker
Dockerfile*
docker-compose*
.dockerignore

# Documentation
README.md
docs/

# Tests
tests/
**/*.test.js
**/*.spec.js

# Logs
logs/
*.log`;
  }

  generateGithubActions(data) {
    return `name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run linting
        run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: \${{ steps.image.outputs.image }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=\${{ github.ref_name }}-
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
      
      - name: Output image
        id: image
        run: echo "image=\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.ref_name }}-\${{ github.sha }}" >> \$GITHUB_OUTPUT

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to production
        run: |
          echo "Deploying \${{ needs.build.outputs.image }} to production"
          # Add your deployment commands here
          
      - name: Run health check
        run: |
          # Wait for deployment to be ready
          sleep 30
          curl -f \${{ secrets.PRODUCTION_URL }}/health || exit 1`;
  }

  generateNginxConfig(data) {
    return `# Nginx configuration for ${data.projectName}
upstream app_servers {
    least_conn;
    server app:${data.port || 3000} max_fails=3 fail_timeout=30s;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

# SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

server {
    listen 80;
    server_name ${data.domain || 'localhost'};
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${data.domain || 'localhost'};
    
    # SSL certificates
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;
    
    # Client max body size
    client_max_body_size 10M;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Rate limiting
    limit_req zone=api burst=20 nodelay;
    
    # API routes
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        
        proxy_pass http://app_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Authentication routes
    location /auth/ {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://app_servers;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check
    location /health {
        access_log off;
        proxy_pass http://app_servers;
    }
    
    # Static files
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        
        # Serve static files directly if available
        try_files $uri @app;
    }
    
    # All other routes
    location / {
        proxy_pass http://app_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Fallback to app
    location @app {
        proxy_pass http://app_servers;
    }
}`;
  }

  generatePM2Config(data) {
    return `module.exports = {
  apps: [{
    name: '${data.projectName}',
    script: './dist/server.js',
    instances: ${data.scaling?.replicas || 'max'},
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: ${data.port || 3000}
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: ${data.port || 3000}
    },
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Performance monitoring
    pmx: true,
    
    // Auto restart
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Graceful shutdown
    kill_timeout: 1600,
    listen_timeout: 3000,
    
    // Health monitoring
    health_check_grace_period: 3000,
    health_check_fatal_exceptions: true,
    
    // Environment variables
    env_file: '.env.production',
    
    // Advanced options
    node_args: '--max-old-space-size=1024',
    merge_logs: true,
    time: true
  }]
};`;
  }

  generateEnvTemplate(data) {
    const isExample = data.example;
    const envVars = {
      'NODE_ENV': 'production',
      'PORT': data.port || 3000,
      'DATABASE_URL': isExample ? 'postgresql://user:password@localhost:5432/dbname' : '${DATABASE_URL}',
      'REDIS_URL': isExample ? 'redis://localhost:6379' : '${REDIS_URL}',
      'JWT_SECRET': isExample ? 'your-jwt-secret-here' : '${JWT_SECRET}',
      'API_KEY': isExample ? 'your-api-key-here' : '${API_KEY}',
      'CORS_ORIGIN': isExample ? 'https://yourdomain.com' : '${CORS_ORIGIN}',
      'LOG_LEVEL': 'info',
      'PROMETHEUS_ENABLED': 'true',
      'METRICS_PORT': '9464'
    };

    return Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  generateHealthCheck(data) {
    return `const http = require('http');

const options = {
  hostname: 'localhost',
  port: ${data.port || 3000},
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();`;
  }

  generateDeployScript(data) {
    return `#!/bin/bash
set -e

echo "Starting deployment of ${data.projectName}..."

# Pull latest images
docker-compose pull

# Build and deploy
docker-compose up -d --build

# Wait for health check
echo "Waiting for application to be healthy..."
for i in {1..30}; do
  if curl -f http://localhost:${data.port || 3000}/health > /dev/null 2>&1; then
    echo "Application is healthy!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Health check failed after 30 attempts"
    exit 1
  fi
  sleep 2
done

echo "Deployment completed successfully!"`;
  }

  generateRollbackScript(data) {
    return `#!/bin/bash
set -e

echo "Starting rollback of ${data.projectName}..."

# Get previous image tag
PREVIOUS_TAG=$(docker images --format "table {{.Repository}}:{{.Tag}}" | grep ${data.projectName} | sed -n '2p' | cut -d':' -f2)

if [ -z "$PREVIOUS_TAG" ]; then
  echo "No previous version found for rollback"
  exit 1
fi

echo "Rolling back to version: $PREVIOUS_TAG"

# Update docker-compose to use previous version
sed -i "s/image: .*${data.projectName}.*/image: ${data.projectName}:$PREVIOUS_TAG/" docker-compose.yml

# Deploy previous version
docker-compose up -d

echo "Rollback completed successfully!"`;
  }

  generateBackupScript(data) {
    return `#!/bin/bash
set -e

BACKUP_DIR="/backups/\$(date +%Y%m%d_%H%M%S)"
mkdir -p \$BACKUP_DIR

echo "Starting backup..."

# Database backup
if [ "${data.database}" = "postgresql" ]; then
  docker-compose exec -T postgres pg_dump -U \$POSTGRES_USER \$POSTGRES_DB > \$BACKUP_DIR/database.sql
fi

# Redis backup
if [ "${data.cache}" = "redis" ]; then
  docker-compose exec -T redis redis-cli BGSAVE
  docker cp \$(docker-compose ps -q redis):/data/dump.rdb \$BACKUP_DIR/redis.rdb
fi

# Application data backup
docker-compose exec -T app tar -czf - /app/uploads > \$BACKUP_DIR/uploads.tar.gz

echo "Backup completed: \$BACKUP_DIR"`;
  }

  generatePrometheusConfig(data) {
    return `global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: '${data.projectName}'
    static_configs:
      - targets: ['app:9464']
    scrape_interval: 5s
    metrics_path: /metrics

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']`;
  }

  generateGrafanaConfig(data) {
    return JSON.stringify({
      "dashboard": {
        "id": null,
        "title": `${data.projectName} Dashboard`,
        "tags": ["generated"],
        "timezone": "browser",
        "panels": [
          {
            "title": "HTTP Request Rate",
            "type": "graph",
            "targets": [
              {
                "expr": `rate(http_requests_total{job="${data.projectName}"}[5m])`,
                "legendFormat": "{{method}} {{status}}"
              }
            ]
          },
          {
            "title": "Response Time",
            "type": "graph",
            "targets": [
              {
                "expr": `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${data.projectName}"}[5m]))`,
                "legendFormat": "95th percentile"
              }
            ]
          },
          {
            "title": "Error Rate",
            "type": "singlestat",
            "targets": [
              {
                "expr": `rate(http_requests_total{job="${data.projectName}",status=~"5.."}[5m])`,
                "legendFormat": "5xx errors"
              }
            ]
          }
        ],
        "time": {
          "from": "now-1h",
          "to": "now"
        },
        "refresh": "5s"
      }
    }, null, 2);
  }

  generateLoggingConfig(data) {
    return `const winston = require('winston');

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: '${data.projectName}' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};

module.exports = logger;`;
  }

  generateSecurityConfig(data) {
    return `const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// Rate limiting configuration
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false
});

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Helmet configuration
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
};

module.exports = {
  helmet: helmet(helmetOptions),
  cors: cors(corsOptions),
  rateLimits: {
    general: createRateLimit(15 * 60 * 1000, 100, 'Too many requests'),
    auth: createRateLimit(15 * 60 * 1000, 5, 'Too many auth attempts'),
    api: createRateLimit(15 * 60 * 1000, 1000, 'Too many API requests')
  }
};`;
  }

  generateHelmetConfig(data) {
    return this.generateSecurityConfig(data);
  }

  generateCorsConfig(data) {
    return this.generateSecurityConfig(data);
  }

  generateGitlabCI(data) {
    return `stages:
  - test
  - build
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"

before_script:
  - docker info

test:
  stage: test
  image: node:18
  script:
    - npm ci
    - npm run test
    - npm run lint
  coverage: '/Coverage: \\d+\\.\\d+%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker tag $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE:latest
    - echo $CI_REGISTRY_PASSWORD | docker login -u $CI_REGISTRY_USER --password-stdin $CI_REGISTRY
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker push $CI_REGISTRY_IMAGE:latest
  only:
    - main

deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache curl
  script:
    - echo "Deploying to production..."
    - curl -f $PRODUCTION_URL/health || exit 1
  environment:
    name: production
    url: $PRODUCTION_URL
  only:
    - main`;
  }

  generateJenkinsfile(data) {
    return `pipeline {
    agent any
    
    environment {
        DOCKER_IMAGE = "${data.projectName}"
        DOCKER_TAG = "\${BUILD_NUMBER}"
        REGISTRY = credentials('docker-registry')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Test') {
            steps {
                script {
                    sh 'npm ci'
                    sh 'npm run test'
                    sh 'npm run lint'
                }
            }
            post {
                always {
                    publishTestResults testResultsPattern: 'test-results.xml'
                    publishCoverage adapters: [
                        coberturaAdapter('coverage/cobertura-coverage.xml')
                    ]
                }
            }
        }
        
        stage('Build') {
            steps {
                script {
                    def image = docker.build("\${DOCKER_IMAGE}:\${DOCKER_TAG}")
                    docker.withRegistry('', 'docker-registry-credentials') {
                        image.push()
                        image.push('latest')
                    }
                }
            }
        }
        
        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                script {
                    sh '''
                        echo "Deploying to production..."
                        # Add deployment commands here
                        curl -f $PRODUCTION_URL/health || exit 1
                    '''
                }
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        success {
            echo 'Pipeline succeeded!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}`;
  }
}

module.exports = { ProductionGenerator };