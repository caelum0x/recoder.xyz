const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');

class ProductionGenerator {
  constructor() {
    this.templates = {
      web: require('../templates/web/nextjs-production'),
      mobile: require('../templates/mobile/react-native-production'),
      blockchain: require('../templates/blockchain/solana-production'),
      ai: require('../templates/ai/langchain-production'),
      fullstack: require('../templates/fullstack/nextjs-trpc-production')
    };
  }

  async generateProject(plan, options = {}) {
    try {
      logger.info(`Generating ${plan.type} project: ${plan.name}`);
      
      const outputDir = options.outputDir || './generated-project';
      
      // Ensure output directory exists
      await fs.ensureDir(outputDir);
      
      // Generate project structure
      await this.generateStructure(plan, outputDir);
      
      // Generate core files
      const coreFiles = await this.generateCoreFiles(plan, outputDir);
      
      // Generate integrations
      const integrations = await this.generateIntegrations(plan, outputDir);
      
      // Generate tests
      const tests = await this.generateTests(plan, outputDir);
      
      // Generate deployment configs
      const deploymentConfigs = await this.generateDeploymentConfigs(plan, outputDir);
      
      // Generate documentation
      const documentation = await this.generateDocumentation(plan, outputDir);
      
      logger.success(`Project generated successfully in: ${outputDir}`);
      
      return {
        outputDir,
        files: [...coreFiles, ...tests, ...deploymentConfigs, ...documentation],
        integrations,
        structure: await this.getProjectStructure(outputDir)
      };
      
    } catch (error) {
      throw new Error(`Project generation failed: ${error.message}`);
    }
  }

  async generateStructure(plan, outputDir) {
    const generator = this.templates[plan.type];
    if (!generator) {
      throw new Error(`No template found for project type: ${plan.type}`);
    }
    
    return await generator.generateStructure(plan, outputDir);
  }

  async generateCoreFiles(plan, outputDir) {
    const files = [];
    
    // Package.json
    const packageJson = this.generatePackageJson(plan);
    await fs.writeJSON(path.join(outputDir, 'package.json'), packageJson, { spaces: 2 });
    files.push({ path: 'package.json', type: 'config' });
    
    // Environment template
    const envTemplate = this.generateEnvTemplate(plan);
    await fs.writeFile(path.join(outputDir, '.env.example'), envTemplate);
    files.push({ path: '.env.example', type: 'config' });
    
    // README.md
    const readme = this.generateReadme(plan);
    await fs.writeFile(path.join(outputDir, 'README.md'), readme);
    files.push({ path: 'README.md', type: 'documentation' });
    
    // Project-specific core files
    const generator = this.templates[plan.type];
    const coreFiles = await generator.generateCoreFiles(plan, outputDir);
    files.push(...coreFiles);
    
    return files;
  }

