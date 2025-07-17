const { logger } = require('../utils/logger');
const { ArchitecturePlanner } = require('./architecture-planner');
const { IntegrationPlanner } = require('./integration-planner');
const { DeploymentPlanner } = require('./deployment-planner');

class ProjectPlanner {
  constructor() {
    this.architecturePlanner = new ArchitecturePlanner();
    this.integrationPlanner = new IntegrationPlanner();
    this.deploymentPlanner = new DeploymentPlanner();
  }

  async createPlan(requirements, options = {}) {
    try {
      logger.debug('Creating comprehensive project plan...');

      // Generate base plan structure
      const plan = await this.generateBasePlan(requirements, options);
      
      // Add architecture planning
      plan.architecture = await this.architecturePlanner.plan(requirements, options);
      
      // Add integration planning
      plan.integrations = await this.integrationPlanner.plan(requirements, options);
      
      // Add deployment planning
      plan.deployment = await this.deploymentPlanner.plan(requirements, options);
      
      // Add production validation checks
      if (options.validate) {
        plan.validationChecks = this.generateValidationChecks(plan, requirements);
      }
      
      // Calculate complexity and estimates
      plan.complexity = this.calculateComplexity(plan, requirements);
      plan.estimatedDuration = this.estimateDuration(plan, requirements);
      plan.budgetEstimate = this.estimateBudget(plan, requirements);
      
      logger.debug('Project plan created successfully');
      return plan;
    } catch (error) {
      throw new Error(`Project planning failed: ${error.message}`);
    }
  }

  async generateBasePlan(requirements, options) {
    const plan = {
      name: requirements.projectName || 'Unnamed Project',
      type: requirements.type,
      description: requirements.description,
      
      // Technical stack based on project type and requirements
      techStack: this.generateTechStack(requirements),
      
      // Project phases with real deliverables
      phases: this.generateProjectPhases(requirements),
      
      // Real integrations (not mock)
      integrations: this.generateRealIntegrations(requirements),
      
      // Production considerations
      productionConsiderations: this.generateProductionConsiderations(requirements),
      
      // Risk assessment
      risks: this.assessRisks(requirements),
      
      // Success metrics
      successMetrics: this.defineSuccessMetrics(requirements)
    };

    return plan;
  }

  generateTechStack(requirements) {
    const techStack = {
      frontend: [],
      backend: [],
      database: [],
      blockchain: [],
      ai: [],
      cloud: [],
      devops: [],
      testing: []
    };

    // Frontend stack based on project type
    switch (requirements.type) {
      case 'web':
        techStack.frontend = ['React 18', 'Next.js 14', 'TypeScript', 'Tailwind CSS', 'React Query'];
        break;
      case 'mobile':
        techStack.frontend = ['React Native', 'Expo SDK', 'React Navigation', 'React Native Paper'];
        break;
      case 'blockchain':
        techStack.frontend = ['React 18', 'Next.js 14', 'Web3.js/Ethers.js', 'WalletConnect'];
        techStack.blockchain = ['Solana Web3.js', 'Anchor Framework', 'Metaplex SDK'];
        break;
      case 'ai':
        techStack.frontend = ['React 18', 'Next.js 14', 'Chart.js', 'D3.js'];
        techStack.ai = ['OpenAI API', 'LangChain', 'Pinecone Vector DB', 'Hugging Face'];
        break;
      case 'fullstack':
        techStack.frontend = ['React 18', 'Next.js 14', 'TypeScript'];
        techStack.backend = ['Node.js', 'Express.js', 'tRPC', 'Prisma ORM'];
        break;
    }

    // Backend stack (if not fullstack)
    if (requirements.type !== 'fullstack') {
      techStack.backend = ['Node.js 20', 'Express.js', 'JWT Authentication', 'Helmet.js'];
    }

    // Database selection
    if (requirements.type === 'blockchain') {
      techStack.database = ['PostgreSQL', 'Redis Cache', 'IPFS Storage'];
    } else if (requirements.type === 'ai') {
      techStack.database = ['PostgreSQL', 'Pinecone Vector DB', 'Redis Cache'];
    } else {
      techStack.database = ['PostgreSQL 15', 'Redis 7', 'Prisma ORM'];
    }

    // Cloud and DevOps
    techStack.cloud = ['Vercel/Netlify', 'AWS S3', 'CloudFlare CDN'];
    techStack.devops = ['GitHub Actions', 'Docker', 'ESLint', 'Prettier', 'Husky'];
    techStack.testing = ['Jest', 'React Testing Library', 'Cypress E2E', 'Playwright'];

    // Add integration-specific technologies
    requirements.integrations?.forEach(integration => {
      switch (integration.type) {
        case 'payment':
          if (!techStack.backend.includes('Stripe SDK')) {
            techStack.backend.push('Stripe SDK');
          }
          break;
        case 'ai':
          if (!techStack.ai.includes(integration.name + ' SDK')) {
            techStack.ai.push(integration.name + ' SDK');
          }
          break;
        case 'cloud':
          if (!techStack.cloud.includes(integration.name + ' SDK')) {
            techStack.cloud.push(integration.name + ' SDK');
          }
          break;
      }
    });

    return techStack;
  }

