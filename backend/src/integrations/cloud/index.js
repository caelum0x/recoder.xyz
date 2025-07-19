const { AWSIntegration } = require('./aws');
const { GCPIntegration } = require('./gcp');
const { AzureIntegration } = require('./azure');

class CloudIntegrationManager {
  constructor() {
    this.integrations = {
      aws: null,
      gcp: null,
      azure: null
    };
    this.activeProvider = null;
    this.fallbackProviders = [];
  }

  initializeAWS(options = {}) {
    this.integrations.aws = new AWSIntegration(options);
    return this.integrations.aws;
  }

  initializeGCP(options = {}) {
    this.integrations.gcp = new GCPIntegration(options);
    return this.integrations.gcp;
  }

  initializeAzure(options = {}) {
    this.integrations.azure = new AzureIntegration(options);
    return this.integrations.azure;
  }

  getIntegration(provider) {
    const integration = this.integrations[provider.toLowerCase()];
    if (!integration) {
      throw new Error(`${provider} integration not initialized`);
    }
    return integration;
  }

  setActiveProvider(provider) {
    if (!this.integrations[provider.toLowerCase()]) {
      throw new Error(`${provider} integration not initialized`);
    }
    this.activeProvider = provider.toLowerCase();
  }

  setFallbackProviders(providers) {
    this.fallbackProviders = providers.map(p => p.toLowerCase());
  }

  getActiveIntegration() {
    if (!this.activeProvider) {
      throw new Error('No active cloud provider set');
    }
    return this.integrations[this.activeProvider];
  }

  async createComputeInstance(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    try {
      const integration = this.getIntegration(targetProvider);
      
      switch (targetProvider) {
        case 'aws':
          return await integration.createEC2Instance(options);
        case 'gcp':
          return await integration.createComputeInstance(options);
        case 'azure':
          return await integration.createVirtualMachine(options);
        default:
          throw new Error(`Unsupported cloud provider: ${targetProvider}`);
      }
    } catch (error) {
      if (this.fallbackProviders.length > 0) {
        return await this.tryFallbackProviders('createComputeInstance', options);
      }
      throw error;
    }
  }

