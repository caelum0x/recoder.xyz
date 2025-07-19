const { BasePlanner } = require('./basePlanner');
const { logger } = require('../utils/logger');

class DeploymentPlanner extends BasePlanner {
  constructor(options = {}) {
    super(options);
    this.deploymentStrategies = {
      rolling: this.planRollingDeployment.bind(this),
      blue_green: this.planBlueGreenDeployment.bind(this),
      canary: this.planCanaryDeployment.bind(this),
      recreate: this.planRecreateDeployment.bind(this),
      a_b: this.planABDeployment.bind(this)
    };

    this.platforms = {
      aws: this.planAWSDeployment.bind(this),
      azure: this.planAzureDeployment.bind(this),
      gcp: this.planGCPDeployment.bind(this),
      kubernetes: this.planKubernetesDeployment.bind(this),
      docker: this.planDockerDeployment.bind(this),
      serverless: this.planServerlessDeployment.bind(this),
      traditional: this.planTraditionalDeployment.bind(this)
    };
  }

  async plan(input, context = {}) {
    try {
      this.validateInput(input, ['platform', 'projectName']);

      const result = await this.performAsyncPlanning(input, async () => {
        this.reset();

        const deploymentConfig = this.analyzeDeploymentRequirements(input);
        
        // Plan deployment strategy
        await this.planDeploymentStrategy(deploymentConfig);
        
        // Plan platform-specific deployment
        await this.planPlatformDeployment(deploymentConfig);
        
        // Add infrastructure setup
        this.addInfrastructureSetupTasks(deploymentConfig);
        
        // Add monitoring and observability
        this.addMonitoringTasks(deploymentConfig);
        
        // Add security and compliance
        this.addSecurityTasks(deploymentConfig);
        
        // Add backup and disaster recovery
        this.addBackupRecoveryTasks(deploymentConfig);
        
        // Identify deployment risks
        this.identifyDeploymentRisks(deploymentConfig);
        
        // Plan resources
        this.planDeploymentResources(deploymentConfig);
        
        // Generate estimates
        this.generateEstimates();
        
        return this.createPlanResult(true, {
          platform: input.platform,
          strategy: deploymentConfig.strategy,
          complexity: deploymentConfig.complexity,
          estimatedDuration: this.calculateDuration()
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeDeploymentRequirements(input) {
    const config = {
      projectName: input.projectName,
      platform: input.platform,
      strategy: input.strategy || this.selectDeploymentStrategy(input),
      environment: input.environment || 'production',
      scale: input.scale || 'medium',
      availability: input.availability || '99.9',
      performance: input.performance || 'standard',
      security: input.security || 'standard',
      compliance: input.compliance || [],
      budget: input.budget || null,
      timeline: input.timeline || null,
      rollbackStrategy: input.rollbackStrategy || 'automatic',
      monitoring: input.monitoring || 'standard',
      backup: input.backup || 'daily',
      regions: input.regions || ['us-east-1'],
      containerized: input.containerized || false,
      microservices: input.microservices || false,
      serverless: input.serverless || false,
      database: input.database || null,
      cdn: input.cdn || false,
      loadBalancer: input.loadBalancer || true
    };

    config.complexity = this.calculateDeploymentComplexity(config);
    
    return config;
  }

  selectDeploymentStrategy(input) {
    // Auto-select strategy based on requirements
    if (input.availability && parseFloat(input.availability) > 99.9) {
      return 'blue_green';
    }
    if (input.scale === 'large' || input.scale === 'enterprise') {
      return 'canary';
    }
    if (input.environment === 'development' || input.environment === 'staging') {
      return 'recreate';
    }
    return 'rolling';
  }

  calculateDeploymentComplexity(config) {
    let complexityScore = 0;

    // Platform complexity
    const platformComplexity = {
      kubernetes: 4,
      aws: 3,
      azure: 3,
      gcp: 3,
      serverless: 2,
      docker: 2,
      traditional: 1
    };
    complexityScore += platformComplexity[config.platform] || 2;

    // Strategy complexity
    const strategyComplexity = {
      blue_green: 3,
      canary: 4,
      a_b: 4,
      rolling: 2,
      recreate: 1
    };
    complexityScore += strategyComplexity[config.strategy] || 2;

    // Scale complexity
    if (config.scale === 'enterprise') complexityScore += 3;
    else if (config.scale === 'large') complexityScore += 2;
    else if (config.scale === 'medium') complexityScore += 1;

    // Multi-region complexity
    if (config.regions.length > 3) complexityScore += 3;
    else if (config.regions.length > 1) complexityScore += 1;

    // Architecture complexity
    if (config.microservices) complexityScore += 2;
    if (config.serverless) complexityScore += 1;
    if (config.containerized) complexityScore += 1;

    // Compliance complexity
    if (config.compliance.length > 0) complexityScore += 2;

    // High availability complexity
    if (parseFloat(config.availability) > 99.9) complexityScore += 2;

    if (complexityScore >= 12) return 'very_high';
    if (complexityScore >= 8) return 'high';
    if (complexityScore >= 5) return 'medium';
    return 'low';
  }

  async planDeploymentStrategy(config) {
    const strategyPlanner = this.deploymentStrategies[config.strategy];
    if (strategyPlanner) {
      await strategyPlanner(config);
    } else {
      await this.planRollingDeployment(config); // Default fallback
    }
  }

  async planPlatformDeployment(config) {
    const platformPlanner = this.platforms[config.platform];
    if (platformPlanner) {
      await platformPlanner(config);
    } else {
      await this.planGenericPlatformDeployment(config);
    }
  }

  async planRollingDeployment(config) {
    this.addPhase({
      id: 'rolling_deployment_prep',
      name: 'Rolling Deployment Preparation',
      description: 'Prepare for rolling deployment strategy',
      duration: 3,
      priority: 'high'
    });

    this.addPhase({
      id: 'rolling_deployment_execution',
      name: 'Rolling Deployment Execution',
      description: 'Execute rolling deployment with health checks',
      duration: 4,
      priority: 'critical',
      dependencies: ['rolling_deployment_prep']
    });

    const tasks = [
      {
        id: 'health_check_setup',
        name: 'Health Check Setup',
        description: 'Set up health checks for rolling deployment',
        phase: 'rolling_deployment_prep',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'rolling_update_config',
        name: 'Rolling Update Configuration',
        description: 'Configure rolling update parameters and thresholds',
        phase: 'rolling_deployment_prep',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'deployment_execution',
        name: 'Deployment Execution',
        description: 'Execute rolling deployment with monitoring',
        phase: 'rolling_deployment_execution',
        duration: 3,
        effort: 18,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['health_check_setup', 'rolling_update_config']
      },
      {
        id: 'post_deployment_validation',
        name: 'Post-Deployment Validation',
        description: 'Validate deployment success and system health',
        phase: 'rolling_deployment_execution',
        duration: 1,
        effort: 6,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['deployment_execution']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planBlueGreenDeployment(config) {
    this.addPhase({
      id: 'blue_green_setup',
      name: 'Blue-Green Setup',
      description: 'Set up blue-green deployment infrastructure',
      duration: 4,
      priority: 'high'
    });

    this.addPhase({
      id: 'blue_green_deployment',
      name: 'Blue-Green Deployment',
      description: 'Execute blue-green deployment and traffic switch',
      duration: 3,
      priority: 'critical',
      dependencies: ['blue_green_setup']
    });

    const tasks = [
      {
        id: 'environment_duplication',
        name: 'Environment Duplication',
        description: 'Create identical green environment',
        phase: 'blue_green_setup',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'high'
      },
      {
        id: 'load_balancer_config',
        name: 'Load Balancer Configuration',
        description: 'Configure load balancer for blue-green switching',
        phase: 'blue_green_setup',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'green_deployment',
        name: 'Green Environment Deployment',
        description: 'Deploy application to green environment',
        phase: 'blue_green_deployment',
        duration: 1,
        effort: 8,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['environment_duplication']
      },
      {
        id: 'traffic_switch',
        name: 'Traffic Switch',
        description: 'Switch traffic from blue to green environment',
        phase: 'blue_green_deployment',
        duration: 1,
        effort: 6,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['green_deployment', 'load_balancer_config']
      },
      {
        id: 'blue_environment_cleanup',
        name: 'Blue Environment Cleanup',
        description: 'Clean up or repurpose blue environment',
        phase: 'blue_green_deployment',
        duration: 1,
        effort: 4,
        priority: 'low',
        complexity: 'low',
        dependencies: ['traffic_switch']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planCanaryDeployment(config) {
    this.addPhase({
      id: 'canary_setup',
      name: 'Canary Deployment Setup',
      description: 'Set up canary deployment infrastructure and monitoring',
      duration: 5,
      priority: 'high'
    });

    this.addPhase({
      id: 'canary_execution',
      name: 'Canary Deployment Execution',
      description: 'Execute gradual canary rollout with monitoring',
      duration: 6,
      priority: 'critical',
      dependencies: ['canary_setup']
    });

    const tasks = [
      {
        id: 'traffic_splitting_setup',
        name: 'Traffic Splitting Setup',
        description: 'Configure traffic splitting for canary deployment',
        phase: 'canary_setup',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'high'
      },
      {
        id: 'metrics_setup',
        name: 'Canary Metrics Setup',
        description: 'Set up metrics and alerts for canary monitoring',
        phase: 'canary_setup',
        duration: 2,
        effort: 14,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'automated_rollback',
        name: 'Automated Rollback Setup',
        description: 'Configure automated rollback triggers',
        phase: 'canary_setup',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'canary_phase_1',
        name: 'Canary Phase 1 (5%)',
        description: 'Deploy to 5% of traffic with monitoring',
        phase: 'canary_execution',
        duration: 1,
        effort: 8,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['traffic_splitting_setup', 'metrics_setup']
      },
      {
        id: 'canary_phase_2',
        name: 'Canary Phase 2 (25%)',
        description: 'Increase to 25% of traffic',
        phase: 'canary_execution',
        duration: 2,
        effort: 12,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['canary_phase_1']
      },
      {
        id: 'canary_phase_3',
        name: 'Canary Phase 3 (75%)',
        description: 'Increase to 75% of traffic',
        phase: 'canary_execution',
        duration: 2,
        effort: 12,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['canary_phase_2']
      },
      {
        id: 'full_rollout',
        name: 'Full Rollout',
        description: 'Complete rollout to 100% of traffic',
        phase: 'canary_execution',
        duration: 1,
        effort: 6,
        priority: 'critical',
        complexity: 'low',
        dependencies: ['canary_phase_3']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planRecreateDeployment(config) {
    this.addPhase({
      id: 'recreate_deployment',
      name: 'Recreate Deployment',
      description: 'Execute recreate deployment strategy',
      duration: 2,
      priority: 'medium'
    });

    const tasks = [
      {
        id: 'application_shutdown',
        name: 'Application Shutdown',
        description: 'Shutdown existing application instances',
        phase: 'recreate_deployment',
        duration: 1,
        effort: 4,
        priority: 'medium',
        complexity: 'low'
      },
      {
        id: 'new_deployment',
        name: 'New Deployment',
        description: 'Deploy new version of application',
        phase: 'recreate_deployment',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium',
        dependencies: ['application_shutdown']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planABDeployment(config) {
    this.addPhase({
      id: 'ab_deployment_setup',
      name: 'A/B Deployment Setup',
      description: 'Set up A/B testing infrastructure',
      duration: 6,
      priority: 'high'
    });

    this.addPhase({
      id: 'ab_deployment_execution',
      name: 'A/B Deployment Execution',
      description: 'Execute A/B deployment with analytics',
      duration: 8,
      priority: 'high',
      dependencies: ['ab_deployment_setup']
    });

    const tasks = [
      {
        id: 'feature_flags_setup',
        name: 'Feature Flags Setup',
        description: 'Implement feature flags for A/B testing',
        phase: 'ab_deployment_setup',
        duration: 3,
        effort: 24,
        priority: 'high',
        complexity: 'high'
      },
      {
        id: 'analytics_integration',
        name: 'Analytics Integration',
        description: 'Integrate analytics for A/B test tracking',
        phase: 'ab_deployment_setup',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'ab_test_execution',
        name: 'A/B Test Execution',
        description: 'Run A/B test with data collection',
        phase: 'ab_deployment_execution',
        duration: 6,
        effort: 30,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['feature_flags_setup', 'analytics_integration']
      },
      {
        id: 'results_analysis',
        name: 'Results Analysis',
        description: 'Analyze A/B test results and make deployment decision',
        phase: 'ab_deployment_execution',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['ab_test_execution']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planAWSDeployment(config) {
    this.addPhase({
      id: 'aws_infrastructure',
      name: 'AWS Infrastructure Setup',
      description: 'Set up AWS infrastructure and services',
      duration: 5,
      priority: 'high'
    });

    const tasks = [
      {
        id: 'vpc_setup',
        name: 'VPC Setup',
        description: 'Configure VPC, subnets, and security groups',
        phase: 'aws_infrastructure',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'ecs_fargate_setup',
        name: 'ECS Fargate Setup',
        description: 'Configure ECS cluster and Fargate services',
        phase: 'aws_infrastructure',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'high'
      },
      {
        id: 'alb_setup',
        name: 'Application Load Balancer',
        description: 'Configure ALB with target groups',
        phase: 'aws_infrastructure',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    if (config.database) {
      tasks.push({
        id: 'rds_setup',
        name: 'RDS Database Setup',
        description: 'Configure RDS database with backup and monitoring',
        phase: 'aws_infrastructure',
        duration: 2,
        effort: 14,
        priority: 'high',
        complexity: 'medium'
      });
    }

    tasks.forEach(task => this.addTask(task));
  }

  async planKubernetesDeployment(config) {
    this.addPhase({
      id: 'k8s_cluster_setup',
      name: 'Kubernetes Cluster Setup',
      description: 'Set up and configure Kubernetes cluster',
      duration: 6,
      priority: 'high'
    });

    const tasks = [
      {
        id: 'cluster_provisioning',
        name: 'Cluster Provisioning',
        description: 'Provision Kubernetes cluster infrastructure',
        phase: 'k8s_cluster_setup',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'high'
      },
      {
        id: 'ingress_controller',
        name: 'Ingress Controller Setup',
        description: 'Install and configure ingress controller',
        phase: 'k8s_cluster_setup',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'helm_charts',
        name: 'Helm Charts',
        description: 'Create Helm charts for application deployment',
        phase: 'k8s_cluster_setup',
        duration: 2,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'namespace_setup',
        name: 'Namespace Setup',
        description: 'Configure namespaces and RBAC',
        phase: 'k8s_cluster_setup',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planServerlessDeployment(config) {
    this.addPhase({
      id: 'serverless_setup',
      name: 'Serverless Setup',
      description: 'Set up serverless deployment infrastructure',
      duration: 3,
      priority: 'high'
    });

    const tasks = [
      {
        id: 'sam_template',
        name: 'SAM Template',
        description: 'Create SAM template for serverless deployment',
        phase: 'serverless_setup',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'lambda_deployment',
        name: 'Lambda Deployment',
        description: 'Deploy Lambda functions with configuration',
        phase: 'serverless_setup',
        duration: 1,
        effort: 8,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  async planGenericPlatformDeployment(config) {
    this.addPhase({
      id: 'platform_setup',
      name: 'Platform Setup',
      description: 'Set up deployment platform infrastructure',
      duration: 4,
      priority: 'high'
    });

    const tasks = [
      {
        id: 'infrastructure_provisioning',
        name: 'Infrastructure Provisioning',
        description: 'Provision required infrastructure components',
        phase: 'platform_setup',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'application_deployment',
        name: 'Application Deployment',
        description: 'Deploy application to target platform',
        phase: 'platform_setup',
        duration: 2,
        effort: 14,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  addInfrastructureSetupTasks(config) {
    this.addPhase({
      id: 'infrastructure_setup',
      name: 'Infrastructure Setup',
      description: 'Set up core infrastructure components',
      duration: 4,
      priority: 'high'
    });

    const infraTasks = [
      {
        id: 'domain_ssl_setup',
        name: 'Domain and SSL Setup',
        description: 'Configure domain name and SSL certificates',
        phase: 'infrastructure_setup',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low'
      },
      {
        id: 'cicd_pipeline',
        name: 'CI/CD Pipeline',
        description: 'Set up continuous integration and deployment pipeline',
        phase: 'infrastructure_setup',
        duration: 3,
        effort: 20,
        priority: 'high',
        complexity: 'high'
      }
    ];

    if (config.cdn) {
      infraTasks.push({
        id: 'cdn_setup',
        name: 'CDN Setup',
        description: 'Configure CDN for global content delivery',
        phase: 'infrastructure_setup',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low'
      });
    }

    infraTasks.forEach(task => this.addTask(task));
  }

  addMonitoringTasks(config) {
    this.addPhase({
      id: 'monitoring_setup',
      name: 'Monitoring Setup',
      description: 'Set up monitoring, logging, and alerting',
      duration: 3,
      priority: 'medium'
    });

    const monitoringTasks = [
      {
        id: 'application_monitoring',
        name: 'Application Monitoring',
        description: 'Set up application performance monitoring',
        phase: 'monitoring_setup',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium'
      },
      {
        id: 'log_aggregation',
        name: 'Log Aggregation',
        description: 'Set up centralized log aggregation',
        phase: 'monitoring_setup',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium'
      },
      {
        id: 'alerting_setup',
        name: 'Alerting Setup',
        description: 'Configure alerts for critical metrics',
        phase: 'monitoring_setup',
        duration: 1,
        effort: 6,
        priority: 'medium',
        complexity: 'low'
      }
    ];

    monitoringTasks.forEach(task => this.addTask(task));
  }

  addSecurityTasks(config) {
    this.addPhase({
      id: 'security_hardening',
      name: 'Security Hardening',
      description: 'Implement security measures and compliance',
      duration: 3,
      priority: 'high'
    });

    const securityTasks = [
      {
        id: 'security_scan',
        name: 'Security Scanning',
        description: 'Run security scans and vulnerability assessments',
        phase: 'security_hardening',
        duration: 1,
        effort: 6,
        priority: 'high',
        complexity: 'low'
      },
      {
        id: 'access_control',
        name: 'Access Control',
        description: 'Implement role-based access control',
        phase: 'security_hardening',
        duration: 2,
        effort: 12,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    if (config.compliance.length > 0) {
      securityTasks.push({
        id: 'compliance_implementation',
        name: 'Compliance Implementation',
        description: `Implement ${config.compliance.join(', ')} compliance measures`,
        phase: 'security_hardening',
        duration: 2,
        effort: 16,
        priority: 'critical',
        complexity: 'high'
      });
    }

    securityTasks.forEach(task => this.addTask(task));
  }

  addBackupRecoveryTasks(config) {
    this.addPhase({
      id: 'backup_recovery',
      name: 'Backup & Recovery',
      description: 'Set up backup and disaster recovery procedures',
      duration: 2,
      priority: 'medium'
    });

    const backupTasks = [
      {
        id: 'backup_strategy',
        name: 'Backup Strategy',
        description: 'Implement automated backup strategy',
        phase: 'backup_recovery',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium'
      },
      {
        id: 'disaster_recovery',
        name: 'Disaster Recovery Plan',
        description: 'Create and test disaster recovery procedures',
        phase: 'backup_recovery',
        duration: 1,
        effort: 8,
        priority: 'medium',
        complexity: 'medium'
      }
    ];

    backupTasks.forEach(task => this.addTask(task));
  }

  identifyDeploymentRisks(config) {
    // Deployment complexity risk
    if (config.complexity === 'very_high') {
      this.addRisk({
        name: 'Deployment Complexity Risk',
        description: 'High deployment complexity may lead to failures and extended downtime',
        probability: 'medium',
        impact: 'high',
        category: 'deployment',
        mitigation: 'Implement comprehensive testing and rollback procedures'
      });
    }

    // Multi-region deployment risk
    if (config.regions.length > 1) {
      this.addRisk({
        name: 'Multi-Region Deployment Risk',
        description: 'Coordinating deployment across multiple regions increases complexity',
        probability: 'medium',
        impact: 'medium',
        category: 'deployment',
        mitigation: 'Use staged deployment approach with region-by-region rollout'
      });
    }

    // High availability risk
    if (parseFloat(config.availability) > 99.9) {
      this.addRisk({
        name: 'High Availability Risk',
        description: 'Achieving high availability requirements may be challenging',
        probability: 'medium',
        impact: 'high',
        category: 'availability',
        mitigation: 'Implement redundancy, auto-scaling, and comprehensive monitoring'
      });
    }

    // Platform dependency risk
    this.addRisk({
      name: 'Platform Dependency Risk',
      description: 'Dependency on specific platform may limit flexibility',
      probability: 'low',
      impact: 'medium',
      category: 'dependency',
      mitigation: 'Use Infrastructure as Code and containerization for portability'
    });

    // Security risk
    if (config.security === 'high' || config.compliance.length > 0) {
      this.addRisk({
        name: 'Security Compliance Risk',
        description: 'Meeting security and compliance requirements may impact deployment',
        probability: 'medium',
        impact: 'high',
        category: 'security',
        mitigation: 'Implement security testing in CI/CD pipeline and regular audits'
      });
    }

    // Rollback risk
    if (config.strategy === 'recreate') {
      this.addRisk({
        name: 'Rollback Risk',
        description: 'Recreate strategy has limited rollback capabilities',
        probability: 'medium',
        impact: 'medium',
        category: 'deployment',
        mitigation: 'Maintain comprehensive backups and quick restoration procedures'
      });
    }
  }

  planDeploymentResources(config) {
    // DevOps Engineer
    this.addResource({
      name: 'DevOps Engineer',
      type: 'human',
      role: 'devops_engineer',
      availability: 100,
      cost: 125,
      costType: 'hourly',
      skills: ['deployment', 'infrastructure', 'automation', config.platform]
    });

    // Site Reliability Engineer for high availability
    if (parseFloat(config.availability) > 99.9 || config.scale === 'large') {
      this.addResource({
        name: 'Site Reliability Engineer',
        type: 'human',
        role: 'sre',
        availability: 75,
        cost: 135,
        costType: 'hourly',
        skills: ['reliability', 'monitoring', 'incident_response', 'automation']
      });
    }

    // Cloud Architect for complex cloud deployments
    if (['aws', 'azure', 'gcp'].includes(config.platform) && config.complexity === 'very_high') {
      this.addResource({
        name: 'Cloud Architect',
        type: 'human',
        role: 'cloud_architect',
        availability: 50,
        cost: 150,
        costType: 'hourly',
        skills: ['cloud_architecture', config.platform, 'best_practices', 'cost_optimization']
      });
    }

    // Security Engineer for high security requirements
    if (config.security === 'high' || config.compliance.length > 0) {
      this.addResource({
        name: 'Security Engineer',
        type: 'human',
        role: 'security_engineer',
        availability: 40,
        cost: 140,
        costType: 'hourly',
        skills: ['security_hardening', 'compliance', 'vulnerability_assessment']
      });
    }

    // Database Administrator for database deployments
    if (config.database) {
      this.addResource({
        name: 'Database Administrator',
        type: 'human',
        role: 'dba',
        availability: 30,
        cost: 120,
        costType: 'hourly',
        skills: ['database_deployment', 'backup_recovery', 'performance_tuning']
      });
    }
  }
}

module.exports = { DeploymentPlanner };