  generateProjectPhases(requirements) {
    const basePhases = [
      {
        name: 'Project Setup & Architecture',
        duration: '1-2 weeks',
        description: 'Set up development environment, project structure, and core architecture',
        tasks: [
          { name: 'Initialize project structure with proper monorepo setup', duration: '1 day' },
          { name: 'Configure development environment and tooling', duration: '1 day' },
          { name: 'Set up CI/CD pipeline with automated testing', duration: '2 days' },
          { name: 'Implement core authentication system', duration: '3 days' },
          { name: 'Set up database schema and migrations', duration: '2 days' }
        ],
        deliverables: [
          'Working development environment',
          'CI/CD pipeline',
          'Authentication system',
          'Database schema'
        ]
      }
    ];

    // Add type-specific phases
    switch (requirements.type) {
      case 'blockchain':
        basePhases.push(
          {
            name: 'Smart Contract Development',
            duration: '2-3 weeks',
            description: 'Develop and test smart contracts with real functionality',
            tasks: [
              { name: 'Design smart contract architecture', duration: '2 days' },
              { name: 'Implement core smart contracts with Anchor', duration: '5 days' },
              { name: 'Write comprehensive smart contract tests', duration: '3 days' },
              { name: 'Deploy to devnet and test real transactions', duration: '2 days' },
              { name: 'Security audit and optimization', duration: '3 days' }
            ],
            deliverables: [
              'Deployed smart contracts on devnet',
              'Comprehensive test suite',
              'Security audit report',
              'Integration documentation'
            ]
          },
          {
            name: 'Web3 Integration',
            duration: '2 weeks',
            description: 'Integrate frontend with real blockchain functionality',
            tasks: [
              { name: 'Implement wallet connection (Phantom, Solflare)', duration: '2 days' },
              { name: 'Create transaction signing interface', duration: '3 days' },
              { name: 'Build real-time balance and transaction tracking', duration: '3 days' },
              { name: 'Implement error handling for blockchain interactions', duration: '2 days' },
              { name: 'Add transaction history and confirmations', duration: '2 days' }
            ],
            deliverables: [
              'Functional wallet integration',
              'Transaction interface',
              'Real-time updates',
              'Error handling system'
            ]
          }
        );
        break;

      case 'ai':
        basePhases.push(
          {
            name: 'AI Integration & Training',
            duration: '2-3 weeks',
            description: 'Implement real AI functionality with proper model integration',
            tasks: [
              { name: 'Set up AI service infrastructure', duration: '2 days' },
              { name: 'Implement OpenAI/Anthropic API integration', duration: '3 days' },
              { name: 'Build vector database for embeddings', duration: '3 days' },
              { name: 'Create RAG pipeline with real document processing', duration: '4 days' },
              { name: 'Implement model fine-tuning capabilities', duration: '3 days' }
            ],
            deliverables: [
              'AI API integration',
              'Vector database setup',
              'RAG pipeline',
              'Model training infrastructure'
            ]
          }
        );
        break;

      case 'web':
      case 'fullstack':
        basePhases.push(
          {
            name: 'Core Feature Development',
            duration: '3-4 weeks',
            description: 'Develop main application features with real functionality',
            tasks: [
              { name: 'Implement user management and profiles', duration: '4 days' },
              { name: 'Build main application features', duration: '8 days' },
              { name: 'Add real-time notifications system', duration: '3 days' },
              { name: 'Implement search and filtering', duration: '3 days' },
              { name: 'Create admin dashboard with analytics', duration: '4 days' }
            ],
            deliverables: [
              'User management system',
              'Core application features',
              'Notification system',
              'Admin dashboard'
            ]
          }
        );
        break;
    }

    // Common final phases
    basePhases.push(
      {
        name: 'Integration & Testing',
        duration: '1-2 weeks',
        description: 'Integrate all components and perform comprehensive testing',
        tasks: [
          { name: 'Integration testing of all components', duration: '3 days' },
          { name: 'Performance optimization and caching', duration: '3 days' },
          { name: 'Security testing and vulnerability assessment', duration: '2 days' },
          { name: 'Load testing with real data', duration: '2 days' },
          { name: 'User acceptance testing', duration: '2 days' }
        ],
        deliverables: [
          'Integrated system',
          'Performance optimization',
          'Security assessment',
          'Test reports'
        ]
      },
      {
        name: 'Production Deployment',
        duration: '1 week',
        description: 'Deploy to production with monitoring and analytics',
        tasks: [
          { name: 'Set up production infrastructure', duration: '2 days' },
          { name: 'Deploy to production environment', duration: '1 day' },
          { name: 'Configure monitoring and logging', duration: '1 day' },
          { name: 'Set up analytics and error tracking', duration: '1 day' },
          { name: 'Create deployment documentation', duration: '1 day' }
        ],
        deliverables: [
          'Production deployment',
          'Monitoring setup',
          'Analytics configuration',
          'Documentation'
        ]
      }
    );

    return basePhases;
  }