  async listComputeInstances(provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.listEC2Instances();
      case 'gcp':
        return await integration.listComputeInstances();
      case 'azure':
        return await integration.listVirtualMachines();
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  async createStorage(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    try {
      const integration = this.getIntegration(targetProvider);
      
      switch (targetProvider) {
        case 'aws':
          return await integration.createS3Bucket(options);
        case 'gcp':
          return await integration.createStorageBucket(options);
        case 'azure':
          return await integration.createStorageAccount(options);
        default:
          throw new Error(`Unsupported cloud provider: ${targetProvider}`);
      }
    } catch (error) {
      if (this.fallbackProviders.length > 0) {
        return await this.tryFallbackProviders('createStorage', options);
      }
      throw error;
    }
  }

  async uploadFile(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.uploadToS3(options);
      case 'gcp':
        return await integration.uploadToStorage(options);
      case 'azure':
        return await integration.uploadToBlob(options);
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  async createDatabase(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.createRDSInstance(options);
      case 'gcp':
        return await integration.createCloudSQLInstance(options);
      case 'azure':
        return await integration.createSQLDatabase(options);
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  async createKubernetesCluster(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.createEKSCluster(options);
      case 'gcp':
        return await integration.createGKECluster(options);
      case 'azure':
        return await integration.createAKSCluster(options);
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  async createServerlessFunction(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.createLambdaFunction(options);
      case 'gcp':
        return await integration.createCloudFunction(options);
      case 'azure':
        return await integration.createAzureFunction(options);
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  async tryFallbackProviders(method, options) {
    for (const provider of this.fallbackProviders) {
      try {
        switch (method) {
          case 'createComputeInstance':
            return await this.createComputeInstance(options, provider);
          case 'createStorage':
            return await this.createStorage(options, provider);
          default:
            continue;
        }
      } catch (error) {
        console.warn(`Fallback provider ${provider} failed:`, error.message);
        continue;
      }
    }
    
    throw new Error('All cloud providers failed');
  }

  getProviderCapabilities(provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const capabilities = {
      aws: {
        compute: ['EC2', 'Lambda', 'ECS', 'EKS', 'Fargate'],
        storage: ['S3', 'EBS', 'EFS'],
        database: ['RDS', 'DynamoDB', 'ElastiCache'],
        networking: ['VPC', 'CloudFront', 'Route 53'],
        ml: ['SageMaker', 'Rekognition', 'Comprehend'],
        regions: 25,
        freeTier: true,
        iaac: 'CloudFormation'
      },
      gcp: {
        compute: ['Compute Engine', 'Cloud Functions', 'Cloud Run', 'GKE'],
        storage: ['Cloud Storage', 'Persistent Disk'],
        database: ['Cloud SQL', 'Firestore', 'BigQuery'],
        networking: ['VPC', 'Cloud CDN', 'Cloud DNS'],
        ml: ['AI Platform', 'Vision API', 'Natural Language API'],
        regions: 24,
        freeTier: true,
        iaac: 'Deployment Manager'
      },
      azure: {
        compute: ['Virtual Machines', 'Azure Functions', 'Container Instances', 'AKS'],
        storage: ['Blob Storage', 'Disk Storage'],
        database: ['Azure SQL', 'Cosmos DB', 'MySQL'],
        networking: ['Virtual Network', 'CDN', 'DNS'],
        ml: ['Machine Learning', 'Cognitive Services'],
        regions: 60,
        freeTier: true,
        iaac: 'ARM Templates'
      }
    };

    return capabilities[targetProvider] || {};
  }

  async compareProviders() {
    const results = {};
    
    for (const [provider, integration] of Object.entries(this.integrations)) {
      if (integration) {
        try {
          const capabilities = this.getProviderCapabilities(provider);
          const pricing = await this.getProviderPricing(provider);
          
          results[provider] = {
            initialized: true,
            capabilities: capabilities,
            pricing: pricing,
            status: 'available'
          };
        } catch (error) {
          results[provider] = {
            initialized: true,
            status: 'error',
            error: error.message
          };
        }
      } else {
        results[provider] = {
          initialized: false,
          status: 'not_configured'
        };
      }
    }
    
    return results;
  }

  async getProviderPricing(provider) {
    // Simplified pricing - in practice, use provider pricing APIs
    const pricing = {
      aws: {
        compute: {
          't2.micro': { hourly: 0.0116, monthly: 8.35 },
          't2.small': { hourly: 0.023, monthly: 16.70 },
          't3.micro': { hourly: 0.0104, monthly: 7.59 }
        },
        storage: {
          's3_standard': { gb_monthly: 0.023 },
          'ebs_gp2': { gb_monthly: 0.10 }
        }
      },
      gcp: {
        compute: {
          'e2-micro': { hourly: 0.0084, monthly: 6.11 },
          'e2-small': { hourly: 0.0336, monthly: 24.50 },
          'n1-standard-1': { hourly: 0.0475, monthly: 34.67 }
        },
        storage: {
          'cloud_storage_standard': { gb_monthly: 0.020 },
          'persistent_disk': { gb_monthly: 0.04 }
        }
      },
      azure: {
        compute: {
          'Standard_B1s': { hourly: 0.0104, monthly: 7.59 },
          'Standard_B1ms': { hourly: 0.0207, monthly: 15.11 },
          'Standard_DS1_v2': { hourly: 0.0580, monthly: 42.34 }
        },
        storage: {
          'blob_storage': { gb_monthly: 0.018 },
          'managed_disk': { gb_monthly: 0.048 }
        }
      }
    };

    return pricing[provider] || {};
  }

  async estimateCosts(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    return await integration.estimateCosts(options);
  }

  async getRegions(provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.getRegions();
      case 'gcp':
        return await integration.listRegions();
      case 'azure':
        return await integration.listLocations();
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  async getAccountInfo(provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return await integration.getAccountInfo();
      case 'gcp':
        return await integration.getProjectInfo();
      case 'azure':
        return await integration.getSubscriptionInfo();
      default:
        throw new Error(`Unsupported cloud provider: ${targetProvider}`);
    }
  }

  generateInfrastructureAsCode(options) {
    const { provider, templateType = 'basic', resources = [] } = options;
    const targetProvider = provider || this.activeProvider;

    if (!targetProvider) {
      throw new Error('No cloud provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'aws':
        return integration.generateCloudFormationTemplate({
          templateType,
          resources
        });
      case 'gcp':
        return integration.generateDeploymentManagerTemplate({
          templateType,
          resources
        });
      case 'azure':
        return integration.generateARMTemplate({
          templateType,
          resources
        });
      default:
        throw new Error(`IaC generation not supported for provider: ${targetProvider}`);
    }
  }

  async multiCloudDeploy(options) {
    const { 
      primaryProvider, 
      backupProvider, 
      deploymentConfig,
      loadBalancing = false 
    } = options;

    const results = {};

    try {
      // Deploy to primary provider
      const primaryResult = await this.createComputeInstance(
        deploymentConfig, 
        primaryProvider
      );
      results.primary = { provider: primaryProvider, result: primaryResult };

      // Deploy to backup provider if specified
      if (backupProvider && primaryResult.success) {
        const backupResult = await this.createComputeInstance(
          deploymentConfig, 
          backupProvider
        );
        results.backup = { provider: backupProvider, result: backupResult };
      }

      return {
        success: true,
        deployments: results,
        loadBalancing: loadBalancing
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        deployments: results
      };
    }
  }

  getAllProviders() {
    return Object.keys(this.integrations).filter(provider => 
      this.integrations[provider] !== null
    );
  }

  getActiveProvider() {
    return this.activeProvider;
  }

  getFallbackProviders() {
    return this.fallbackProviders;
  }

  // Health check for all providers
  async healthCheck() {
    const results = {};
    
    for (const [provider, integration] of Object.entries(this.integrations)) {
      if (integration) {
        try {
          switch (provider) {
            case 'aws':
              const awsAccount = await integration.getAccountInfo();
              results[provider] = { 
                healthy: awsAccount.success, 
                message: awsAccount.success ? 'Connected' : 'Failed to get account info' 
              };
              break;
            case 'gcp':
              const gcpProject = await integration.getProjectInfo();
              results[provider] = { 
                healthy: gcpProject.success, 
                message: gcpProject.success ? 'Connected' : 'Failed to get project info' 
              };
              break;
            case 'azure':
              const azureSubscription = await integration.getSubscriptionInfo();
              results[provider] = { 
                healthy: azureSubscription.success, 
                message: azureSubscription.success ? 'Connected' : 'Failed to get subscription info' 
              };
              break;
          }
        } catch (error) {
          results[provider] = { healthy: false, message: error.message };
        }
      } else {
        results[provider] = { healthy: false, message: 'Not initialized' };
      }
    }
    
    return results;
  }
}

// Export all cloud integrations
module.exports = {
  CloudIntegrationManager,
  AWSIntegration,
  GCPIntegration,
  AzureIntegration
};