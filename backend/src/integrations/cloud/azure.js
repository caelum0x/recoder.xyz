const { DefaultAzureCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { StorageManagementClient } = require('@azure/arm-storage');
const { WebSiteManagementClient } = require('@azure/arm-appservice');
const { SqlManagementClient } = require('@azure/arm-sql');
const { ContainerServiceClient } = require('@azure/arm-containerservice');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { NetworkManagementClient } = require('@azure/arm-network');
const { BlobServiceClient } = require('@azure/storage-blob');
const { logger } = require('../../utils/logger');

class AzureIntegration {
  constructor(options = {}) {
    this.subscriptionId = options.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID;
    this.resourceGroupName = options.resourceGroupName || process.env.AZURE_RESOURCE_GROUP;
    this.location = options.location || process.env.AZURE_LOCATION || 'East US';
    this.tenantId = options.tenantId || process.env.AZURE_TENANT_ID;
    this.clientId = options.clientId || process.env.AZURE_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.AZURE_CLIENT_SECRET;
    
    if (!this.subscriptionId) {
      throw new Error('Azure subscription ID is required');
    }

    // Initialize Azure credential
    this.credential = new DefaultAzureCredential();

    // Initialize Azure service clients
    this.computeClient = new ComputeManagementClient(this.credential, this.subscriptionId);
    this.storageClient = new StorageManagementClient(this.credential, this.subscriptionId);
    this.webSiteClient = new WebSiteManagementClient(this.credential, this.subscriptionId);
    this.sqlClient = new SqlManagementClient(this.credential, this.subscriptionId);
    this.containerClient = new ContainerServiceClient(this.credential, this.subscriptionId);
    this.resourceClient = new ResourceManagementClient(this.credential, this.subscriptionId);
    this.networkClient = new NetworkManagementClient(this.credential, this.subscriptionId);
  }

  // Resource Group Operations
  async createResourceGroup(options) {
    const { 
      resourceGroupName = this.resourceGroupName,
      location = this.location,
      tags = {}
    } = options;

    try {
      const resourceGroup = {
        location: location,
        tags: tags
      };

      const result = await this.resourceClient.resourceGroups.createOrUpdate(
        resourceGroupName,
        resourceGroup
      );

      return {
        success: true,
        resourceGroup: {
          name: result.name,
          location: result.location,
          id: result.id,
          provisioningState: result.provisioningState
        }
      };
    } catch (error) {
      logger.error('Failed to create resource group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Virtual Machine Operations
  async createVirtualMachine(options) {
    const {
      vmName,
      vmSize = 'Standard_B1s',
      imageReference = {
        publisher: 'Canonical',
        offer: 'UbuntuServer',
        sku: '18.04-LTS',
        version: 'latest'
      },
      adminUsername = 'azureuser',
      adminPassword,
      sshPublicKey,
      resourceGroupName = this.resourceGroupName,
      location = this.location
    } = options;

    try {
      // Create network interface
      const networkInterface = await this.createNetworkInterface({
        vmName,
        resourceGroupName,
        location
      });

      if (!networkInterface.success) {
        return networkInterface;
      }

      // VM configuration
      const vmConfig = {
        location: location,
        hardwareProfile: {
          vmSize: vmSize
        },
        storageProfile: {
          imageReference: imageReference,
          osDisk: {
            createOption: 'FromImage',
            managedDisk: {
              storageAccountType: 'Standard_LRS'
            }
          }
        },
        osProfile: {
          computerName: vmName,
          adminUsername: adminUsername
        },
        networkProfile: {
          networkInterfaces: [{
            id: networkInterface.networkInterface.id
          }]
        }
      };

      // Set authentication method
      if (sshPublicKey) {
        vmConfig.osProfile.linuxConfiguration = {
          disablePasswordAuthentication: true,
          ssh: {
            publicKeys: [{
              path: `/home/${adminUsername}/.ssh/authorized_keys`,
              keyData: sshPublicKey
            }]
          }
        };
      } else if (adminPassword) {
        vmConfig.osProfile.adminPassword = adminPassword;
      } else {
        throw new Error('Either admin password or SSH public key must be provided');
      }

      const result = await this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(
        resourceGroupName,
        vmName,
        vmConfig
      );

      return {
        success: true,
        virtualMachine: {
          name: result.name,
          id: result.id,
          location: result.location,
          vmSize: result.hardwareProfile.vmSize,
          provisioningState: result.provisioningState
        }
      };
    } catch (error) {
      logger.error('Failed to create virtual machine:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createNetworkInterface(options) {
    const { vmName, resourceGroupName, location } = options;

    try {
      // Create virtual network first
      const vnetResult = await this.createVirtualNetwork({
        vnetName: `${vmName}-vnet`,
        resourceGroupName,
        location
      });

      if (!vnetResult.success) {
        return vnetResult;
      }

      // Create public IP
      const publicIpResult = await this.createPublicIP({
        publicIpName: `${vmName}-ip`,
        resourceGroupName,
        location
      });

      if (!publicIpResult.success) {
        return publicIpResult;
      }

      // Create network interface
      const nicConfig = {
        location: location,
        ipConfigurations: [{
          name: 'ipconfig1',
          subnet: {
            id: vnetResult.virtualNetwork.subnetId
          },
          publicIPAddress: {
            id: publicIpResult.publicIP.id
          }
        }]
      };

      const result = await this.networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
        resourceGroupName,
        `${vmName}-nic`,
        nicConfig
      );

      return {
        success: true,
        networkInterface: {
          name: result.name,
          id: result.id,
          location: result.location
        }
      };
    } catch (error) {
      logger.error('Failed to create network interface:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createVirtualNetwork(options) {
    const { vnetName, resourceGroupName, location } = options;

    try {
      const vnetConfig = {
        location: location,
        addressSpace: {
          addressPrefixes: ['10.0.0.0/16']
        },
        subnets: [{
          name: 'default',
          addressPrefix: '10.0.0.0/24'
        }]
      };

      const result = await this.networkClient.virtualNetworks.beginCreateOrUpdateAndWait(
        resourceGroupName,
        vnetName,
        vnetConfig
      );

      return {
        success: true,
        virtualNetwork: {
          name: result.name,
          id: result.id,
          location: result.location,
          subnetId: result.subnets[0].id
        }
      };
    } catch (error) {
      logger.error('Failed to create virtual network:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createPublicIP(options) {
    const { publicIpName, resourceGroupName, location } = options;

    try {
      const publicIpConfig = {
        location: location,
        publicIPAllocationMethod: 'Dynamic'
      };

      const result = await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
        resourceGroupName,
        publicIpName,
        publicIpConfig
      );

      return {
        success: true,
        publicIP: {
          name: result.name,
          id: result.id,
          location: result.location,
          allocationMethod: result.publicIPAllocationMethod
        }
      };
    } catch (error) {
      logger.error('Failed to create public IP:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listVirtualMachines(resourceGroupName = this.resourceGroupName) {
    try {
      const vms = [];
      for await (const vm of this.computeClient.virtualMachines.list(resourceGroupName)) {
        vms.push({
          name: vm.name,
          id: vm.id,
          location: vm.location,
          vmSize: vm.hardwareProfile?.vmSize,
          provisioningState: vm.provisioningState,
          powerState: vm.instanceView?.statuses?.find(s => s.code?.startsWith('PowerState/'))?.displayStatus
        });
      }

      return {
        success: true,
        virtualMachines: vms
      };
    } catch (error) {
      logger.error('Failed to list virtual machines:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteVirtualMachine(vmName, resourceGroupName = this.resourceGroupName) {
    try {
      await this.computeClient.virtualMachines.beginDeleteAndWait(
        resourceGroupName,
        vmName
      );

      return {
        success: true,
        vmName: vmName,
        action: 'deleted'
      };
    } catch (error) {
      logger.error('Failed to delete virtual machine:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Storage Account Operations
  async createStorageAccount(options) {
    const {
      storageAccountName,
      resourceGroupName = this.resourceGroupName,
      location = this.location,
      sku = 'Standard_LRS',
      kind = 'StorageV2'
    } = options;

    try {
      const storageAccountConfig = {
        location: location,
        sku: {
          name: sku
        },
        kind: kind,
        accessTier: 'Hot'
      };

      const result = await this.storageClient.storageAccounts.beginCreateAndWait(
        resourceGroupName,
        storageAccountName,
        storageAccountConfig
      );

      return {
        success: true,
        storageAccount: {
          name: result.name,
          id: result.id,
          location: result.location,
          sku: result.sku,
          kind: result.kind,
          provisioningState: result.provisioningState
        }
      };
    } catch (error) {
      logger.error('Failed to create storage account:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async uploadToBlob(options) {
    const {
      storageAccountName,
      containerName,
      blobName,
      data,
      resourceGroupName = this.resourceGroupName
    } = options;

    try {
      // Get storage account key
      const keys = await this.storageClient.storageAccounts.listKeys(
        resourceGroupName,
        storageAccountName
      );

      const connectionString = `DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${keys.keys[0].value};EndpointSuffix=core.windows.net`;
      
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Create container if it doesn't exist
      await containerClient.createIfNotExists();
      
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const uploadResult = await blockBlobClient.upload(data, data.length);

      return {
        success: true,
        blob: {
          name: blobName,
          container: containerName,
          storageAccount: storageAccountName,
          etag: uploadResult.etag,
          lastModified: uploadResult.lastModified
        }
      };
    } catch (error) {
      logger.error('Failed to upload to blob storage:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // App Service Operations
  async createAppService(options) {
    const {
      appName,
      appServicePlanName,
      resourceGroupName = this.resourceGroupName,
      location = this.location,
      runtime = 'NODE|18-lts',
      tier = 'Free',
      size = 'F1'
    } = options;

    try {
      // Create App Service Plan
      const appServicePlanConfig = {
        location: location,
        sku: {
          name: size,
          tier: tier
        }
      };

      const planResult = await this.webSiteClient.appServicePlans.beginCreateOrUpdateAndWait(
        resourceGroupName,
        appServicePlanName,
        appServicePlanConfig
      );

      // Create Web App
      const webAppConfig = {
        location: location,
        serverFarmId: planResult.id,
        siteConfig: {
          linuxFxVersion: runtime,
          alwaysOn: tier !== 'Free'
        }
      };

      const appResult = await this.webSiteClient.webApps.beginCreateOrUpdateAndWait(
        resourceGroupName,
        appName,
        webAppConfig
      );

      return {
        success: true,
        appService: {
          name: appResult.name,
          id: appResult.id,
          defaultHostName: appResult.defaultHostName,
          state: appResult.state,
          location: appResult.location
        }
      };
    } catch (error) {
      logger.error('Failed to create App Service:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Azure SQL Database Operations
  async createSQLDatabase(options) {
    const {
      serverName,
      databaseName,
      adminLogin,
      adminPassword,
      resourceGroupName = this.resourceGroupName,
      location = this.location,
      tier = 'Basic'
    } = options;

    try {
      // Create SQL Server
      const serverConfig = {
        location: location,
        administratorLogin: adminLogin,
        administratorLoginPassword: adminPassword,
        version: '12.0'
      };

      const serverResult = await this.sqlClient.servers.beginCreateOrUpdateAndWait(
        resourceGroupName,
        serverName,
        serverConfig
      );

      // Create SQL Database
      const databaseConfig = {
        location: location,
        sku: {
          name: tier === 'Basic' ? 'Basic' : 'S0',
          tier: tier
        }
      };

      const databaseResult = await this.sqlClient.databases.beginCreateOrUpdateAndWait(
        resourceGroupName,
        serverName,
        databaseName,
        databaseConfig
      );

      return {
        success: true,
        sqlDatabase: {
          serverName: serverResult.name,
          databaseName: databaseResult.name,
          location: databaseResult.location,
          status: databaseResult.status,
          serverId: serverResult.id,
          databaseId: databaseResult.id
        }
      };
    } catch (error) {
      logger.error('Failed to create SQL database:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Azure Kubernetes Service Operations
  async createAKSCluster(options) {
    const {
      clusterName,
      nodeCount = 3,
      vmSize = 'Standard_DS2_v2',
      kubernetesVersion = '1.24.0',
      resourceGroupName = this.resourceGroupName,
      location = this.location
    } = options;

    try {
      const clusterConfig = {
        location: location,
        kubernetesVersion: kubernetesVersion,
        dnsPrefix: `${clusterName}-dns`,
        agentPoolProfiles: [{
          name: 'nodepool1',
          count: nodeCount,
          vmSize: vmSize,
          mode: 'System'
        }],
        servicePrincipalProfile: {
          clientId: 'msi'
        },
        identity: {
          type: 'SystemAssigned'
        }
      };

      const result = await this.containerClient.managedClusters.beginCreateOrUpdateAndWait(
        resourceGroupName,
        clusterName,
        clusterConfig
      );

      return {
        success: true,
        aksCluster: {
          name: result.name,
          id: result.id,
          location: result.location,
          kubernetesVersion: result.kubernetesVersion,
          nodeCount: nodeCount,
          provisioningState: result.provisioningState
        }
      };
    } catch (error) {
      logger.error('Failed to create AKS cluster:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Utility Methods
  async listLocations() {
    try {
      const locations = [];
      for await (const location of this.resourceClient.subscriptions.listLocations(this.subscriptionId)) {
        locations.push({
          name: location.name,
          displayName: location.displayName,
          latitude: location.metadata?.latitude,
          longitude: location.metadata?.longitude
        });
      }

      return {
        success: true,
        locations: locations
      };
    } catch (error) {
      logger.error('Failed to list locations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSubscriptionInfo() {
    try {
      const subscription = await this.resourceClient.subscriptions.get(this.subscriptionId);

      return {
        success: true,
        subscription: {
          subscriptionId: subscription.subscriptionId,
          displayName: subscription.displayName,
          state: subscription.state,
          tenantId: subscription.tenantId
        }
      };
    } catch (error) {
      logger.error('Failed to get subscription info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async estimateCosts(options) {
    const {
      vmSize = 'Standard_B1s',
      vmCount = 1,
      diskSizeGB = 30,
      location = this.location
    } = options;

    // This is a simplified cost estimation
    // In practice, you would use Azure Pricing API
    const pricing = {
      'Standard_B1s': 0.0104, // per hour
      'Standard_B1ms': 0.0207,
      'Standard_B2s': 0.0416,
      'Standard_DS1_v2': 0.0580,
      'Standard_DS2_v2': 0.1160,
      'Standard_DS3_v2': 0.2320
    };

    const diskPrice = 0.048; // per GB per month

    const vmHourlyCost = pricing[vmSize] || 0.02;
    const monthlyCost = (vmHourlyCost * 24 * 30 * vmCount) + (diskSizeGB * diskPrice);

    return {
      success: true,
      estimate: {
        vmSize: vmSize,
        vmCount: vmCount,
        diskSizeGB: diskSizeGB,
        location: location,
        hourlyCost: vmHourlyCost * vmCount,
        dailyCost: vmHourlyCost * 24 * vmCount,
        monthlyCost: monthlyCost,
        currency: 'USD'
      }
    };
  }

  // Configuration methods
  setSubscriptionId(subscriptionId) {
    this.subscriptionId = subscriptionId;
    this._reinitializeClients();
  }

  setResourceGroup(resourceGroupName) {
    this.resourceGroupName = resourceGroupName;
  }

  setLocation(location) {
    this.location = location;
  }

  _reinitializeClients() {
    this.computeClient = new ComputeManagementClient(this.credential, this.subscriptionId);
    this.storageClient = new StorageManagementClient(this.credential, this.subscriptionId);
    this.webSiteClient = new WebSiteManagementClient(this.credential, this.subscriptionId);
    this.sqlClient = new SqlManagementClient(this.credential, this.subscriptionId);
    this.containerClient = new ContainerServiceClient(this.credential, this.subscriptionId);
    this.resourceClient = new ResourceManagementClient(this.credential, this.subscriptionId);
    this.networkClient = new NetworkManagementClient(this.credential, this.subscriptionId);
  }

  // Generate ARM template
  generateARMTemplate(options) {
    const {
      templateType = 'vm',
      includeNetwork = true,
      includeStorage = false,
      includeDatabase = false
    } = options;

    const template = {
      '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
      'contentVersion': '1.0.0.0',
      'parameters': {
        'vmName': {
          'type': 'string',
          'defaultValue': 'myVM'
        },
        'adminUsername': {
          'type': 'string',
          'defaultValue': 'azureuser'
        },
        'adminPassword': {
          'type': 'securestring'
        }
      },
      'variables': {},
      'resources': [],
      'outputs': {}
    };

    if (includeNetwork) {
      template.resources.push({
        'type': 'Microsoft.Network/virtualNetworks',
        'apiVersion': '2020-06-01',
        'name': '[concat(parameters(\'vmName\'), \'-vnet\')]',
        'location': '[resourceGroup().location]',
        'properties': {
          'addressSpace': {
            'addressPrefixes': ['10.0.0.0/16']
          },
          'subnets': [{
            'name': 'default',
            'properties': {
              'addressPrefix': '10.0.0.0/24'
            }
          }]
        }
      });
    }

    if (templateType === 'vm') {
      template.resources.push({
        'type': 'Microsoft.Compute/virtualMachines',
        'apiVersion': '2020-06-01',
        'name': '[parameters(\'vmName\')]',
        'location': '[resourceGroup().location]',
        'properties': {
          'hardwareProfile': {
            'vmSize': 'Standard_B1s'
          },
          'osProfile': {
            'computerName': '[parameters(\'vmName\')]',
            'adminUsername': '[parameters(\'adminUsername\')]',
            'adminPassword': '[parameters(\'adminPassword\')]'
          },
          'storageProfile': {
            'imageReference': {
              'publisher': 'Canonical',
              'offer': 'UbuntuServer',
              'sku': '18.04-LTS',
              'version': 'latest'
            },
            'osDisk': {
              'createOption': 'FromImage'
            }
          }
        }
      });
    }

    return {
      success: true,
      template: template,
      templateType: templateType
    };
  }
}

module.exports = { AzureIntegration };