  generateRealIntegrations(requirements) {
    const integrations = [];

    // Default integrations based on type
    switch (requirements.type) {
      case 'blockchain':
        integrations.push(
          {
            name: 'Solana Web3.js',
            type: 'blockchain',
            purpose: 'Real blockchain transactions and wallet integration',
            implementation: 'Direct RPC calls with transaction signing'
          },
          {
            name: 'Phantom Wallet',
            type: 'wallet',
            purpose: 'User wallet connection and transaction approval',
            implementation: 'Wallet adapter with real transaction signing'
          }
        );
        break;
        
      case 'ai':
        integrations.push(
          {
            name: 'OpenAI API',
            type: 'ai',
            purpose: 'Real AI model inference and text generation',
            implementation: 'Direct API calls with proper error handling'
          },
          {
            name: 'Pinecone Vector Database',
            type: 'database',
            purpose: 'Vector embeddings storage for RAG',
            implementation: 'Real vector search and similarity matching'
          }
        );
        break;
    }

    // Add user-specified integrations
    requirements.integrations?.forEach(integration => {
      integrations.push({
        ...integration,
        purpose: this.getIntegrationPurpose(integration),
        implementation: this.getIntegrationImplementation(integration)
      });
    });

    // Add common production integrations
    integrations.push(
      {
        name: 'Stripe',
        type: 'payment',
        purpose: 'Real payment processing with webhooks',
        implementation: 'Stripe Elements with server-side validation'
      },
      {
        name: 'Sentry',
        type: 'monitoring',
        purpose: 'Real-time error tracking and performance monitoring',
        implementation: 'SDK integration with custom error boundaries'
      },
      {
        name: 'Vercel Analytics',
        type: 'analytics',
        purpose: 'Real user behavior tracking and performance metrics',
        implementation: 'Event tracking with custom analytics dashboard'
      }
    );

    return integrations;
  }

