const { BasePlanner } = require('./basePlanner');
const { logger } = require('../utils/logger');

class IntegrationPlanner extends BasePlanner {
  constructor(options = {}) {
    super(options);
    this.integrationTypes = {
      api: this.planAPIIntegration.bind(this),
      database: this.planDatabaseIntegration.bind(this),
      payment: this.planPaymentIntegration.bind(this),
      authentication: this.planAuthenticationIntegration.bind(this),
      messaging: this.planMessagingIntegration.bind(this),
      file_storage: this.planFileStorageIntegration.bind(this),
      analytics: this.planAnalyticsIntegration.bind(this),
      notification: this.planNotificationIntegration.bind(this),
      social: this.planSocialIntegration.bind(this),
      search: this.planSearchIntegration.bind(this),
      cdn: this.planCDNIntegration.bind(this),
      monitoring: this.planMonitoringIntegration.bind(this)
    };
  }

  async plan(input, context = {}) {
    try {
      this.validateInput(input, ['integrations']);

      const result = await this.performAsyncPlanning(input, async () => {
        this.reset();

        const integrationConfig = this.analyzeIntegrations(input);
        
        // Plan each integration
        await this.planAllIntegrations(integrationConfig);
        
        // Add integration testing phases
        this.addIntegrationTestingTasks(integrationConfig);
        
        // Add documentation and monitoring
        this.addIntegrationDocumentationTasks(integrationConfig);
        
        // Identify integration-specific risks
        this.identifyIntegrationRisks(integrationConfig);
        
        // Plan resources
        this.planIntegrationResources(integrationConfig);
        
        // Generate estimates
        this.generateEstimates();
        
        return this.createPlanResult(true, {
          totalIntegrations: integrationConfig.integrations.length,
          complexity: integrationConfig.overallComplexity,
          estimatedDuration: this.calculateDuration()
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeIntegrations(input) {
    const config = {
      projectName: input.projectName || 'Integration Project',
      integrations: input.integrations || [],
      environment: input.environment || 'production',
      security: input.security || 'standard',
      scalability: input.scalability || 'medium',
      budget: input.budget || null,
      timeline: input.timeline || null,
      errorHandling: input.errorHandling || 'standard',
      monitoring: input.monitoring || 'basic'
    };

    // Calculate overall complexity
    config.overallComplexity = this.calculateOverallComplexity(config.integrations);
    
    // Group integrations by type
    config.integrationsByType = this.groupIntegrationsByType(config.integrations);

    return config;
  }

  calculateOverallComplexity(integrations) {
    if (integrations.length === 0) return 'low';
    
    let complexityScore = 0;
    
    integrations.forEach(integration => {
      const typeComplexity = {
        api: 2,
        database: 3,
        payment: 4,
        authentication: 3,
        messaging: 3,
        file_storage: 2,
        analytics: 2,
        notification: 2,
        social: 2,
        search: 3,
        cdn: 1,
        monitoring: 2
      };
      
      complexityScore += typeComplexity[integration.type] || 2;
      
      // Add complexity for custom integrations
      if (integration.custom) complexityScore += 2;
      
      // Add complexity for real-time requirements
      if (integration.realtime) complexityScore += 1;
      
      // Add complexity for security requirements
      if (integration.security === 'high') complexityScore += 1;
    });

    const averageComplexity = complexityScore / integrations.length;
    
    if (averageComplexity >= 4) return 'very_high';
    if (averageComplexity >= 3) return 'high';
    if (averageComplexity >= 2) return 'medium';
    return 'low';
  }

  groupIntegrationsByType(integrations) {
    return integrations.reduce((groups, integration) => {
      const type = integration.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(integration);
      return groups;
    }, {});
  }

  async planAllIntegrations(config) {
    // Create main integration phases
    this.addPhase({
      id: 'integration_analysis',
      name: 'Integration Analysis',
      description: 'Analyze integration requirements and design approach',
      duration: 3,
      priority: 'critical'
    });

    this.addPhase({
      id: 'integration_setup',
      name: 'Integration Setup',
      description: 'Set up integration infrastructure and common components',
      duration: 4,
      priority: 'critical',
      dependencies: ['integration_analysis']
    });

    this.addPhase({
      id: 'integration_implementation',
      name: 'Integration Implementation',
      description: 'Implement individual integrations',
      duration: this.estimateImplementationDuration(config),
      priority: 'critical',
      dependencies: ['integration_setup']
    });

    // Plan specific integrations
    for (const [type, integrations] of Object.entries(config.integrationsByType)) {
      const planner = this.integrationTypes[type];
      if (planner) {
        await planner(integrations, config);
      } else {
        await this.planCustomIntegration(integrations, config);
      }
    }

    // Add common setup tasks
    this.addCommonIntegrationTasks(config);
  }

  estimateImplementationDuration(config) {
    const baseTime = config.integrations.length * 2;
    const complexityMultipliers = {
      low: 1.0,
      medium: 1.5,
      high: 2.0,
      very_high: 2.5
    };
    return Math.ceil(baseTime * complexityMultipliers[config.overallComplexity]);
  }

  addCommonIntegrationTasks(config) {
    const commonTasks = [
      {
        id: 'integration_architecture',
        name: 'Integration Architecture',
        description: 'Design overall integration architecture and patterns',
        phase: 'integration_analysis',
        duration: 2,
        effort: 16,
        priority: 'critical',
        complexity: 'high'
      },
      {
        id: 'error_handling_framework',
        name: 'Error Handling Framework',
        description: 'Implement common error handling and retry mechanisms',
        phase: 'integration_setup',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'logging_integration',
        name: 'Integration Logging',
        description: 'Set up comprehensive logging for all integrations',
        phase: 'integration_setup',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'low'
      },
      {
        id: 'configuration_management',
        name: 'Configuration Management',
        description: 'Implement configuration management for integrations',
        phase: 'integration_setup',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'low'
      }
    ];

    commonTasks.forEach(task => this.addTask(task));
  }

  async planAPIIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `api_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `API Integration: ${integration.name}`,
        description: `Integrate with ${integration.name} API`,
        phase: 'integration_implementation',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: integration.custom ? 'high' : 'medium',
        tags: ['api', 'integration']
      });

      // Add API-specific tasks
      this.addTask({
        id: `${taskId}_auth`,
        name: `${integration.name} Authentication`,
        description: `Implement authentication for ${integration.name} API`,
        phase: 'integration_implementation',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium',
        dependencies: [taskId]
      });

      this.addTask({
        id: `${taskId}_rate_limiting`,
        name: `${integration.name} Rate Limiting`,
        description: `Implement rate limiting for ${integration.name} API`,
        phase: 'integration_implementation',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low',
        dependencies: [taskId]
      });
    });
  }

  async planDatabaseIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `db_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Database Integration: ${integration.name}`,
        description: `Set up database connection and ORM for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 4,
        effort: 28,
        priority: 'critical',
        complexity: 'high',
        tags: ['database', 'integration']
      });

      this.addTask({
        id: `${taskId}_migration`,
        name: `${integration.name} Migration Strategy`,
        description: `Implement migration strategy for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium',
        dependencies: [taskId]
      });

      this.addTask({
        id: `${taskId}_backup`,
        name: `${integration.name} Backup Strategy`,
        description: `Implement backup and recovery for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 12,
        priority: 'medium',
        complexity: 'medium',
        dependencies: [taskId]
      });
    });
  }

  async planPaymentIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `payment_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Payment Integration: ${integration.name}`,
        description: `Integrate ${integration.name} payment gateway`,
        phase: 'integration_implementation',
        duration: 5,
        effort: 40,
        priority: 'critical',
        complexity: 'very_high',
        tags: ['payment', 'integration', 'security']
      });

      this.addTask({
        id: `${taskId}_webhook`,
        name: `${integration.name} Webhooks`,
        description: `Implement webhook handling for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 16,
        priority: 'critical',
        complexity: 'high',
        dependencies: [taskId]
      });

      this.addTask({
        id: `${taskId}_security`,
        name: `${integration.name} Security`,
        description: `Implement PCI compliance and security measures`,
        phase: 'integration_implementation',
        duration: 3,
        effort: 24,
        priority: 'critical',
        complexity: 'very_high',
        dependencies: [taskId]
      });
    });
  }

  async planAuthenticationIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `auth_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Auth Integration: ${integration.name}`,
        description: `Integrate ${integration.name} authentication provider`,
        phase: 'integration_implementation',
        duration: 4,
        effort: 28,
        priority: 'critical',
        complexity: 'high',
        tags: ['authentication', 'integration', 'security']
      });

      this.addTask({
        id: `${taskId}_sso`,
        name: `${integration.name} SSO`,
        description: `Implement SSO flow for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium',
        dependencies: [taskId]
      });
    });
  }

  async planMessagingIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `messaging_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Messaging Integration: ${integration.name}`,
        description: `Integrate ${integration.name} messaging service`,
        phase: 'integration_implementation',
        duration: 3,
        effort: 24,
        priority: 'high',
        complexity: 'medium',
        tags: ['messaging', 'integration']
      });

      if (integration.realtime) {
        this.addTask({
          id: `${taskId}_realtime`,
          name: `${integration.name} Real-time`,
          description: `Implement real-time messaging for ${integration.name}`,
          phase: 'integration_implementation',
          duration: 2,
          effort: 16,
          priority: 'high',
          complexity: 'high',
          dependencies: [taskId]
        });
      }
    });
  }

  async planFileStorageIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `storage_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Storage Integration: ${integration.name}`,
        description: `Integrate ${integration.name} file storage service`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 16,
        priority: 'medium',
        complexity: 'low',
        tags: ['storage', 'integration']
      });

      this.addTask({
        id: `${taskId}_cdn`,
        name: `${integration.name} CDN`,
        description: `Set up CDN for ${integration.name} storage`,
        phase: 'integration_implementation',
        duration: 1,
        effort: 8,
        priority: 'low',
        complexity: 'low',
        dependencies: [taskId]
      });
    });
  }

  async planAnalyticsIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `analytics_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Analytics Integration: ${integration.name}`,
        description: `Integrate ${integration.name} analytics service`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 14,
        priority: 'medium',
        complexity: 'low',
        tags: ['analytics', 'integration']
      });

      this.addTask({
        id: `${taskId}_tracking`,
        name: `${integration.name} Event Tracking`,
        description: `Implement event tracking for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium',
        dependencies: [taskId]
      });
    });
  }

  async planNotificationIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `notification_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Notification Integration: ${integration.name}`,
        description: `Integrate ${integration.name} notification service`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 12,
        priority: 'medium',
        complexity: 'low',
        tags: ['notification', 'integration']
      });
    });
  }

  async planSocialIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `social_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Social Integration: ${integration.name}`,
        description: `Integrate ${integration.name} social platform`,
        phase: 'integration_implementation',
        duration: 3,
        effort: 18,
        priority: 'medium',
        complexity: 'medium',
        tags: ['social', 'integration']
      });
    });
  }

  async planSearchIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `search_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Search Integration: ${integration.name}`,
        description: `Integrate ${integration.name} search service`,
        phase: 'integration_implementation',
        duration: 4,
        effort: 28,
        priority: 'high',
        complexity: 'high',
        tags: ['search', 'integration']
      });

      this.addTask({
        id: `${taskId}_indexing`,
        name: `${integration.name} Data Indexing`,
        description: `Implement data indexing for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium',
        dependencies: [taskId]
      });
    });
  }

  async planCDNIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `cdn_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `CDN Integration: ${integration.name}`,
        description: `Integrate ${integration.name} CDN service`,
        phase: 'integration_implementation',
        duration: 1,
        effort: 6,
        priority: 'low',
        complexity: 'low',
        tags: ['cdn', 'integration', 'performance']
      });
    });
  }

  async planMonitoringIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `monitoring_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Monitoring Integration: ${integration.name}`,
        description: `Integrate ${integration.name} monitoring service`,
        phase: 'integration_implementation',
        duration: 2,
        effort: 12,
        priority: 'medium',
        complexity: 'medium',
        tags: ['monitoring', 'integration']
      });
    });
  }

  async planCustomIntegration(integrations, config) {
    integrations.forEach((integration, index) => {
      const taskId = `custom_integration_${index + 1}`;
      this.addTask({
        id: taskId,
        name: `Custom Integration: ${integration.name}`,
        description: `Implement custom integration for ${integration.name}`,
        phase: 'integration_implementation',
        duration: 5,
        effort: 35,
        priority: 'high',
        complexity: 'very_high',
        tags: ['custom', 'integration']
      });

      this.addTask({
        id: `${taskId}_documentation`,
        name: `${integration.name} Documentation`,
        description: `Create documentation for custom ${integration.name} integration`,
        phase: 'integration_implementation',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low',
        dependencies: [taskId]
      });
    });
  }

  addIntegrationTestingTasks(config) {
    this.addPhase({
      id: 'integration_testing',
      name: 'Integration Testing',
      description: 'Test all integrations and data flows',
      duration: Math.ceil(config.integrations.length * 1.5),
      priority: 'critical',
      dependencies: ['integration_implementation']
    });

    const testingTasks = [
      {
        id: 'unit_integration_tests',
        name: 'Unit Integration Tests',
        description: 'Write unit tests for each integration',
        phase: 'integration_testing',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'end_to_end_integration_tests',
        name: 'End-to-End Integration Tests',
        description: 'Test complete integration workflows',
        phase: 'integration_testing',
        duration: 4,
        effort: 28,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['unit_integration_tests']
      },
      {
        id: 'load_testing_integrations',
        name: 'Load Testing',
        description: 'Test integration performance under load',
        phase: 'integration_testing',
        duration: 2,
        effort: 16,
        priority: 'medium',
        complexity: 'medium',
        dependencies: ['end_to_end_integration_tests']
      },
      {
        id: 'error_scenario_testing',
        name: 'Error Scenario Testing',
        description: 'Test error handling and recovery scenarios',
        phase: 'integration_testing',
        duration: 2,
        effort: 14,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['unit_integration_tests']
      }
    ];

    testingTasks.forEach(task => this.addTask(task));
  }

  addIntegrationDocumentationTasks(config) {
    this.addPhase({
      id: 'integration_documentation',
      name: 'Integration Documentation',
      description: 'Document all integrations and setup procedures',
      duration: 3,
      priority: 'medium',
      dependencies: ['integration_testing']
    });

    const docTasks = [
      {
        id: 'integration_guide',
        name: 'Integration Guide',
        description: 'Create comprehensive integration setup guide',
        phase: 'integration_documentation',
        duration: 2,
        effort: 12,
        priority: 'medium',
        complexity: 'low'
      },
      {
        id: 'api_documentation',
        name: 'API Documentation',
        description: 'Document all API integrations and endpoints',
        phase: 'integration_documentation',
        duration: 2,
        effort: 14,
        priority: 'medium',
        complexity: 'low'
      },
      {
        id: 'troubleshooting_guide',
        name: 'Troubleshooting Guide',
        description: 'Create troubleshooting guide for integration issues',
        phase: 'integration_documentation',
        duration: 1,
        effort: 8,
        priority: 'low',
        complexity: 'low'
      }
    ];

    docTasks.forEach(task => this.addTask(task));
  }

  identifyIntegrationRisks(config) {
    // Third-party dependency risk
    this.addRisk({
      name: 'Third-Party Dependency Risk',
      description: 'Integration failures due to third-party service downtime or changes',
      probability: 'medium',
      impact: 'high',
      category: 'dependency',
      mitigation: 'Implement circuit breakers, fallback mechanisms, and service monitoring'
    });

    // Data consistency risk
    if (config.integrationsByType.database) {
      this.addRisk({
        name: 'Data Consistency Risk',
        description: 'Data inconsistency across multiple database integrations',
        probability: 'medium',
        impact: 'high',
        category: 'data',
        mitigation: 'Implement distributed transaction patterns and data validation'
      });
    }

    // Security risk for sensitive integrations
    const sensitiveIntegrations = ['payment', 'authentication'];
    const hasSensitiveIntegrations = config.integrations.some(i => 
      sensitiveIntegrations.includes(i.type)
    );
    
    if (hasSensitiveIntegrations) {
      this.addRisk({
        name: 'Integration Security Risk',
        description: 'Security vulnerabilities in sensitive integrations',
        probability: 'low',
        impact: 'very_high',
        category: 'security',
        mitigation: 'Implement comprehensive security testing and regular security audits'
      });
    }

    // Performance risk for high-volume integrations
    if (config.integrations.length > 5) {
      this.addRisk({
        name: 'Integration Performance Risk',
        description: 'Performance degradation due to multiple integration calls',
        probability: 'medium',
        impact: 'medium',
        category: 'performance',
        mitigation: 'Implement caching, request batching, and asynchronous processing'
      });
    }

    // Complexity risk
    if (config.overallComplexity === 'very_high') {
      this.addRisk({
        name: 'Integration Complexity Risk',
        description: 'High complexity leading to maintenance and debugging challenges',
        probability: 'high',
        impact: 'medium',
        category: 'technical',
        mitigation: 'Implement comprehensive logging, monitoring, and documentation'
      });
    }
  }

  planIntegrationResources(config) {
    // Integration Developer
    this.addResource({
      name: 'Integration Developer',
      type: 'human',
      role: 'integration_developer',
      availability: 100,
      cost: 115,
      costType: 'hourly',
      skills: ['api_integration', 'webhooks', 'error_handling', 'testing']
    });

    // API Specialist for complex API integrations
    if (config.integrationsByType.api && config.integrationsByType.api.length > 2) {
      this.addResource({
        name: 'API Specialist',
        type: 'human',
        role: 'api_specialist',
        availability: 75,
        cost: 125,
        costType: 'hourly',
        skills: ['rest_apis', 'graphql', 'api_design', 'authentication']
      });
    }

    // Database Engineer for database integrations
    if (config.integrationsByType.database) {
      this.addResource({
        name: 'Database Engineer',
        type: 'human',
        role: 'database_engineer',
        availability: 50,
        cost: 130,
        costType: 'hourly',
        skills: ['database_design', 'migrations', 'performance_tuning', 'backup_recovery']
      });
    }

    // Security Engineer for sensitive integrations
    const sensitiveIntegrations = ['payment', 'authentication'];
    const hasSensitiveIntegrations = config.integrations.some(i => 
      sensitiveIntegrations.includes(i.type)
    );
    
    if (hasSensitiveIntegrations) {
      this.addResource({
        name: 'Security Engineer',
        type: 'human',
        role: 'security_engineer',
        availability: 30,
        cost: 140,
        costType: 'hourly',
        skills: ['security_testing', 'compliance', 'encryption', 'penetration_testing']
      });
    }

    // DevOps Engineer for infrastructure and monitoring
    this.addResource({
      name: 'DevOps Engineer',
      type: 'human',
      role: 'devops_engineer',
      availability: 40,
      cost: 120,
      costType: 'hourly',
      skills: ['monitoring', 'deployment', 'infrastructure', 'automation']
    });

    // QA Engineer for integration testing
    this.addResource({
      name: 'QA Engineer',
      type: 'human',
      role: 'qa_engineer',
      availability: 60,
      cost: 85,
      costType: 'hourly',
      skills: ['integration_testing', 'automation', 'load_testing', 'bug_tracking']
    });
  }
}

module.exports = { IntegrationPlanner };