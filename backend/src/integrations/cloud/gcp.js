const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { logger } = require('../../utils/logger');

class GCPIntegration {
  constructor(options = {}) {
    this.projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT;
    this.keyFilename = options.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    this.region = options.region || process.env.GOOGLE_CLOUD_REGION || 'us-central1';
    this.zone = options.zone || process.env.GOOGLE_CLOUD_ZONE || 'us-central1-a';
    
    if (!this.projectId) {
      throw new Error('Google Cloud Project ID is required');
    }

    this.auth = new GoogleAuth({
      keyFilename: this.keyFilename,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/devstorage.full_control'
      ]
    });

    // Initialize Google Cloud services
    this.compute = google.compute('v1');
    this.storage = google.storage('v1');
    this.cloudfunctions = google.cloudfunctions('v1');
    this.sql = google.sql('v1');
    this.container = google.container('v1');
    this.run = google.run('v1');
    this.cloudresourcemanager = google.cloudresourcemanager('v1');
    this.monitoring = google.monitoring('v3');
    this.logging = google.logging('v2');
    this.dns = google.dns('v1');
  }

  async authenticate() {
    try {
      const authClient = await this.auth.getClient();
      google.options({ auth: authClient });
      return authClient;
    } catch (error) {
      logger.error('Failed to authenticate with Google Cloud:', error);
      throw error;
    }
  }

  // Compute Engine Operations
  async createComputeInstance(options) {
    await this.authenticate();

    const {
      name,
      machineType = 'e2-micro',
      sourceImage = 'projects/debian-cloud/global/images/family/debian-11',
      networkInterface = 'default',
      accessConfigs = [{ type: 'ONE_TO_ONE_NAT', name: 'External NAT' }],
      metadata = {},
      tags = []
    } = options;

    try {
      const instanceConfig = {
        name: name,
        machineType: `zones/${this.zone}/machineTypes/${machineType}`,
        disks: [{
          boot: true,
          autoDelete: true,
          initializeParams: {
            sourceImage: sourceImage
          }
        }],
        networkInterfaces: [{
          network: `projects/${this.projectId}/global/networks/${networkInterface}`,
          accessConfigs: accessConfigs
        }],
        metadata: {
          items: Object.entries(metadata).map(([key, value]) => ({ key, value }))
        },
        tags: {
          items: tags
        }
      };

      const response = await this.compute.instances.insert({
        project: this.projectId,
        zone: this.zone,
        requestBody: instanceConfig
      });

      return {
        success: true,
        instance: {
          name: name,
          zone: this.zone,
          machineType: machineType,
          status: 'PROVISIONING',
          operationId: response.data.name
        }
      };
    } catch (error) {
      logger.error('Failed to create Compute Engine instance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listComputeInstances() {
    await this.authenticate();

    try {
      const response = await this.compute.instances.list({
        project: this.projectId,
        zone: this.zone
      });

      const instances = response.data.items?.map(instance => ({
        name: instance.name,
        status: instance.status,
        machineType: instance.machineType.split('/').pop(),
        zone: instance.zone.split('/').pop(),
        creationTimestamp: instance.creationTimestamp,
        externalIP: instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP,
        internalIP: instance.networkInterfaces?.[0]?.networkIP
      })) || [];

      return {
        success: true,
        instances: instances
      };
    } catch (error) {
      logger.error('Failed to list Compute Engine instances:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteComputeInstance(instanceName) {
    await this.authenticate();

    try {
      const response = await this.compute.instances.delete({
        project: this.projectId,
        zone: this.zone,
        instance: instanceName
      });

      return {
        success: true,
        instanceName: instanceName,
        operationId: response.data.name,
        action: 'deleted'
      };
    } catch (error) {
      logger.error('Failed to delete Compute Engine instance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cloud Storage Operations
  async createStorageBucket(options) {
    await this.authenticate();

    const { 
      bucketName, 
      location = this.region,
      storageClass = 'STANDARD' 
    } = options;

    try {
      const bucketConfig = {
        name: bucketName,
        location: location,
        storageClass: storageClass
      };

      const response = await this.storage.buckets.insert({
        project: this.projectId,
        requestBody: bucketConfig
      });

      return {
        success: true,
        bucket: {
          name: response.data.name,
          location: response.data.location,
          storageClass: response.data.storageClass,
          timeCreated: response.data.timeCreated
        }
      };
    } catch (error) {
      logger.error('Failed to create Cloud Storage bucket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async uploadToStorage(options) {
    await this.authenticate();

    const { bucketName, fileName, fileContent, contentType } = options;

    try {
      const { Storage } = require('@google-cloud/storage');
      const storage = new Storage({
        projectId: this.projectId,
        keyFilename: this.keyFilename
      });

      const bucket = storage.bucket(bucketName);
      const file = bucket.file(fileName);

      const stream = file.createWriteStream({
        metadata: {
          contentType: contentType
        }
      });

      return new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          logger.error('Failed to upload to Cloud Storage:', error);
          resolve({
            success: false,
            error: error.message
          });
        });

        stream.on('finish', () => {
          resolve({
            success: true,
            file: {
              bucket: bucketName,
              name: fileName,
              contentType: contentType
            }
          });
        });

        stream.end(fileContent);
      });
    } catch (error) {
      logger.error('Failed to upload to Cloud Storage:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cloud Functions Operations
  async createCloudFunction(options) {
    await this.authenticate();

    const {
      functionName,
      sourceArchiveUrl,
      entryPoint = 'main',
      runtime = 'nodejs18',
      httpsTrigger = true,
      environmentVariables = {},
      availableMemoryMb = 256,
      timeout = '60s'
    } = options;

    try {
      const functionConfig = {
        name: `projects/${this.projectId}/locations/${this.region}/functions/${functionName}`,
        sourceArchiveUrl: sourceArchiveUrl,
        entryPoint: entryPoint,
        runtime: runtime,
        environmentVariables: environmentVariables,
        availableMemoryMb: availableMemoryMb,
        timeout: timeout
      };

      if (httpsTrigger) {
        functionConfig.httpsTrigger = {};
      }

      const response = await this.cloudfunctions.projects.locations.functions.create({
        location: `projects/${this.projectId}/locations/${this.region}`,
        requestBody: functionConfig
      });

      return {
        success: true,
        function: {
          name: functionName,
          location: this.region,
          runtime: runtime,
          status: 'DEPLOYING',
          operationId: response.data.name
        }
      };
    } catch (error) {
      logger.error('Failed to create Cloud Function:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cloud SQL Operations
  async createCloudSQLInstance(options) {
    await this.authenticate();

    const {
      instanceId,
      databaseVersion = 'MYSQL_8_0',
      tier = 'db-f1-micro',
      region = this.region,
      rootPassword
    } = options;

    try {
      const instanceConfig = {
        name: instanceId,
        databaseVersion: databaseVersion,
        region: region,
        settings: {
          tier: tier,
          backupConfiguration: {
            enabled: true
          },
          ipConfiguration: {
            ipv4Enabled: true,
            authorizedNetworks: [{
              value: '0.0.0.0/0',
              name: 'all'
            }]
          }
        }
      };

      if (rootPassword) {
        instanceConfig.rootPassword = rootPassword;
      }

      const response = await this.sql.instances.insert({
        project: this.projectId,
        requestBody: instanceConfig
      });

      return {
        success: true,
        instance: {
          name: instanceId,
          databaseVersion: databaseVersion,
          region: region,
          tier: tier,
          state: 'CREATING',
          operationId: response.data.name
        }
      };
    } catch (error) {
      logger.error('Failed to create Cloud SQL instance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Google Kubernetes Engine Operations
  async createGKECluster(options) {
    await this.authenticate();

    const {
      clusterName,
      nodeCount = 3,
      machineType = 'e2-medium',
      diskSizeGb = 100,
      zone = this.zone
    } = options;

    try {
      const clusterConfig = {
        cluster: {
          name: clusterName,
          location: zone,
          initialNodeCount: nodeCount,
          nodeConfig: {
            machineType: machineType,
            diskSizeGb: diskSizeGb,
            oauthScopes: [
              'https://www.googleapis.com/auth/devstorage.read_only',
              'https://www.googleapis.com/auth/logging.write',
              'https://www.googleapis.com/auth/monitoring'
            ]
          }
        }
      };

      const response = await this.container.projects.zones.clusters.create({
        projectId: this.projectId,
        zone: zone,
        requestBody: clusterConfig
      });

      return {
        success: true,
        cluster: {
          name: clusterName,
          zone: zone,
          nodeCount: nodeCount,
          status: 'PROVISIONING',
          operationId: response.data.name
        }
      };
    } catch (error) {
      logger.error('Failed to create GKE cluster:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cloud Run Operations
  async deployCloudRunService(options) {
    await this.authenticate();

    const {
      serviceName,
      containerImage,
      port = 8080,
      environmentVariables = {},
      memory = '512Mi',
      cpu = '1000m'
    } = options;

    try {
      const serviceConfig = {
        apiVersion: 'serving.knative.dev/v1',
        kind: 'Service',
        metadata: {
          name: serviceName,
          namespace: this.projectId
        },
        spec: {
          template: {
            metadata: {
              annotations: {
                'autoscaling.knative.dev/maxScale': '100'
              }
            },
            spec: {
              containers: [{
                image: containerImage,
                ports: [{
                  containerPort: port
                }],
                env: Object.entries(environmentVariables).map(([name, value]) => ({
                  name,
                  value
                })),
                resources: {
                  limits: {
                    memory: memory,
                    cpu: cpu
                  }
                }
              }]
            }
          },
          traffic: [{
            percent: 100,
            latestRevision: true
          }]
        }
      };

      const response = await this.run.projects.locations.services.replaceService({
        name: `projects/${this.projectId}/locations/${this.region}/services/${serviceName}`,
        requestBody: serviceConfig
      });

      return {
        success: true,
        service: {
          name: serviceName,
          region: this.region,
          image: containerImage,
          url: response.data.status?.url,
          status: response.data.status?.conditions?.[0]?.status
        }
      };
    } catch (error) {
      logger.error('Failed to deploy Cloud Run service:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Project Operations
  async getProjectInfo() {
    await this.authenticate();

    try {
      const response = await this.cloudresourcemanager.projects.get({
        projectId: this.projectId
      });

      return {
        success: true,
        project: {
          projectId: response.data.projectId,
          name: response.data.name,
          projectNumber: response.data.projectNumber,
          lifecycleState: response.data.lifecycleState,
          createTime: response.data.createTime
        }
      };
    } catch (error) {
      logger.error('Failed to get project info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listRegions() {
    await this.authenticate();

    try {
      const response = await this.compute.regions.list({
        project: this.projectId
      });

      const regions = response.data.items?.map(region => ({
        name: region.name,
        description: region.description,
        status: region.status,
        zones: region.zones?.map(zone => zone.split('/').pop()) || []
      })) || [];

      return {
        success: true,
        regions: regions
      };
    } catch (error) {
      logger.error('Failed to list regions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async estimateCosts(options) {
    const {
      machineType = 'e2-micro',
      instanceCount = 1,
      diskSizeGB = 20,
      region = this.region
    } = options;

    // This is a simplified cost estimation
    // In practice, you would use Google Cloud Pricing API
    const pricing = {
      'e2-micro': 0.0084, // per hour
      'e2-small': 0.0336,
      'e2-medium': 0.0672,
      'n1-standard-1': 0.0475,
      'n1-standard-2': 0.0950,
      'n1-standard-4': 0.1900
    };

    const diskPrice = 0.04; // per GB per month

    const instanceHourlyCost = pricing[machineType] || 0.02;
    const monthlyCost = (instanceHourlyCost * 24 * 30 * instanceCount) + (diskSizeGB * diskPrice);

    return {
      success: true,
      estimate: {
        machineType: machineType,
        instanceCount: instanceCount,
        diskSizeGB: diskSizeGB,
        region: region,
        hourlyCost: instanceHourlyCost * instanceCount,
        dailyCost: instanceHourlyCost * 24 * instanceCount,
        monthlyCost: monthlyCost,
        currency: 'USD'
      }
    };
  }

  // Configuration methods
  setProjectId(projectId) {
    this.projectId = projectId;
  }

  setRegion(region) {
    this.region = region;
  }

  setZone(zone) {
    this.zone = zone;
  }

  setKeyFilename(keyFilename) {
    this.keyFilename = keyFilename;
    this.auth = new GoogleAuth({
      keyFilename: keyFilename,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/devstorage.full_control'
      ]
    });
  }

  // Generate Deployment Manager template
  generateDeploymentManagerTemplate(options) {
    const {
      templateType = 'vm',
      includeNetwork = true,
      includeFirewall = true,
      includeDatabase = false
    } = options;

    const template = {
      resources: []
    };

    if (includeNetwork) {
      template.resources.push({
        name: 'default-network',
        type: 'compute.v1.network',
        properties: {
          autoCreateSubnetworks: false
        }
      });

      template.resources.push({
        name: 'default-subnet',
        type: 'compute.v1.subnetwork',
        properties: {
          network: '$(ref.default-network.selfLink)',
          ipCidrRange: '10.0.0.0/24',
          region: this.region
        }
      });
    }

    if (includeFirewall) {
      template.resources.push({
        name: 'default-firewall',
        type: 'compute.v1.firewall',
        properties: {
          network: '$(ref.default-network.selfLink)',
          allowed: [{
            IPProtocol: 'tcp',
            ports: ['22', '80', '443']
          }],
          sourceRanges: ['0.0.0.0/0']
        }
      });
    }

    if (templateType === 'vm') {
      template.resources.push({
        name: 'vm-instance',
        type: 'compute.v1.instance',
        properties: {
          zone: this.zone,
          machineType: `zones/${this.zone}/machineTypes/e2-micro`,
          disks: [{
            boot: true,
            autoDelete: true,
            initializeParams: {
              sourceImage: 'projects/debian-cloud/global/images/family/debian-11'
            }
          }],
          networkInterfaces: [{
            subnetwork: '$(ref.default-subnet.selfLink)',
            accessConfigs: [{
              name: 'External NAT',
              type: 'ONE_TO_ONE_NAT'
            }]
          }]
        }
      });
    }

    return {
      success: true,
      template: template,
      templateType: templateType
    };
  }

  // Monitoring and Logging
  async createAlertPolicy(options) {
    await this.authenticate();

    const {
      displayName,
      metricType,
      threshold,
      comparison = 'COMPARISON_GREATER_THAN'
    } = options;

    try {
      const alertPolicy = {
        displayName: displayName,
        conditions: [{
          displayName: `${displayName} condition`,
          conditionThreshold: {
            filter: `metric.type="${metricType}"`,
            comparison: comparison,
            thresholdValue: threshold
          }
        }],
        alertStrategy: {
          autoClose: '1800s'
        }
      };

      const response = await this.monitoring.projects.alertPolicies.create({
        name: `projects/${this.projectId}`,
        requestBody: alertPolicy
      });

      return {
        success: true,
        alertPolicy: {
          name: response.data.name,
          displayName: response.data.displayName,
          enabled: response.data.enabled
        }
      };
    } catch (error) {
      logger.error('Failed to create alert policy:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = { GCPIntegration };