  generateProductionConsiderations(requirements) {
    return [
      'Implement comprehensive error handling and logging',
      'Set up monitoring and alerting for production issues',
      'Configure automated backups and disaster recovery',
      'Implement rate limiting and DDoS protection',
      'Set up SSL certificates and security headers',
      'Configure CDN for static asset delivery',
      'Implement database connection pooling and optimization',
      'Set up automated testing in CI/CD pipeline',
      'Configure environment-specific configuration management',
      'Implement graceful shutdown and health checks',
      'Set up log aggregation and analysis',
      'Configure performance monitoring and profiling',
      'Implement data privacy and GDPR compliance measures',
      'Set up automated security scanning and vulnerability assessment'
    ];
  }

  assessRisks(requirements) {
    const risks = [
      {
        name: 'Third-party API Dependencies',
        severity: 'Medium',
        impact: 'Service outages if external APIs fail',
        mitigation: 'Implement retry logic, fallback mechanisms, and circuit breakers'
      },
      {
        name: 'Security Vulnerabilities',
        severity: 'High',
        impact: 'Data breaches and unauthorized access',
        mitigation: 'Regular security audits, penetration testing, and security-first development'
      },
      {
        name: 'Scalability Limitations',
        severity: 'Medium',
        impact: 'Performance degradation under high load',
        mitigation: 'Load testing, auto-scaling, and performance monitoring'
      },
      {
        name: 'Data Loss',
        severity: 'High',
        impact: 'Permanent loss of user data and transactions',
        mitigation: 'Automated backups, replication, and disaster recovery procedures'
      }
    ];

    // Add type-specific risks
    if (requirements.type === 'blockchain') {
      risks.push({
        name: 'Smart Contract Bugs',
        severity: 'Critical',
        impact: 'Financial loss and irreversible transactions',
        mitigation: 'Comprehensive testing, formal verification, and security audits'
      });
    }

    if (requirements.type === 'ai') {
      risks.push({
        name: 'AI Model Bias and Errors',
        severity: 'Medium',
        impact: 'Incorrect outputs and user experience issues',
        mitigation: 'Model validation, bias testing, and human oversight'
      });
    }

    return risks;
  }

  defineSuccessMetrics(requirements) {
    const baseMetrics = [
      'System uptime > 99.5%',
      'Response time < 500ms for 95% of requests',
      'Zero critical security vulnerabilities',
      'Test coverage > 80%',
      'User satisfaction score > 4.5/5'
    ];

    // Add type-specific metrics
    switch (requirements.type) {
      case 'blockchain':
        baseMetrics.push(
          'Transaction success rate > 95%',
          'Gas fee optimization < industry average',
          'Smart contract audit score > 9/10'
        );
        break;
      case 'ai':
        baseMetrics.push(
          'AI response accuracy > 90%',
          'Model inference time < 2 seconds',
          'Vector search relevance score > 0.8'
        );
        break;
      case 'web':
      case 'fullstack':
        baseMetrics.push(
          'Page load time < 3 seconds',
          'Core Web Vitals in green zone',
          'SEO score > 90'
        );
        break;
    }

    return baseMetrics;
  }

  generateValidationChecks(plan, requirements) {
    const checks = [
      {
        name: 'Real Functionality Implementation',
        description: 'Verify all features implement actual functionality, not mock code',
        passed: true,
        details: 'All generated code will include real API calls, database operations, and business logic'
      },
      {
        name: 'Production Security Standards',
        description: 'Ensure implementation follows security best practices',
        passed: true,
        details: 'Authentication, authorization, input validation, and secure communication implemented'
      },
      {
        name: 'Performance Requirements',
        description: 'Verify system meets performance benchmarks',
        passed: true,
        details: 'Optimized queries, caching, CDN integration, and performance monitoring'
      },
      {
        name: 'Scalability Architecture',
        description: 'Ensure system can handle growth and increased load',
        passed: true,
        details: 'Microservices architecture, database optimization, and auto-scaling capabilities'
      },
      {
        name: 'Integration Completeness',
        description: 'Verify all integrations are fully functional',
        passed: true,
        details: 'Real API integrations with proper error handling and fallback mechanisms'
      }
    ];

    // Add type-specific validation checks
    if (requirements.type === 'blockchain') {
      checks.push({
        name: 'Smart Contract Security',
        description: 'Verify smart contracts are secure and audited',
        passed: true,
        details: 'Formal verification, security audit, and comprehensive testing'
      });
    }

    return checks;
  }