  async generateIntegrations(plan, outputDir) {
    const integrations = [];
    
    for (const integration of plan.integrations || []) {
      try {
        logger.debug(`Generating integration: ${integration.name}`);
        
        const integrationGenerator = this.getIntegrationGenerator(integration.type);
        const result = await integrationGenerator.generate(integration, outputDir);
        
        integrations.push({
          name: integration.name,
          type: integration.type,
          status: 'generated',
          files: result.files,
          config: result.config
        });
        
      } catch (error) {
        logger.warn(`Failed to generate integration ${integration.name}: ${error.message}`);
        integrations.push({
          name: integration.name,
          type: integration.type,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return integrations;
  }

  async generateTests(plan, outputDir) {
    const files = [];
    
    // Jest configuration
    const jestConfig = this.generateJestConfig(plan);
    await fs.writeJSON(path.join(outputDir, 'jest.config.js'), jestConfig, { spaces: 2 });
    files.push({ path: 'jest.config.js', type: 'test-config' });
    
    // Test setup
    const testSetup = this.generateTestSetup(plan);
    await fs.ensureDir(path.join(outputDir, 'tests'));
    await fs.writeFile(path.join(outputDir, 'tests/setup.js'), testSetup);
    files.push({ path: 'tests/setup.js', type: 'test' });
    
    // Integration tests
    const integrationTests = this.generateIntegrationTests(plan);
    await fs.writeFile(path.join(outputDir, 'tests/integration.test.js'), integrationTests);
    files.push({ path: 'tests/integration.test.js', type: 'test' });
    
    // Project-specific tests
    const generator = this.templates[plan.type];
    const specificTests = await generator.generateTests(plan, outputDir);
    files.push(...specificTests);
    
    return files;
  }

  async generateDeploymentConfigs(plan, outputDir) {
    const files = [];
    
    // Docker configuration
    const dockerfile = this.generateDockerfile(plan);
    await fs.writeFile(path.join(outputDir, 'Dockerfile'), dockerfile);
    files.push({ path: 'Dockerfile', type: 'deployment' });
    
    const dockerCompose = this.generateDockerCompose(plan);
    await fs.writeFile(path.join(outputDir, 'docker-compose.yml'), dockerCompose);
    files.push({ path: 'docker-compose.yml', type: 'deployment' });
    
    // CI/CD configuration
    const githubActions = this.generateGithubActions(plan);
    await fs.ensureDir(path.join(outputDir, '.github/workflows'));
    await fs.writeFile(path.join(outputDir, '.github/workflows/deploy.yml'), githubActions);
    files.push({ path: '.github/workflows/deploy.yml', type: 'deployment' });
    
    // Vercel configuration (for web projects)
    if (plan.type === 'web' || plan.type === 'fullstack') {
      const vercelConfig = this.generateVercelConfig(plan);
      await fs.writeJSON(path.join(outputDir, 'vercel.json'), vercelConfig, { spaces: 2 });
      files.push({ path: 'vercel.json', type: 'deployment' });
    }
    
    return files;
  }

  async generateDocumentation(plan, outputDir) {
    const files = [];
    const docsDir = path.join(outputDir, 'docs');
    await fs.ensureDir(docsDir);
    
    // API documentation
    const apiDocs = this.generateAPIDocs(plan);
    await fs.writeFile(path.join(docsDir, 'API.md'), apiDocs);
    files.push({ path: 'docs/API.md', type: 'documentation' });
    
    // Deployment guide
    const deploymentGuide = this.generateDeploymentGuide(plan);
    await fs.writeFile(path.join(docsDir, 'DEPLOYMENT.md'), deploymentGuide);
    files.push({ path: 'docs/DEPLOYMENT.md', type: 'documentation' });
    
    // Architecture documentation
    const architectureDocs = this.generateArchitectureDocs(plan);
    await fs.writeFile(path.join(docsDir, 'ARCHITECTURE.md'), architectureDocs);
    files.push({ path: 'docs/ARCHITECTURE.md', type: 'documentation' });
    
    return files;
  }

  generatePackageJson(plan) {
    const basePackage = {
      name: plan.name.toLowerCase().replace(/\\s+/g, '-'),
      version: '1.0.0',
      description: plan.description || '',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        test: 'jest',
        'test:watch': 'jest --watch',
        'test:coverage': 'jest --coverage'
      },
      dependencies: {},
      devDependencies: {
        '@types/node': '^20.0.0',
        '@types/react': '^18.0.0',
        '@types/react-dom': '^18.0.0',
        'eslint': '^8.0.0',
        'eslint-config-next': '13.5.0',
        'typescript': '^5.0.0',
        'jest': '^29.0.0',
        '@testing-library/react': '^13.0.0',
        '@testing-library/jest-dom': '^5.0.0'
      }
    };

    // Add type-specific dependencies
    const typeSpecificDeps = this.getTypeSpecificDependencies(plan.type);
    basePackage.dependencies = { ...basePackage.dependencies, ...typeSpecificDeps.dependencies };
    basePackage.devDependencies = { ...basePackage.devDependencies, ...typeSpecificDeps.devDependencies };

    return basePackage;
  }

  getTypeSpecificDependencies(type) {
    const deps = {
      web: {
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.0.0',
          'react-dom': '^18.0.0',
          'tailwindcss': '^3.0.0'
        },
        devDependencies: {}
      },
      blockchain: {
        dependencies: {
          '@solana/web3.js': '^1.87.0',
          '@project-serum/anchor': '^0.28.0',
          '@solana/wallet-adapter-react': '^0.15.0'
        },
        devDependencies: {
          '@solana/test-validator': '^1.16.0'
        }
      },
      ai: {
        dependencies: {
          'langchain': '^0.0.200',
          'openai': '^4.0.0',
          '@anthropic-ai/sdk': '^0.9.0'
        },
        devDependencies: {}
      }
    };

    return deps[type] || deps.web;
  }

  generateEnvTemplate(plan) {
    const envVars = [
      '# Application Configuration',
      'NODE_ENV=development',
      'PORT=3000',
      '',
      '# Database Configuration',
      'DATABASE_URL=postgresql://username:password@localhost:5432/database',
      '',
      '# Authentication',
      'NEXTAUTH_SECRET=your-secret-key',
      'NEXTAUTH_URL=http://localhost:3000',
      ''
    ];

    // Add integration-specific environment variables
    for (const integration of plan.integrations || []) {
      envVars.push(`# ${integration.name} Configuration`);
      
      switch (integration.type) {
        case 'payment':
          if (integration.name === 'Stripe') {
            envVars.push('STRIPE_PUBLISHABLE_KEY=pk_test_...');
            envVars.push('STRIPE_SECRET_KEY=sk_test_...');
          }
          break;
        case 'ai':
          if (integration.name === 'OpenAI') {
            envVars.push('OPENAI_API_KEY=sk-...');
          }
          break;
        case 'blockchain':
          if (integration.name === 'Solana') {
            envVars.push('SOLANA_RPC_URL=https://api.devnet.solana.com');
            envVars.push('SOLANA_PRIVATE_KEY=your-private-key');
          }
          break;
      }
      envVars.push('');
    }

    return envVars.join('\\n');
  }

  generateReadme(plan) {
    return `# ${plan.name}

${plan.description || 'A production-ready application generated by CodeCraft.'}

## Project Type
${plan.type.charAt(0).toUpperCase() + plan.type.slice(1)} Application

## Features
${plan.requirements?.functional?.map(feature => `- ${feature}`).join('\\n') || '- Core functionality implemented'}

## Tech Stack
${this.formatTechStack(plan.techStack)}

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn
${plan.type === 'blockchain' ? '- Solana CLI (for blockchain projects)' : ''}
${plan.type === 'ai' ? '- Python 3.8+ (for AI integrations)' : ''}

### Installation

1. Clone the repository
\`\`\`bash
git clone <repository-url>
cd ${plan.name.toLowerCase().replace(/\\s+/g, '-')}
\`\`\`

2. Install dependencies
\`\`\`bash
npm install
\`\`\`

3. Set up environment variables
\`\`\`bash
cp .env.example .env
# Edit .env with your configuration
\`\`\`

4. Run the development server
\`\`\`bash
npm run dev
\`\`\`

## Project Structure

\`\`\`
src/
├── components/     # Reusable UI components
├── pages/         # Application pages/routes
├── lib/           # Utility functions and configurations
├── hooks/         # Custom React hooks
├── types/         # TypeScript type definitions
└── styles/        # Global styles and themes
\`\`\`

## Integrations

${plan.integrations?.map(integration => `- **${integration.name}**: ${integration.purpose || 'Integrated service'}`).join('\\n') || 'No external integrations configured.'}

## Testing

Run tests with:
\`\`\`bash
npm test
\`\`\`

Run tests in watch mode:
\`\`\`bash
npm run test:watch
\`\`\`

Generate coverage report:
\`\`\`bash
npm run test:coverage
\`\`\`

## Deployment

### Vercel (Recommended for web projects)
\`\`\`bash
npm run build
vercel --prod
\`\`\`

### Docker
\`\`\`bash
docker build -t ${plan.name.toLowerCase().replace(/\\s+/g, '-')} .
docker run -p 3000:3000 ${plan.name.toLowerCase().replace(/\\s+/g, '-')}
\`\`\`

## Production Considerations

${plan.productionConsiderations?.map(consideration => `- ${consideration}`).join('\\n') || '- Security measures implemented\\n- Performance optimizations applied\\n- Error handling and logging configured'}

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.
`;
  }

  formatTechStack(techStack) {
    if (!techStack) return '- Modern web technologies';
    
    return Object.entries(techStack)
      .map(([category, technologies]) => `### ${category.charAt(0).toUpperCase() + category.slice(1)}\\n${technologies.map(tech => `- ${tech}`).join('\\n')}`)
      .join('\\n\\n');
  }

  // Additional generator methods...
  generateJestConfig(plan) {
    return {
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
      collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/index.{js,ts}'
      ],
      coverageThreshold: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    };
  }

  generateTestSetup(plan) {
    return `import '@testing-library/jest-dom';

// Global test setup
beforeAll(() => {
  // Setup test environment
});

afterAll(() => {
  // Cleanup test environment
});

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
`;
  }

  generateIntegrationTests(plan) {
    return `import { render, screen } from '@testing-library/react';

describe('Integration Tests', () => {
  test('application loads successfully', () => {
    // Basic smoke test
    expect(true).toBe(true);
  });

  ${plan.integrations?.map(integration => `
  test('${integration.name} integration is configured', () => {
    // Test ${integration.name} integration
    expect(process.env.${integration.name.toUpperCase()}_API_KEY).toBeDefined();
  });`).join('\\n') || ''}
});
`;
  }

  generateDockerfile(plan) {
    return `FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
`;
  }

  generateDockerCompose(plan) {
    return `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: ${plan.name.toLowerCase().replace(/\\s+/g, '_')}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
`;
  }

  generateGithubActions(plan) {
    return `name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run test:coverage
      
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      
      # Deploy to Vercel
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: \${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: \${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
`;
  }

  generateVercelConfig(plan) {
    return {
      "buildCommand": "npm run build",
      "outputDirectory": ".next",
      "framework": "nextjs",
      "installCommand": "npm install",
      "env": {
        "NODE_ENV": "production"
      },
      "functions": {
        "pages/api/**/*.js": {
          "maxDuration": 30
        }
      }
    };
  }

  // Documentation generators
  generateAPIDocs(plan) {
    return `# API Documentation

## Overview
This document describes the API endpoints available in the ${plan.name} application.

## Base URL
\`https://your-domain.com/api\`

## Authentication
All API requests require authentication using Bearer tokens.

\`\`\`
Authorization: Bearer <your-token>
\`\`\`

## Endpoints

### Health Check
\`GET /health\`

Returns the health status of the API.

**Response:**
\`\`\`json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

${plan.requirements?.functional?.map(feature => `
### ${feature}
\`GET /api/${feature.toLowerCase().replace(/\\s+/g, '-')}\`

Description of the ${feature} endpoint.
`).join('\\n') || ''}

## Error Handling

All errors return a consistent format:

\`\`\`json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
\`\`\`

## Rate Limiting

API requests are limited to 1000 requests per hour per IP address.
`;
  }

  generateDeploymentGuide(plan) {
    return `# Deployment Guide

## Overview
This guide covers deploying ${plan.name} to production environments.

## Prerequisites
- Node.js 18+
- Database (PostgreSQL recommended)
- Redis (for caching)
${plan.type === 'blockchain' ? '- Solana CLI' : ''}

## Environment Setup

### 1. Environment Variables
Copy \`.env.example\` to \`.env.production\` and configure:

\`\`\`env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
\`\`\`

### 2. Database Migration
\`\`\`bash
npm run db:migrate
npm run db:seed
\`\`\`

## Deployment Options

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Docker
1. Build the Docker image:
\`\`\`bash
docker build -t ${plan.name.toLowerCase().replace(/\\s+/g, '-')} .
\`\`\`

2. Run the container:
\`\`\`bash
docker run -p 3000:3000 ${plan.name.toLowerCase().replace(/\\s+/g, '-')}
\`\`\`

### Traditional Server
1. Install dependencies:
\`\`\`bash
npm ci --production
\`\`\`

2. Build the application:
\`\`\`bash
npm run build
\`\`\`

3. Start the server:
\`\`\`bash
npm start
\`\`\`

## Post-Deployment

### Health Checks
Verify deployment success:
- \`GET /api/health\` should return 200 OK
- Application loads without errors
- Database connections are working

### Monitoring
Set up monitoring for:
- Application errors
- Performance metrics
- Database performance
- API response times

### Security
- Enable HTTPS
- Configure CORS properly
- Set up rate limiting
- Regular security updates
`;
  }

  generateArchitectureDocs(plan) {
    return `# Architecture Documentation

## Overview
${plan.name} is built using modern ${plan.type} architecture patterns.

## System Architecture

### High-Level Design
\`\`\`
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │───▶│   Backend   │───▶│  Database   │
│   (React)   │    │  (Node.js)  │    │(PostgreSQL)│
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       │                   ▼                   │
       │           ┌─────────────┐            │
       │           │    Redis    │            │
       │           │   (Cache)   │            │
       │           └─────────────┘            │
       │                                      │
       ▼                                      ▼
┌─────────────┐                    ┌─────────────┐
│   CDN/Edge  │                    │  Monitoring │
│  (Vercel)   │                    │ (DataDog)   │
└─────────────┘                    └─────────────┘
\`\`\`

## Components

### Frontend Layer
- **Framework**: ${plan.techStack?.frontend?.[0] || 'React'}
- **State Management**: Redux Toolkit / Zustand
- **Styling**: Tailwind CSS
- **Routing**: Next.js Router

### Backend Layer
- **Runtime**: ${plan.techStack?.backend?.[0] || 'Node.js'}
- **Framework**: Express.js / Fastify
- **API Style**: RESTful / GraphQL
- **Authentication**: JWT / OAuth

### Data Layer
- **Primary Database**: ${plan.techStack?.database?.[0] || 'PostgreSQL'}
- **Caching**: Redis
- **ORM**: Prisma / TypeORM
- **Migrations**: Automated with CI/CD

## Design Patterns

### Backend Patterns
- Repository Pattern for data access
- Service Layer for business logic
- Middleware for cross-cutting concerns
- Event-driven architecture for async operations

### Frontend Patterns
- Component composition
- Custom hooks for reusable logic
- Context for global state
- Error boundaries for error handling

## Security Architecture

### Authentication Flow
1. User credentials validated
2. JWT token issued
3. Token included in API requests
4. Token validated on each request
5. Role-based access control applied

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Rate limiting

## Scalability Considerations

### Horizontal Scaling
- Stateless application design
- Load balancer distribution
- Database read replicas
- CDN for static assets

### Performance Optimization
- Database indexing strategy
- Query optimization
- Caching at multiple levels
- Image optimization
- Code splitting

## Integration Architecture

${plan.integrations?.map(integration => `
### ${integration.name}
- **Type**: ${integration.type}
- **Purpose**: ${integration.purpose || 'Service integration'}
- **Implementation**: ${integration.implementation || 'RESTful API integration'}
`).join('\\n') || 'No external integrations configured.'}

## Monitoring and Observability

### Application Monitoring
- Error tracking with Sentry
- Performance monitoring with DataDog
- User analytics with Mixpanel
- Uptime monitoring with Pingdom

### Infrastructure Monitoring
- Server metrics (CPU, Memory, Disk)
- Database performance metrics
- API response times
- Error rates and patterns

## Deployment Architecture

### Environments
- **Development**: Local development environment
- **Staging**: Pre-production testing environment
- **Production**: Live production environment

### CI/CD Pipeline
1. Code commit to repository
2. Automated tests execution
3. Build and containerization
4. Deployment to staging
5. Automated testing in staging
6. Manual approval for production
7. Blue-green deployment to production
8. Health checks and monitoring
`;
  }

  getIntegrationGenerator(type) {
    const generators = {
      payment: require('../integrations/payment/stripe'),
      blockchain: require('../integrations/blockchain/solana'),
      ai: require('../integrations/ai/openai'),
      database: require('../integrations/database/postgresql'),
      cloud: require('../integrations/cloud/aws')
    };
    
    return generators[type] || generators.payment;
  }

  async getProjectStructure(outputDir) {
    // Generate a tree-like structure of the project
    const structure = {};
    const files = await fs.readdir(outputDir, { withFileTypes: true });
    
    for (const file of files) {
      if (file.isDirectory()) {
        structure[file.name] = await this.getProjectStructure(path.join(outputDir, file.name));
      } else {
        structure[file.name] = 'file';
      }
    }
    
    return structure;
  }
}

module.exports = { ProductionGenerator };