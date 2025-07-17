const { RequirementAnalyzer } = require('../analyzers/requirement-analyzer');
const { DependencyAnalyzer } = require('../analyzers/dependency-analyzer');
const { IntegrationAnalyzer } = require('../analyzers/integration-analyzer');
const { SecurityAnalyzer } = require('../analyzers/security-analyzer');

class ProjectPlanner {
  constructor() {
    this.requirementAnalyzer = new RequirementAnalyzer();
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.integrationAnalyzer = new IntegrationAnalyzer();
    this.securityAnalyzer = new SecurityAnalyzer();
  }

  async createComprehensivePlan(description, options = {}) {
    try {
      // Phase 1: Requirement Analysis
      const requirements = await this.requirementAnalyzer.analyze(description, options);
      
      // Phase 2: Dependency Analysis
      const dependencies = await this.dependencyAnalyzer.analyze(requirements);
      
      // Phase 3: Integration Analysis
      const integrations = await this.integrationAnalyzer.analyze(requirements, dependencies);
      
      // Phase 4: Security Analysis
      const security = await this.securityAnalyzer.analyze(requirements, integrations);
      
      // Phase 5: Create comprehensive plan
      const plan = await this.synthesizePlan({
        requirements,
        dependencies,
        integrations,
        security,
        options
      });

      return plan;
    } catch (error) {
      throw new Error(`Planning failed: ${error.message}`);
    }
  }

  async synthesizePlan({ requirements, dependencies, integrations, security, options }) {
    const projectType = options.type || this.detectProjectType(requirements);
    const complexity = this.calculateComplexity(requirements, dependencies, integrations);
    
    return {
      id: this.generatePlanId(),
      name: requirements.projectName || 'Untitled Project',
      type: projectType,
      complexity,
      estimatedDuration: this.estimateDuration(complexity, requirements),
      budgetEstimate: this.estimateBudget(complexity, integrations),
      
      // Core components
      requirements: {
        functional: requirements.functional,
        nonFunctional: requirements.nonFunctional,
        technical: requirements.technical
      },
      
      techStack: this.selectTechStack(projectType, requirements, dependencies),
      architecture: this.designArchitecture(projectType, requirements, integrations),
      
      // Implementation phases
      phases: this.createImplementationPhases(requirements, integrations, complexity),
      
      // Production considerations
      integrations: this.planIntegrations(integrations),
      security: this.planSecurity(security),
      testing: this.planTesting(requirements, integrations),
      deployment: this.planDeployment(projectType, requirements),
      monitoring: this.planMonitoring(requirements, integrations),
      
      // Risk management
      risks: this.assessRisks(requirements, integrations, complexity),
      mitigations: this.planMitigations(requirements, integrations),
      
      // Validation criteria
      validationChecks: this.defineValidationChecks(requirements, integrations),
      productionReadiness: this.defineProductionCriteria(requirements, security)
    };
  }

  detectProjectType(requirements) {
    const keywords = requirements.description?.toLowerCase() || '';
    
    if (keywords.includes('blockchain') || keywords.includes('smart contract') || keywords.includes('defi')) {
      return 'blockchain';
    }
    if (keywords.includes('mobile') || keywords.includes('react native') || keywords.includes('flutter')) {
      return 'mobile';
    }
    if (keywords.includes('ai') || keywords.includes('machine learning') || keywords.includes('nlp')) {
      return 'ai';
    }
    if (keywords.includes('api') && keywords.includes('frontend')) {
      return 'fullstack';
    }
    
    return 'web';
  }

  calculateComplexity(requirements, dependencies, integrations) {
    let score = 0;
    
    // Requirements complexity
    score += requirements.functional?.length * 2 || 0;
    score += requirements.nonFunctional?.length * 3 || 0;
    
    // Dependencies complexity
    score += dependencies.external?.length * 1 || 0;
    score += dependencies.internal?.length * 2 || 0;
    
    // Integrations complexity
    score += integrations.thirdParty?.length * 3 || 0;
    score += integrations.realTime?.length * 4 || 0;
    
    if (score < 20) return 'simple';
    if (score < 50) return 'medium';
    if (score < 100) return 'complex';
    return 'enterprise';
  }

