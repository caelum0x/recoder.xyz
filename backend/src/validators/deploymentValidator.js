const { BaseValidator } = require('./baseValidator');
const { logger } = require('../utils/logger');

class DeploymentValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.registerDeploymentRules();
  }

  registerDeploymentRules() {
    // Deployment-specific validation rules
    this.registerRule('valid_environment_config', {
      check: (config) => this.validateEnvironmentConfig(config),
      message: 'Invalid environment configuration',
      severity: 'error'
    });

    this.registerRule('secure_secrets_management', {
      check: (secrets) => this.validateSecretsManagement(secrets),
      message: 'Insecure secrets management detected',
      severity: 'error'
    });

    this.registerRule('proper_resource_limits', {
      check: (resources) => this.validateResourceLimits(resources),
      message: 'Resource limits are not properly configured',
      severity: 'warning'
    });

    this.registerRule('health_checks_configured', {
      check: (healthChecks) => this.validateHealthChecks(healthChecks),
      message: 'Health checks are not properly configured',
      severity: 'warning'
    });

    this.registerRule('backup_strategy_defined', {
      check: (backup) => this.validateBackupStrategy(backup),
      message: 'Backup strategy is not defined or insufficient',
      severity: 'warning'
    });

    this.registerRule('monitoring_configured', {
      check: (monitoring) => this.validateMonitoringConfiguration(monitoring),
      message: 'Monitoring is not properly configured',
      severity: 'warning'
    });

    this.registerRule('scaling_strategy_defined', {
      check: (scaling) => this.validateScalingStrategy(scaling),
      message: 'Scaling strategy is not defined',
      severity: 'suggestion'
    });

    this.registerRule('disaster_recovery_plan', {
      check: (dr) => this.validateDisasterRecovery(dr),
      message: 'Disaster recovery plan is missing or incomplete',
      severity: 'warning'
    });

    this.registerRule('security_hardening', {
      check: (security) => this.validateSecurityHardening(security),
      message: 'Security hardening measures are insufficient',
      severity: 'error'
    });

    this.registerRule('cicd_pipeline_configured', {
      check: (cicd) => this.validateCICDPipeline(cicd),
      message: 'CI/CD pipeline is not properly configured',
      severity: 'warning'
    });

    this.registerRule('network_security_configured', {
      check: (network) => this.validateNetworkSecurity(network),
      message: 'Network security is not properly configured',
      severity: 'error'
    });

    this.registerRule('compliance_requirements_met', {
      check: (compliance) => this.validateComplianceRequirements(compliance),
      message: 'Compliance requirements are not met',
      severity: 'error'
    });
  }

  async validate(input, context = {}) {
    try {
      this.validateInput(input, ['platform', 'environment']);

      const result = await this.performAsyncValidation(input, async () => {
        this.reset();

        const deploymentConfig = this.analyzeDeploymentConfiguration(input);
        
        // Validate infrastructure configuration
        await this.validateInfrastructureConfiguration(deploymentConfig);
        
        // Validate application configuration
        this.validateApplicationConfiguration(deploymentConfig);
        
        // Validate security configuration
        this.validateSecurityConfiguration(deploymentConfig);
        
        // Validate operational readiness
        this.validateOperationalReadiness(deploymentConfig);
        
        // Validate compliance and governance
        this.validateComplianceAndGovernance(deploymentConfig);
        
        // Validate performance and scalability
        this.validatePerformanceAndScalability(deploymentConfig);
        
        return this.createValidationResult(true, {
          platform: deploymentConfig.platform,
          environment: deploymentConfig.environment,
          securityScore: this.calculateSecurityScore(deploymentConfig),
          readinessScore: this.calculateReadinessScore()
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeDeploymentConfiguration(input) {
    const config = {
      platform: input.platform,
      environment: input.environment,
      infrastructure: input.infrastructure || {},
      application: input.application || {},
      security: input.security || {},
      monitoring: input.monitoring || {},
      backup: input.backup || {},
      scaling: input.scaling || {},
      networking: input.networking || {},
      compliance: input.compliance || {},
      cicd: input.cicd || {},
      secrets: input.secrets || {},
      resources: input.resources || {},
      healthChecks: input.healthChecks || {},
      disasterRecovery: input.disasterRecovery || {}
    };

    return config;
  }

  async validateInfrastructureConfiguration(config) {
    // Platform-specific validation
    switch (config.platform) {
      case 'kubernetes':
        this.validateKubernetesInfrastructure(config);
        break;
      case 'aws':
        this.validateAWSInfrastructure(config);
        break;
      case 'azure':
        this.validateAzureInfrastructure(config);
        break;
      case 'gcp':
        this.validateGCPInfrastructure(config);
        break;
      case 'docker':
        this.validateDockerInfrastructure(config);
        break;
      default:
        this.validateGenericInfrastructure(config);
    }

    // Common infrastructure validations
    this.validateField('infrastructure', config.infrastructure, ['valid_environment_config']);
    this.validateField('resources', config.resources, ['proper_resource_limits']);
  }

  validateKubernetesInfrastructure(config) {
    const k8s = config.infrastructure.kubernetes || {};
    
    // Namespace validation
    if (!k8s.namespace) {
      this.addError('Kubernetes namespace must be specified');
    }
    
    // Resource quotas
    if (!k8s.resourceQuotas) {
      this.addWarning('Resource quotas should be defined for Kubernetes namespace');
    }
    
    // Network policies
    if (!k8s.networkPolicies) {
      this.addWarning('Network policies should be defined for security');
    }
    
    // Pod security policies
    if (!k8s.podSecurityPolicies && !k8s.podSecurityStandards) {
      this.addWarning('Pod security policies or standards should be configured');
    }
    
    // Service mesh
    if (k8s.serviceMesh) {
      this.validateServiceMeshConfiguration(k8s.serviceMesh);
    }
  }

  validateServiceMeshConfiguration(serviceMesh) {
    if (!serviceMesh.mTLS) {
      this.addWarning('Service mesh should enable mTLS for security');
    }
    
    if (!serviceMesh.observability) {
      this.addSuggestion('Enable observability features in service mesh');
    }
  }

  validateAWSInfrastructure(config) {
    const aws = config.infrastructure.aws || {};
    
    // VPC configuration
    if (!aws.vpc) {
      this.addError('VPC configuration is required for AWS deployment');
    } else {
      this.validateVPCConfiguration(aws.vpc);
    }
    
    // IAM roles and policies
    if (!aws.iam) {
      this.addWarning('IAM roles and policies should be explicitly defined');
    }
    
    // Security groups
    if (!aws.securityGroups) {
      this.addError('Security groups must be configured');
    }
    
    // Load balancer configuration
    if (aws.loadBalancer) {
      this.validateLoadBalancerConfiguration(aws.loadBalancer);
    }
  }

  validateVPCConfiguration(vpc) {
    if (!vpc.subnets || vpc.subnets.length < 2) {
      this.addWarning('VPC should have at least 2 subnets for high availability');
    }
    
    if (!vpc.internetGateway) {
      this.addWarning('Internet gateway configuration should be specified');
    }
    
    if (!vpc.routeTables) {
      this.addWarning('Route tables should be explicitly configured');
    }
  }

  validateLoadBalancerConfiguration(lb) {
    if (!lb.healthCheck) {
      this.addError('Load balancer health check must be configured');
    }
    
    if (!lb.ssl) {
      this.addWarning('SSL/TLS should be configured on load balancer');
    }
    
    if (lb.scheme === 'internet-facing' && !lb.securityGroups) {
      this.addError('Internet-facing load balancer must have security groups');
    }
  }

  validateAzureInfrastructure(config) {
    const azure = config.infrastructure.azure || {};
    
    // Resource group
    if (!azure.resourceGroup) {
      this.addError('Azure resource group must be specified');
    }
    
    // Virtual network
    if (!azure.virtualNetwork) {
      this.addWarning('Virtual network configuration should be specified');
    }
    
    // Application Gateway
    if (azure.applicationGateway) {
      this.validateApplicationGatewayConfiguration(azure.applicationGateway);
    }
  }

  validateApplicationGatewayConfiguration(appGw) {
    if (!appGw.wafPolicy) {
      this.addWarning('WAF policy should be configured on Application Gateway');
    }
    
    if (!appGw.ssl) {
      this.addWarning('SSL configuration should be enabled');
    }
  }

  validateGCPInfrastructure(config) {
    const gcp = config.infrastructure.gcp || {};
    
    // Project ID
    if (!gcp.projectId) {
      this.addError('GCP project ID must be specified');
    }
    
    // VPC network
    if (!gcp.network) {
      this.addWarning('VPC network configuration should be specified');
    }
    
    // Firewall rules
    if (!gcp.firewallRules) {
      this.addWarning('Firewall rules should be configured');
    }
  }

  validateDockerInfrastructure(config) {
    const docker = config.infrastructure.docker || {};
    
    // Docker Compose validation
    if (docker.compose) {
      this.validateDockerComposeConfiguration(docker.compose);
    }
    
    // Registry configuration
    if (!docker.registry) {
      this.addWarning('Container registry should be configured');
    }
    
    // Base image security
    if (docker.baseImages) {
      this.validateBaseImageSecurity(docker.baseImages);
    }
  }

  validateDockerComposeConfiguration(compose) {
    if (!compose.version) {
      this.addError('Docker Compose version must be specified');
    }
    
    if (!compose.services || Object.keys(compose.services).length === 0) {
      this.addError('At least one service must be defined in Docker Compose');
    }
    
    // Check for health checks in services
    for (const [serviceName, service] of Object.entries(compose.services)) {
      if (!service.healthcheck) {
        this.addWarning(`Service ${serviceName} should have health check configured`);
      }
    }
  }

  validateBaseImageSecurity(baseImages) {
    for (const image of baseImages) {
      if (image.includes(':latest')) {
        this.addWarning(`Base image ${image} uses 'latest' tag, specify exact version`);
      }
      
      if (!image.includes('@sha256:')) {
        this.addSuggestion(`Consider using digest for image ${image} for immutability`);
      }
    }
  }

  validateGenericInfrastructure(config) {
    const infra = config.infrastructure;
    
    if (!infra.servers && !infra.containers && !infra.serverless) {
      this.addError('Infrastructure configuration must specify deployment target');
    }
    
    if (infra.servers) {
      this.validateServerConfiguration(infra.servers);
    }
  }

  validateServerConfiguration(servers) {
    for (const server of servers) {
      if (!server.hostname) {
        this.addError('Server hostname must be specified');
      }
      
      if (!server.ssh && !server.credentials) {
        this.addError('Server access method (SSH or credentials) must be configured');
      }
      
      if (server.ssh && server.ssh.password) {
        this.addWarning('SSH password authentication is less secure than key-based auth');
      }
    }
  }

  validateApplicationConfiguration(config) {
    const app = config.application;
    
    // Environment variables validation
    if (app.environmentVariables) {
      this.validateEnvironmentVariables(app.environmentVariables);
    }
    
    // Configuration files validation
    if (app.configFiles) {
      this.validateConfigurationFiles(app.configFiles);
    }
    
    // Dependencies validation
    if (app.dependencies) {
      this.validateApplicationDependencies(app.dependencies);
    }
    
    // Runtime configuration
    if (app.runtime) {
      this.validateRuntimeConfiguration(app.runtime);
    }
  }

  validateEnvironmentVariables(envVars) {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i
    ];
    
    for (const [key, value] of Object.entries(envVars)) {
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      
      if (isSensitive && typeof value === 'string' && !value.startsWith('${')) {
        this.addError(`Environment variable ${key} contains hardcoded sensitive value`);
      }
      
      if (key.toLowerCase() === 'debug' && value === 'true') {
        this.addWarning('Debug mode is enabled, ensure this is intended for production');
      }
    }
  }

  validateConfigurationFiles(configFiles) {
    for (const [fileName, config] of Object.entries(configFiles)) {
      if (fileName.endsWith('.json')) {
        if (!this.validateJSON(JSON.stringify(config), fileName)) {
          // Error already added by validateJSON
        }
      }
      
      if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
        this.validateYAMLConfiguration(config, fileName);
      }
    }
  }

  validateYAMLConfiguration(config, fileName) {
    // Basic YAML structure validation
    if (typeof config !== 'object') {
      this.addError(`Configuration file ${fileName} should be a valid object`);
    }
  }

  validateApplicationDependencies(dependencies) {
    for (const dep of dependencies) {
      if (dep.version === 'latest') {
        this.addWarning(`Dependency ${dep.name} uses 'latest' version, specify exact version`);
      }
      
      if (!dep.version) {
        this.addError(`Dependency ${dep.name} must specify version`);
      }
    }
  }

  validateRuntimeConfiguration(runtime) {
    if (!runtime.version) {
      this.addError('Runtime version must be specified');
    }
    
    if (runtime.memory && runtime.memory < '128Mi') {
      this.addWarning('Runtime memory allocation seems very low');
    }
    
    if (runtime.cpu && parseFloat(runtime.cpu) < 0.1) {
      this.addWarning('Runtime CPU allocation seems very low');
    }
  }

  validateSecurityConfiguration(config) {
    // Secrets management validation
    this.validateField('secrets', config.secrets, ['secure_secrets_management']);
    
    // Security hardening validation
    this.validateField('security', config.security, ['security_hardening']);
    
    // Network security validation
    this.validateField('networking', config.networking, ['network_security_configured']);
    
    // Access control validation
    this.validateAccessControl(config.security);
    
    // Encryption validation
    this.validateEncryptionConfiguration(config.security);
  }

  validateAccessControl(security) {
    if (!security.rbac && !security.accessControl) {
      this.addWarning('Role-based access control (RBAC) should be configured');
    }
    
    if (security.rbac) {
      this.validateRBACConfiguration(security.rbac);
    }
  }

  validateRBACConfiguration(rbac) {
    if (!rbac.roles || rbac.roles.length === 0) {
      this.addError('RBAC roles must be defined');
    }
    
    if (!rbac.bindings || rbac.bindings.length === 0) {
      this.addError('RBAC role bindings must be defined');
    }
    
    // Check for overly permissive roles
    for (const role of rbac.roles || []) {
      if (role.permissions && role.permissions.includes('*')) {
        this.addWarning(`Role ${role.name} has wildcard permissions, consider more specific permissions`);
      }
    }
  }

  validateEncryptionConfiguration(security) {
    if (!security.encryption) {
      this.addWarning('Encryption configuration should be specified');
      return;
    }
    
    const encryption = security.encryption;
    
    if (!encryption.atRest) {
      this.addWarning('Encryption at rest should be configured');
    }
    
    if (!encryption.inTransit) {
      this.addWarning('Encryption in transit should be configured');
    }
    
    if (encryption.algorithm && !['AES-256', 'ChaCha20'].includes(encryption.algorithm)) {
      this.addWarning('Consider using stronger encryption algorithms');
    }
  }

  validateOperationalReadiness(config) {
    // Health checks validation
    this.validateField('healthChecks', config.healthChecks, ['health_checks_configured']);
    
    // Monitoring validation
    this.validateField('monitoring', config.monitoring, ['monitoring_configured']);
    
    // Backup strategy validation
    this.validateField('backup', config.backup, ['backup_strategy_defined']);
    
    // CI/CD pipeline validation
    this.validateField('cicd', config.cicd, ['cicd_pipeline_configured']);
    
    // Logging configuration
    this.validateLoggingConfiguration(config.monitoring);
  }

  validateLoggingConfiguration(monitoring) {
    if (!monitoring.logging) {
      this.addWarning('Logging configuration should be specified');
      return;
    }
    
    const logging = monitoring.logging;
    
    if (!logging.level) {
      this.addSuggestion('Log level should be configured');
    }
    
    if (logging.level === 'debug' && config.environment === 'production') {
      this.addWarning('Debug logging in production may impact performance');
    }
    
    if (!logging.retention) {
      this.addWarning('Log retention policy should be configured');
    }
  }

  validateComplianceAndGovernance(config) {
    // Compliance requirements validation
    this.validateField('compliance', config.compliance, ['compliance_requirements_met']);
    
    // Disaster recovery validation
    this.validateField('disasterRecovery', config.disasterRecovery, ['disaster_recovery_plan']);
    
    // Audit logging
    this.validateAuditLogging(config.compliance);
  }

  validateAuditLogging(compliance) {
    if (compliance.requirements && compliance.requirements.includes('SOX', 'HIPAA', 'PCI-DSS')) {
      if (!compliance.auditLogging) {
        this.addError('Audit logging is required for compliance');
      }
    }
  }

  validatePerformanceAndScalability(config) {
    // Scaling strategy validation
    this.validateField('scaling', config.scaling, ['scaling_strategy_defined']);
    
    // Resource limits validation
    this.validateField('resources', config.resources, ['proper_resource_limits']);
    
    // Performance testing
    this.validatePerformanceTestingStrategy(config);
  }

  validatePerformanceTestingStrategy(config) {
    if (!config.testing || !config.testing.performance) {
      this.addSuggestion('Performance testing strategy should be defined');
      return;
    }
    
    const perfTesting = config.testing.performance;
    
    if (!perfTesting.loadTesting) {
      this.addSuggestion('Load testing should be configured');
    }
    
    if (!perfTesting.stressTesting) {
      this.addSuggestion('Stress testing should be configured');
    }
  }

  calculateSecurityScore(config) {
    let score = 0;
    const maxScore = 100;
    
    // Secrets management
    if (this.validateSecretsManagement(config.secrets)) score += 20;
    
    // Network security
    if (this.validateNetworkSecurity(config.networking)) score += 20;
    
    // Encryption
    if (config.security.encryption) score += 15;
    
    // Access control
    if (config.security.rbac || config.security.accessControl) score += 15;
    
    // Security monitoring
    if (config.monitoring.security) score += 10;
    
    // Compliance
    if (config.compliance.requirements) score += 10;
    
    // Audit logging
    if (config.compliance.auditLogging) score += 10;
    
    return Math.round((score / maxScore) * 100);
  }

  calculateReadinessScore() {
    const errors = this.results.errors.length;
    const warnings = this.results.warnings.length;
    
    let score = 100;
    score -= errors * 10;
    score -= warnings * 3;
    
    return Math.max(0, score);
  }

  // Rule implementation methods
  validateEnvironmentConfig(config) {
    if (!config.name || !config.type) {
      return false;
    }
    
    const validTypes = ['development', 'staging', 'production', 'test'];
    return validTypes.includes(config.type);
  }

  validateSecretsManagement(secrets) {
    if (!secrets || Object.keys(secrets).length === 0) {
      return true; // No secrets to validate
    }
    
    // Check for external secret management
    return secrets.provider && secrets.provider !== 'hardcoded';
  }

  validateResourceLimits(resources) {
    if (!resources) return false;
    
    // Check for memory and CPU limits
    return resources.memory && resources.cpu;
  }

  validateHealthChecks(healthChecks) {
    if (!healthChecks) return false;
    
    return healthChecks.liveness && healthChecks.readiness;
  }

  validateBackupStrategy(backup) {
    if (!backup) return false;
    
    return backup.schedule && backup.retention;
  }

  validateMonitoringConfiguration(monitoring) {
    if (!monitoring) return false;
    
    return monitoring.metrics && monitoring.alerting;
  }

  validateScalingStrategy(scaling) {
    if (!scaling) return false;
    
    return scaling.horizontal || scaling.vertical;
  }

  validateDisasterRecovery(dr) {
    if (!dr) return false;
    
    return dr.rto && dr.rpo && dr.procedures;
  }

  validateSecurityHardening(security) {
    if (!security) return false;
    
    return security.containerSecurity || security.networkSecurity || security.accessControl;
  }

  validateCICDPipeline(cicd) {
    if (!cicd) return false;
    
    return cicd.stages && cicd.stages.length > 0;
  }

  validateNetworkSecurity(network) {
    if (!network) return false;
    
    return network.firewalls || network.securityGroups || network.networkPolicies;
  }

  validateComplianceRequirements(compliance) {
    if (!compliance || !compliance.requirements) {
      return true; // No compliance requirements
    }
    
    // Check if controls are defined for each requirement
    return compliance.controls && compliance.controls.length > 0;
  }
}

module.exports = { DeploymentValidator };