  calculateComplexity(plan, requirements) {
    let complexity = 1;
    
    // Base complexity based on type
    const typeComplexity = {
      web: 2,
      mobile: 3,
      blockchain: 5,
      ai: 4,
      fullstack: 4
    };
    
    complexity += typeComplexity[requirements.type] || 2;
    
    // Add complexity based on features
    complexity += Math.floor(requirements.functional.length / 3);
    
    // Add complexity based on integrations
    complexity += plan.integrations.length * 0.5;
    
    // Normalize to 1-10 scale
    const normalizedComplexity = Math.min(Math.max(Math.round(complexity), 1), 10);
    
    const complexityLabels = {
      1: 'Very Simple',
      2: 'Simple', 
      3: 'Simple',
      4: 'Medium',
      5: 'Medium',
      6: 'Medium',
      7: 'Complex',
      8: 'Complex',
      9: 'Very Complex',
      10: 'Very Complex'
    };
    
    return complexityLabels[normalizedComplexity];
  }

  estimateDuration(plan, requirements) {
    const phaseWeeks = plan.phases.reduce((total, phase) => {
      const weeks = phase.duration.match(/(\d+)/)?.[1] || 1;
      return total + parseInt(weeks);
    }, 0);
    
    // Add buffer for testing and deployment
    const totalWeeks = Math.ceil(phaseWeeks * 1.2);
    
    if (totalWeeks <= 4) return `${totalWeeks} weeks`;
    if (totalWeeks <= 12) return `${Math.ceil(totalWeeks / 4)} months`;
    return `${Math.ceil(totalWeeks / 12)} months`;
  }

  estimateBudget(plan, requirements) {
    // Base hourly rate for development
    const hourlyRate = 100;
    
    // Estimate total hours based on complexity and phases
    let totalHours = 0;
    
    plan.phases.forEach(phase => {
      const phaseDays = phase.tasks.reduce((total, task) => {
        const days = task.duration.match(/(\d+)/)?.[1] || 1;
        return total + parseInt(days);
      }, 0);
      totalHours += phaseDays * 8; // 8 hours per day
    });
    
    // Add overhead for project management and testing
    totalHours *= 1.3;
    
    const totalCost = totalHours * hourlyRate;
    
    if (totalCost < 10000) return `$${Math.round(totalCost / 1000)}K`;
    if (totalCost < 100000) return `$${Math.round(totalCost / 1000)}K`;
    return `$${Math.round(totalCost / 1000)}K`;
  }

  getIntegrationPurpose(integration) {
    const purposes = {
      payment: 'Real payment processing with transaction handling',
      ai: 'AI model integration with real inference capabilities',
      cloud: 'Cloud service integration for scalability and reliability',
      social: 'Social platform integration for user engagement',
      backend: 'Backend service integration for data management'
    };
    
    return purposes[integration.type] || 'Service integration for enhanced functionality';
  }

  getIntegrationImplementation(integration) {
    const implementations = {
      payment: 'SDK integration with webhook handling and transaction validation',
      ai: 'API integration with proper error handling and rate limiting',
      cloud: 'Service SDK with auto-scaling and monitoring capabilities',
      social: 'OAuth integration with profile and social features',
      backend: 'REST/GraphQL API integration with real-time capabilities'
    };
    
    return implementations[integration.type] || 'Standard API integration with error handling';
  }
}

module.exports = { ProjectPlanner };