  selectTechStack(type, requirements, dependencies) {
    const stacks = {
      web: {
        frontend: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
        backend: ['Node.js', 'Express', 'PostgreSQL', 'Redis'],
        deployment: ['Vercel', 'Railway', 'Docker']
      },
      mobile: {
        framework: ['React Native', 'Expo'],
        state: ['Redux Toolkit', 'React Query'],
        navigation: ['React Navigation'],
        deployment: ['App Store', 'Google Play']
      },
      blockchain: {
        blockchain: ['Solana', 'Ethereum', 'Polygon'],
        framework: ['Anchor', 'Hardhat', 'Web3.js'],
        frontend: ['Next.js', 'React', 'Web3 Modal'],
        testing: ['Mocha', 'Chai', 'Solana Test Validator']
      },
      ai: {
        framework: ['LangChain', 'OpenAI', 'Hugging Face'],
        backend: ['Python', 'FastAPI', 'PostgreSQL'],
        processing: ['NumPy', 'Pandas', 'PyTorch'],
        deployment: ['Docker', 'AWS', 'Modal']
      },
      fullstack: {
        frontend: ['React', 'Next.js', 'TypeScript'],
        backend: ['Node.js', 'tRPC', 'Prisma'],
        database: ['PostgreSQL', 'Redis'],
        auth: ['NextAuth.js', 'Clerk'],
        deployment: ['Vercel', 'PlanetScale', 'Docker']
      }
    };

    return stacks[type] || stacks.web;
  }

  createImplementationPhases(requirements, integrations, complexity) {
    const phases = [
      {
        name: 'Project Setup & Foundation',
        duration: complexity === 'simple' ? '1-2 days' : complexity === 'medium' ? '3-5 days' : '1-2 weeks',
        description: 'Set up project structure, development environment, and core dependencies',
        tasks: [
          { name: 'Initialize project structure', duration: '1 day', priority: 'high' },
          { name: 'Set up development environment', duration: '1 day', priority: 'high' },
          { name: 'Configure build tools and linting', duration: '0.5 days', priority: 'medium' },
          { name: 'Set up version control and CI/CD', duration: '1 day', priority: 'medium' }
        ],
        deliverables: ['Project scaffolding', 'Development environment', 'CI/CD pipeline']
      },
      {
        name: 'Core Feature Development',
        duration: complexity === 'simple' ? '1-2 weeks' : complexity === 'medium' ? '3-6 weeks' : '2-3 months',
        description: 'Implement main application features and functionality',
        tasks: this.generateCoreTasks(requirements),
        deliverables: ['Core application features', 'Basic UI/UX', 'Core business logic']
      },
      {
        name: 'Integration Implementation',
        duration: complexity === 'simple' ? '3-5 days' : complexity === 'medium' ? '1-2 weeks' : '3-4 weeks',
        description: 'Implement real third-party integrations and external services',
        tasks: this.generateIntegrationTasks(integrations),
        deliverables: ['Working integrations', 'API connections', 'Service configurations']
      },
      {
        name: 'Testing & Quality Assurance',
        duration: complexity === 'simple' ? '2-3 days' : complexity === 'medium' ? '1 week' : '2-3 weeks',
        description: 'Comprehensive testing including unit, integration, and end-to-end tests',
        tasks: [
          { name: 'Write unit tests', duration: '2-3 days', priority: 'high' },
          { name: 'Write integration tests', duration: '2-3 days', priority: 'high' },
          { name: 'Set up end-to-end testing', duration: '1-2 days', priority: 'medium' },
          { name: 'Performance testing', duration: '1 day', priority: 'medium' },
          { name: 'Security testing', duration: '1 day', priority: 'high' }
        ],
        deliverables: ['Test suites', 'Quality reports', 'Performance benchmarks']
      },
      {
        name: 'Production Deployment',
        duration: complexity === 'simple' ? '1-2 days' : complexity === 'medium' ? '3-5 days' : '1-2 weeks',
        description: 'Deploy to production with monitoring and security measures',
        tasks: [
          { name: 'Set up production environment', duration: '1 day', priority: 'high' },
          { name: 'Configure monitoring and logging', duration: '1 day', priority: 'high' },
          { name: 'Set up security measures', duration: '1 day', priority: 'high' },
          { name: 'Deploy application', duration: '0.5 days', priority: 'high' },
          { name: 'Verify production functionality', duration: '0.5 days', priority: 'high' }
        ],
        deliverables: ['Production deployment', 'Monitoring setup', 'Security configuration']
      }
    ];

    return phases;
  }

  generateCoreTasks(requirements) {
    const tasks = [];
    
    requirements.functional?.forEach(requirement => {
      tasks.push({
        name: `Implement ${requirement}`,
        duration: '1-3 days',
        priority: 'high'
      });
    });

    return tasks.length > 0 ? tasks : [
      { name: 'Implement core functionality', duration: '1 week', priority: 'high' },
      { name: 'Create user interface', duration: '3-5 days', priority: 'high' },
      { name: 'Add data management', duration: '2-3 days', priority: 'medium' }
    ];
  }

  generateIntegrationTasks(integrations) {
    const tasks = [];
    
    integrations.thirdParty?.forEach(integration => {
      tasks.push({
        name: `Integrate ${integration.name}`,
        duration: '1-2 days',
        priority: 'medium'
      });
    });

    return tasks.length > 0 ? tasks : [
      { name: 'Set up API integrations', duration: '2-3 days', priority: 'medium' },
      { name: 'Configure external services', duration: '1-2 days', priority: 'medium' }
    ];
  }

