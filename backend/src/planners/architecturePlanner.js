const { BasePlanner } = require('./basePlanner');
const { logger } = require('../utils/logger');

class ArchitecturePlanner extends BasePlanner {
  constructor(options = {}) {
    super(options);
    this.architecturePatterns = {
      microservices: this.planMicroservicesArchitecture.bind(this),
      monolith: this.planMonolithArchitecture.bind(this),
      serverless: this.planServerlessArchitecture.bind(this),
      jamstack: this.planJAMStackArchitecture.bind(this),
      spa: this.planSPAArchitecture.bind(this),
      ssr: this.planSSRArchitecture.bind(this),
      mobile: this.planMobileArchitecture.bind(this),
      desktop: this.planDesktopArchitecture.bind(this)
    };
  }

  async plan(input, context = {}) {
    try {
      this.validateInput(input, ['architectureType', 'projectName']);

      const result = await this.performAsyncPlanning(input, async () => {
        this.reset();

        const archConfig = this.analyzeArchitectureRequirements(input);
        
        // Plan the specific architecture
        await this.planArchitectureImplementation(archConfig);
        
        // Add infrastructure planning
        this.addInfrastructureTasks(archConfig);
        
        // Add security architecture tasks
        this.addSecurityArchitectureTasks(archConfig);
        
        // Add monitoring and observability
        this.addMonitoringTasks(archConfig);
        
        // Identify architecture-specific risks
        this.identifyArchitectureRisks(archConfig);
        
        // Plan resources
        this.planArchitectureResources(archConfig);
        
        // Generate estimates
        this.generateEstimates();
        
        return this.createPlanResult(true, {
          architectureType: input.architectureType,
          complexity: archConfig.complexity,
          scalabilityLevel: archConfig.scalability
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeArchitectureRequirements(input) {
    const config = {
      projectName: input.projectName,
      type: input.architectureType,
      scale: input.scale || 'medium',
      complexity: input.complexity || this.estimateArchitectureComplexity(input),
      scalability: input.scalability || 'horizontal',
      performance: input.performance || 'standard',
      security: input.security || 'standard',
      availability: input.availability || '99.9',
      technologies: input.technologies || [],
      platforms: input.platforms || ['web'],
      integrations: input.integrations || [],
      dataVolume: input.dataVolume || 'medium',
      userLoad: input.userLoad || 'medium',
      budget: input.budget || null,
      timeline: input.timeline || null,
      compliance: input.compliance || []
    };

    return config;
  }

  estimateArchitectureComplexity(input) {
    let complexityScore = 0;

    // Base complexity by architecture type
    const typeComplexity = {
      microservices: 4,
      serverless: 3,
      monolith: 2,
      jamstack: 2,
      spa: 2,
      ssr: 3,
      mobile: 3,
      desktop: 2
    };
    complexityScore += typeComplexity[input.architectureType] || 2;

    // Scale complexity
    if (input.scale === 'large' || input.scale === 'enterprise') complexityScore += 3;
    else if (input.scale === 'medium') complexityScore += 1;

    // Technology stack complexity
    if (input.technologies && input.technologies.length > 8) complexityScore += 2;
    else if (input.technologies && input.technologies.length > 4) complexityScore += 1;

    // Integration complexity
    if (input.integrations && input.integrations.length > 5) complexityScore += 2;
    else if (input.integrations && input.integrations.length > 2) complexityScore += 1;

    // Performance requirements
    if (input.performance === 'high' || input.performance === 'realtime') complexityScore += 2;

    // Compliance requirements
    if (input.compliance && input.compliance.length > 0) complexityScore += 2;

    if (complexityScore >= 10) return 'very_high';
    if (complexityScore >= 7) return 'high';
    if (complexityScore >= 4) return 'medium';
    return 'low';
  }

  async planArchitectureImplementation(config) {
    const planner = this.architecturePatterns[config.type];
    if (planner) {
      await planner(config);
    } else {
      await this.planGenericArchitecture(config);
    }
  }

  async planMicroservicesArchitecture(config) {
    this.addPhase({
      id: 'service_decomposition',
      name: 'Service Decomposition',
      description: 'Design microservices breakdown and boundaries',
      duration: 8,
      priority: 'critical'
    });

    this.addPhase({
      id: 'service_implementation',
      name: 'Service Implementation',
      description: 'Implement individual microservices',
      duration: 20,
      priority: 'critical',
      dependencies: ['service_decomposition']
    });

    this.addPhase({
      id: 'service_orchestration',
      name: 'Service Orchestration',
      description: 'Implement service discovery and orchestration',
      duration: 10,
      priority: 'critical',
      dependencies: ['service_implementation']
    });

    this.addPhase({
      id: 'integration_testing',
      name: 'Integration Testing',
      description: 'Test microservices integration and communication',
      duration: 8,
      priority: 'high',
      dependencies: ['service_orchestration']
    });

    const tasks = [
      {
        id: 'domain_modeling',
        name: 'Domain Modeling',
        description: 'Create domain models and service boundaries',
        phase: 'service_decomposition',
        duration: 4,
        effort: 32,
        priority: 'critical',
        complexity: 'high'
      },
      {
        id: 'api_gateway_design',
        name: 'API Gateway Design',
        description: 'Design API gateway architecture and routing',
        phase: 'service_decomposition',
        duration: 3,
        effort: 24,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'service_templates',
        name: 'Service Templates',
        description: 'Create microservice templates and boilerplates',
        phase: 'service_decomposition',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'user_service',
        name: 'User Service',
        description: 'Implement user management microservice',
        phase: 'service_implementation',
        duration: 5,
        effort: 40,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['service_templates']
      },
      {
        id: 'auth_service',
        name: 'Authentication Service',
        description: 'Implement authentication microservice',
        phase: 'service_implementation',
        duration: 6,
        effort: 48,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['service_templates']
      },
      {
        id: 'notification_service',
        name: 'Notification Service',
        description: 'Implement notification microservice',
        phase: 'service_implementation',
        duration: 4,
        effort: 32,
        priority: 'medium',
        complexity: 'medium',
        dependencies: ['service_templates']
      },
      {
        id: 'api_gateway_implementation',
        name: 'API Gateway Implementation',
        description: 'Implement API gateway with routing and load balancing',
        phase: 'service_orchestration',
        duration: 4,
        effort: 32,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['api_gateway_design', 'auth_service']
      },
      {
        id: 'service_discovery',
        name: 'Service Discovery',
        description: 'Implement service discovery mechanism',
        phase: 'service_orchestration',
        duration: 3,
        effort: 24,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'circuit_breaker',
        name: 'Circuit Breaker Pattern',
        description: 'Implement circuit breaker for resilience',
        phase: 'service_orchestration',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['service_discovery']
      },
      {
        id: 'contract_testing',
        name: 'Contract Testing',
        description: 'Implement contract testing between services',
        phase: 'integration_testing',
        duration: 4,
        effort: 28,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'end_to_end_testing',
        name: 'End-to-End Testing',
        description: 'Implement comprehensive E2E testing',
        phase: 'integration_testing',
        duration: 4,
        effort: 32,
        priority: 'high',
        complexity: 'high',
        dependencies: ['contract_testing']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planServerlessArchitecture(config) {
    this.addPhase({
      id: 'function_design',
      name: 'Function Design',
      description: 'Design serverless functions and event flows',
      duration: 5,
      priority: 'critical'
    });

    this.addPhase({
      id: 'function_implementation',
      name: 'Function Implementation',
      description: 'Implement serverless functions',
      duration: 12,
      priority: 'critical',
      dependencies: ['function_design']
    });

    this.addPhase({
      id: 'deployment_automation',
      name: 'Deployment Automation',
      description: 'Set up serverless deployment pipeline',
      duration: 6,
      priority: 'high',
      dependencies: ['function_implementation']
    });

    const tasks = [
      {
        id: 'function_architecture',
        name: 'Function Architecture',
        description: 'Design function boundaries and event triggers',
        phase: 'function_design',
        duration: 3,
        effort: 24,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'api_functions',
        name: 'API Functions',
        description: 'Implement API endpoint functions',
        phase: 'function_implementation',
        duration: 6,
        effort: 40,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'background_functions',
        name: 'Background Functions',
        description: 'Implement background processing functions',
        phase: 'function_implementation',
        duration: 4,
        effort: 28,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'event_handlers',
        name: 'Event Handlers',
        description: 'Implement event-driven function handlers',
        phase: 'function_implementation',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'iac_templates',
        name: 'Infrastructure as Code',
        description: 'Create IaC templates for serverless deployment',
        phase: 'deployment_automation',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'cicd_pipeline',
        name: 'CI/CD Pipeline',
        description: 'Set up continuous deployment for functions',
        phase: 'deployment_automation',
        duration: 3,
        effort: 18,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['iac_templates']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planMonolithArchitecture(config) {
    this.addPhase({
      id: 'monolith_design',
      name: 'Monolith Design',
      description: 'Design monolithic application architecture',
      duration: 5,
      priority: 'critical'
    });

    this.addPhase({
      id: 'core_implementation',
      name: 'Core Implementation',
      description: 'Implement core application modules',
      duration: 15,
      priority: 'critical',
      dependencies: ['monolith_design']
    });

    this.addPhase({
      id: 'integration_layer',
      name: 'Integration Layer',
      description: 'Implement external integrations',
      duration: 6,
      priority: 'high',
      dependencies: ['core_implementation']
    });

    const tasks = [
      {
        id: 'layered_architecture',
        name: 'Layered Architecture',
        description: 'Design layered architecture with clear separation',
        phase: 'monolith_design',
        duration: 3,
        effort: 20,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'data_layer',
        name: 'Data Access Layer',
        description: 'Implement data access and repository pattern',
        phase: 'core_implementation',
        duration: 4,
        effort: 28,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'business_logic',
        name: 'Business Logic Layer',
        description: 'Implement core business logic and services',
        phase: 'core_implementation',
        duration: 8,
        effort: 56,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['data_layer']
      },
      {
        id: 'presentation_layer',
        name: 'Presentation Layer',
        description: 'Implement presentation layer and controllers',
        phase: 'core_implementation',
        duration: 5,
        effort: 35,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['business_logic']
      },
      {
        id: 'api_integration',
        name: 'API Integration',
        description: 'Implement external API integrations',
        phase: 'integration_layer',
        duration: 4,
        effort: 24,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planJAMStackArchitecture(config) {
    this.addPhase({
      id: 'jamstack_setup',
      name: 'JAMStack Setup',
      description: 'Set up static site generation and CDN',
      duration: 4,
      priority: 'high'
    });

    this.addPhase({
      id: 'api_development',
      name: 'API Development',
      description: 'Develop serverless APIs and functions',
      duration: 8,
      priority: 'high',
      dependencies: ['jamstack_setup']
    });

    const tasks = [
      {
        id: 'static_generator',
        name: 'Static Site Generator',
        description: 'Set up static site generator (Gatsby/Next.js)',
        phase: 'jamstack_setup',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'low'
      },
      {
        id: 'cdn_setup',
        name: 'CDN Configuration',
        description: 'Configure CDN for global content delivery',
        phase: 'jamstack_setup',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low'
      },
      {
        id: 'headless_cms',
        name: 'Headless CMS',
        description: 'Integrate headless CMS for content management',
        phase: 'jamstack_setup',
        duration: 2,
        effort: 14,
        priority: 'medium',
        complexity: 'medium'
      },
      {
        id: 'serverless_apis',
        name: 'Serverless APIs',
        description: 'Develop serverless API functions',
        phase: 'api_development',
        duration: 6,
        effort: 36,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planSPAArchitecture(config) {
    this.addPhase({
      id: 'spa_setup',
      name: 'SPA Setup',
      description: 'Set up single page application framework',
      duration: 3,
      priority: 'high'
    });

    this.addPhase({
      id: 'spa_development',
      name: 'SPA Development',
      description: 'Develop SPA components and routing',
      duration: 10,
      priority: 'high',
      dependencies: ['spa_setup']
    });

    const tasks = [
      {
        id: 'framework_setup',
        name: 'Framework Setup',
        description: 'Set up React/Vue/Angular framework',
        phase: 'spa_setup',
        duration: 1,
        effort: 6,
        priority: 'high',
        complexity: 'low'
      },
      {
        id: 'routing_setup',
        name: 'Client-side Routing',
        description: 'Implement client-side routing system',
        phase: 'spa_setup',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'state_management',
        name: 'State Management',
        description: 'Implement global state management',
        phase: 'spa_development',
        duration: 3,
        effort: 18,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'component_library',
        name: 'Component Library',
        description: 'Build reusable component library',
        phase: 'spa_development',
        duration: 5,
        effort: 30,
        priority: 'medium',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planSSRArchitecture(config) {
    this.addPhase({
      id: 'ssr_setup',
      name: 'SSR Setup',
      description: 'Set up server-side rendering framework',
      duration: 4,
      priority: 'high'
    });

    this.addPhase({
      id: 'ssr_optimization',
      name: 'SSR Optimization',
      description: 'Optimize SSR performance and caching',
      duration: 5,
      priority: 'medium',
      dependencies: ['ssr_setup']
    });

    const tasks = [
      {
        id: 'nextjs_setup',
        name: 'Next.js Setup',
        description: 'Set up Next.js for SSR',
        phase: 'ssr_setup',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'data_fetching',
        name: 'Data Fetching Strategy',
        description: 'Implement SSR data fetching patterns',
        phase: 'ssr_setup',
        duration: 2,
        effort: 14,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'caching_strategy',
        name: 'Caching Strategy',
        description: 'Implement caching for SSR performance',
        phase: 'ssr_optimization',
        duration: 3,
        effort: 18,
        priority: 'medium',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planMobileArchitecture(config) {
    this.addPhase({
      id: 'mobile_setup',
      name: 'Mobile Setup',
      description: 'Set up mobile development environment',
      duration: 3,
      priority: 'high'
    });

    this.addPhase({
      id: 'mobile_development',
      name: 'Mobile Development',
      description: 'Develop mobile application components',
      duration: 12,
      priority: 'high',
      dependencies: ['mobile_setup']
    });

    const tasks = [
      {
        id: 'react_native_setup',
        name: 'React Native Setup',
        description: 'Set up React Native development environment',
        phase: 'mobile_setup',
        duration: 2,
        effort: 10,
        priority: 'high',
        complexity: 'low'
      },
      {
        id: 'navigation_setup',
        name: 'Navigation Setup',
        description: 'Implement mobile navigation patterns',
        phase: 'mobile_setup',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'offline_support',
        name: 'Offline Support',
        description: 'Implement offline data synchronization',
        phase: 'mobile_development',
        duration: 4,
        effort: 28,
        priority: 'medium',
        complexity: 'high'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planDesktopArchitecture(config) {
    this.addPhase({
      id: 'desktop_setup',
      name: 'Desktop Setup',
      description: 'Set up desktop application framework',
      duration: 3,
      priority: 'high'
    });

    this.addPhase({
      id: 'desktop_development',
      name: 'Desktop Development',
      description: 'Develop desktop application features',
      duration: 10,
      priority: 'high',
      dependencies: ['desktop_setup']
    });

    const tasks = [
      {
        id: 'electron_setup',
        name: 'Electron Setup',
        description: 'Set up Electron framework for desktop app',
        phase: 'desktop_setup',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'native_integration',
        name: 'Native Integration',
        description: 'Implement native OS integrations',
        phase: 'desktop_development',
        duration: 4,
        effort: 24,
        priority: 'medium',
        complexity: 'high'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planGenericArchitecture(config) {
    this.addPhase({
      id: 'architecture_analysis',
      name: 'Architecture Analysis',
      description: 'Analyze and document architecture requirements',
      duration: 3,
      priority: 'critical'
    });

    this.addPhase({
      id: 'architecture_implementation',
      name: 'Architecture Implementation',
      description: 'Implement architecture components',
      duration: this.estimateArchitectureDuration(config),
      priority: 'critical',
      dependencies: ['architecture_analysis']
    });

    const tasks = [
      {
        id: 'requirements_analysis',
        name: 'Requirements Analysis',
        description: 'Document architecture requirements and constraints',
        phase: 'architecture_analysis',
        duration: 3,
        effort: 18,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'component_implementation',
        name: 'Component Implementation',
        description: 'Implement core architecture components',
        phase: 'architecture_implementation',
        duration: this.estimateArchitectureDuration(config) - 2,
        effort: this.estimateArchitectureEffort(config),
        priority: 'critical',
        complexity: config.complexity,
        dependencies: ['requirements_analysis']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  estimateArchitectureDuration(config) {
    const complexityMultipliers = {
      low: 8,
      medium: 15,
      high: 25,
      very_high: 35
    };
    return complexityMultipliers[config.complexity] || 15;
  }

  estimateArchitectureEffort(config) {
    const complexityMultipliers = {
      low: 60,
      medium: 120,
      high: 200,
      very_high: 300
    };
    return complexityMultipliers[config.complexity] || 120;
  }

  addInfrastructureTasks(config) {
    this.addPhase({
      id: 'infrastructure_setup',
      name: 'Infrastructure Setup',
      description: 'Set up infrastructure and deployment environment',
      duration: 6,
      priority: 'high'
    });

    const infraTasks = [
      {
        id: 'environment_setup',
        name: 'Environment Setup',
        description: 'Set up development, staging, and production environments',
        phase: 'infrastructure_setup',
        duration: 3,
        effort: 18,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'database_setup',
        name: 'Database Setup',
        description: 'Set up database infrastructure and configuration',
        phase: 'infrastructure_setup',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'load_balancer',
        name: 'Load Balancer',
        description: 'Configure load balancing for high availability',
        phase: 'infrastructure_setup',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium'
      }
    ];

    if (config.type === 'microservices') {
      infraTasks.push({
        id: 'container_orchestration',
        name: 'Container Orchestration',
        description: 'Set up Kubernetes for container orchestration',
        phase: 'infrastructure_setup',
        duration: 4,
        effort: 32,
        priority: 'critical',
        complexity: 'high'
      });
    }

    infraTasks.forEach(task => this.addTask(task));
  }

  addSecurityArchitectureTasks(config) {
    this.addPhase({
      id: 'security_architecture',
      name: 'Security Architecture',
      description: 'Implement security measures and compliance',
      duration: 5,
      priority: 'high'
    });

    const securityTasks = [
      {
        id: 'security_audit',
        name: 'Security Audit',
        description: 'Conduct comprehensive security audit',
        phase: 'security_architecture',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'encryption_implementation',
        name: 'Encryption Implementation',
        description: 'Implement data encryption at rest and in transit',
        phase: 'security_architecture',
        duration: 2,
        effort: 14,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'access_control',
        name: 'Access Control',
        description: 'Implement role-based access control',
        phase: 'security_architecture',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    if (config.compliance && config.compliance.length > 0) {
      securityTasks.push({
        id: 'compliance_implementation',
        name: 'Compliance Implementation',
        description: `Implement ${config.compliance.join(', ')} compliance measures`,
        phase: 'security_architecture',
        duration: 3,
        effort: 24,
        priority: 'critical',
        complexity: 'high'
      });
    }

    securityTasks.forEach(task => this.addTask(task));
  }

  addMonitoringTasks(config) {
    this.addPhase({
      id: 'monitoring_observability',
      name: 'Monitoring & Observability',
      description: 'Implement monitoring, logging, and observability',
      duration: 4,
      priority: 'medium'
    });

    const monitoringTasks = [
      {
        id: 'application_monitoring',
        name: 'Application Monitoring',
        description: 'Set up application performance monitoring',
        phase: 'monitoring_observability',
        duration: 2,
        effort: 12,
        priority: 'medium',
        complexity: 'medium'
      },
      {
        id: 'logging_system',
        name: 'Centralized Logging',
        description: 'Implement centralized logging system',
        phase: 'monitoring_observability',
        duration: 2,
        effort: 14,
        priority: 'medium',
        complexity: 'medium'
      },
      {
        id: 'alerting_system',
        name: 'Alerting System',
        description: 'Set up alerting and notification system',
        phase: 'monitoring_observability',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'low'
      }
    ];

    if (config.type === 'microservices') {
      monitoringTasks.push({
        id: 'distributed_tracing',
        name: 'Distributed Tracing',
        description: 'Implement distributed tracing for microservices',
        phase: 'monitoring_observability',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'high'
      });
    }

    monitoringTasks.forEach(task => this.addTask(task));
  }

  identifyArchitectureRisks(config) {
    // Complexity risks
    if (config.complexity === 'very_high') {
      this.addRisk({
        name: 'Architecture Complexity Risk',
        description: 'High architecture complexity may lead to implementation challenges',
        probability: 'high',
        impact: 'high',
        category: 'technical',
        mitigation: 'Break down architecture into smaller, manageable components'
      });
    }

    // Scalability risks
    if (config.userLoad === 'high' || config.dataVolume === 'high') {
      this.addRisk({
        name: 'Scalability Risk',
        description: 'High load requirements may stress the architecture',
        probability: 'medium',
        impact: 'high',
        category: 'performance',
        mitigation: 'Implement horizontal scaling and load testing'
      });
    }

    // Integration risks for microservices
    if (config.type === 'microservices') {
      this.addRisk({
        name: 'Service Communication Risk',
        description: 'Microservices communication may introduce latency and failures',
        probability: 'medium',
        impact: 'medium',
        category: 'integration',
        mitigation: 'Implement circuit breakers and resilience patterns'
      });
    }

    // Security risks for distributed architectures
    if (['microservices', 'serverless'].includes(config.type)) {
      this.addRisk({
        name: 'Distributed Security Risk',
        description: 'Distributed architecture increases security attack surface',
        probability: 'medium',
        impact: 'high',
        category: 'security',
        mitigation: 'Implement zero-trust security model and encryption'
      });
    }

    // Technology risks
    if (config.technologies.length > 5) {
      this.addRisk({
        name: 'Technology Stack Risk',
        description: 'Complex technology stack may increase maintenance burden',
        probability: 'medium',
        impact: 'medium',
        category: 'technical',
        mitigation: 'Standardize technology choices and provide training'
      });
    }
  }

  planArchitectureResources(config) {
    // Solutions Architect
    this.addResource({
      name: 'Solutions Architect',
      type: 'human',
      role: 'architect',
      availability: 100,
      cost: 160,
      costType: 'hourly',
      skills: ['architecture_design', 'system_design', 'technical_leadership']
    });

    // Senior Developers based on architecture type
    const developerCount = config.type === 'microservices' ? 4 : 2;
    for (let i = 1; i <= developerCount; i++) {
      this.addResource({
        name: `Senior Developer ${i}`,
        type: 'human',
        role: 'senior_developer',
        availability: 100,
        cost: 130,
        costType: 'hourly',
        skills: ['architecture_implementation', config.type, 'best_practices']
      });
    }

    // DevOps Engineer for infrastructure
    this.addResource({
      name: 'DevOps Engineer',
      type: 'human',
      role: 'devops',
      availability: 75,
      cost: 120,
      costType: 'hourly',
      skills: ['infrastructure', 'deployment', 'monitoring', 'security']
    });

    // Security Architect for high-security requirements
    if (config.security === 'high' || config.compliance.length > 0) {
      this.addResource({
        name: 'Security Architect',
        type: 'human',
        role: 'security_architect',
        availability: 50,
        cost: 150,
        costType: 'hourly',
        skills: ['security_architecture', 'compliance', 'risk_assessment']
      });
    }

    // Performance Engineer for high-performance requirements
    if (config.performance === 'high' || config.userLoad === 'high') {
      this.addResource({
        name: 'Performance Engineer',
        type: 'human',
        role: 'performance_engineer',
        availability: 50,
        cost: 135,
        costType: 'hourly',
        skills: ['performance_optimization', 'load_testing', 'scalability']
      });
    }
  }
}

module.exports = { ArchitecturePlanner };