  planIntegrations(integrations) {
    return integrations.thirdParty?.map(integration => ({
      name: integration.name,
      type: integration.type,
      purpose: integration.purpose,
      implementation: 'Real service integration with proper error handling and monitoring',
      testing: 'Integration tests with service mocking and real API validation',
      security: 'API key management, rate limiting, and secure communication'
    })) || [];
  }

  defineValidationChecks(requirements, integrations) {
    return [
      {
        name: 'Functional Requirements',
        description: 'All specified features work as expected',
        criteria: 'Manual and automated testing of all user stories'
      },
      {
        name: 'Integration Functionality',
        description: 'All external integrations work correctly',
        criteria: 'Real API calls succeed and handle errors appropriately'
      },
      {
        name: 'Performance Standards',
        description: 'Application meets performance requirements',
        criteria: 'Load times under 3s, API responses under 500ms'
      },
      {
        name: 'Security Compliance',
        description: 'Security best practices implemented',
        criteria: 'Authentication, authorization, input validation, secure communication'
      },
      {
        name: 'Production Readiness',
        description: 'Application ready for production deployment',
        criteria: 'Error handling, logging, monitoring, scalability considerations'
      }
    ];
  }

  // Additional helper methods...
  estimateDuration(complexity, requirements) {
    const baseHours = {
      simple: 40,
      medium: 120,
      complex: 300,
      enterprise: 600
    };

    const hours = baseHours[complexity];
    const weeks = Math.ceil(hours / 40);
    
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }

  estimateBudget(complexity, integrations) {
    const baseCost = {
      simple: 2000,
      medium: 8000,
      complex: 25000,
      enterprise: 75000
    };

    const integrationCost = (integrations.thirdParty?.length || 0) * 500;
    return `$${(baseCost[complexity] + integrationCost).toLocaleString()}`;
  }

  generatePlanId() {
    return `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  designArchitecture(type, requirements, integrations) {
    // Return architecture design based on project type
    return {
      diagram: `${type.toUpperCase()} Architecture with real integrations`,
      components: ['Frontend', 'Backend', 'Database', 'External Services'],
      patterns: ['Microservices', 'API Gateway', 'Event-driven'],
      scalability: 'Horizontal scaling with load balancing'
    };
  }

  planSecurity(security) {
    return {
      authentication: 'Multi-factor authentication with secure session management',
      authorization: 'Role-based access control (RBAC)',
      dataProtection: 'Encryption at rest and in transit',
      compliance: 'GDPR, SOC2 compliance measures'
    };
  }

  planTesting(requirements, integrations) {
    return {
      unit: 'Jest/Vitest with 90%+ coverage',
      integration: 'Real API testing with service mocking',
      endToEnd: 'Playwright/Cypress for user workflows',
      performance: 'Load testing with realistic data volumes'
    };
  }

  planDeployment(type, requirements) {
    return {
      strategy: 'Blue-green deployment with rollback capability',
      environments: ['Development', 'Staging', 'Production'],
      cicd: 'Automated deployment with quality gates',
      monitoring: 'Real-time application and infrastructure monitoring'
    };
  }

  planMonitoring(requirements, integrations) {
    return {
      application: 'Error tracking, performance monitoring',
      infrastructure: 'Server metrics, resource utilization',
      business: 'User analytics, conversion tracking',
      alerts: 'Smart alerting with escalation policies'
    };
  }

  assessRisks(requirements, integrations, complexity) {
    return [
      {
        name: 'Technical Complexity',
        severity: complexity === 'enterprise' ? 'high' : 'medium',
        impact: 'Development timeline and budget overruns',
        mitigation: 'Iterative development with regular checkpoints'
      },
      {
        name: 'Integration Dependencies',
        severity: integrations.thirdParty?.length > 3 ? 'high' : 'low',
        impact: 'Service outages affecting application functionality',
        mitigation: 'Implement circuit breakers and fallback mechanisms'
      }
    ];
  }

  planMitigations(requirements, integrations) {
    return [
      'Regular code reviews and pair programming',
      'Comprehensive testing at all levels',
      'Monitoring and alerting for early issue detection',
      'Documentation and knowledge sharing',
      'Regular security audits and updates'
    ];
  }

  defineProductionCriteria(requirements, security) {
    return [
      'All features implemented and tested',
      'Security measures in place and validated',
      'Performance benchmarks met',
      'Monitoring and alerting configured',
      'Documentation complete',
      'Deployment pipeline tested',
      'Backup and recovery procedures in place'
    ];
  }
}

module.exports = { ProjectPlanner };