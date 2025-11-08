/**
 * Infrastructure Manager - Terraform and Kubernetes deployment integration
 * Provides CLI commands to deploy and manage cloud infrastructure
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const os = require('os');

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const execAsync = promisify(exec);

class InfrastructureManager {
  constructor() {
    this.terraformDir = path.join(__dirname, '../terraform');
    this.kubernetesDir = path.join(__dirname, '../kubernetes');
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.infraConfigPath = path.join(this.configDir, 'infrastructure-config.json');
    
    this.defaultConfig = {
      terraform: {
        provider: 'aws', // aws, azure, gcp
        region: 'us-west-2',
        environment: 'development',
        autoApprove: false,
        stateBackend: 'local'
      },
      kubernetes: {
        context: 'default',
        namespace: 'recoder-code',
        environment: 'development',
        replicas: 1
      },
      deployments: []
    };
  }

  loadInfraConfig() {
    try {
      if (fs.existsSync(this.infraConfigPath)) {
        return JSON.parse(fs.readFileSync(this.infraConfigPath, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not load infrastructure config: ${error.message}`));
    }
    return { ...this.defaultConfig };
  }

  saveInfraConfig(config) {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.infraConfigPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save infrastructure config: ${error.message}`));
    }
  }

  async checkTerraformAvailable() {
    try {
      const { stdout } = await execAsync('terraform version');
      return { available: true, version: stdout.split('\n')[0] };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  async checkKubectlAvailable() {
    try {
      const { stdout } = await execAsync('kubectl version --client=true --short=true');
      return { available: true, version: stdout.trim() };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  async checkAwsCliAvailable() {
    try {
      const { stdout } = await execAsync('aws --version');
      return { available: true, version: stdout.trim() };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  async initTerraform(options = {}) {
    console.log(chalk.cyan('🏗️ Initializing Terraform infrastructure...'));

    // Check if terraform is available
    const terraformCheck = await this.checkTerraformAvailable();
    if (!terraformCheck.available) {
      console.log(chalk.red('❌ Terraform is not installed'));
      console.log(chalk.yellow('   Please install Terraform: https://terraform.io/downloads'));
      return false;
    }

    console.log(chalk.green(`✅ ${terraformCheck.version}`));

    // Check if terraform directory exists
    if (!fs.existsSync(this.terraformDir)) {
      console.log(chalk.red(`❌ Terraform configuration not found at: ${this.terraformDir}`));
      return false;
    }

    try {
      console.log(chalk.cyan('📋 Initializing Terraform...'));
      await execAsync('terraform init', { cwd: this.terraformDir });
      console.log(chalk.green('✅ Terraform initialized successfully'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Terraform initialization failed: ${error.message}`));
      return false;
    }
  }

  async planTerraform(options = {}) {
    console.log(chalk.cyan('📋 Creating Terraform plan...'));

    const config = this.loadInfraConfig();
    
    // Initialize if needed
    const initSuccess = await this.initTerraform();
    if (!initSuccess) return false;

    try {
      let planCommand = 'terraform plan';
      
      // Add variables
      if (config.terraform.region) {
        planCommand += ` -var="region=${config.terraform.region}"`;
      }
      if (config.terraform.environment) {
        planCommand += ` -var="environment=${config.terraform.environment}"`;
      }

      // Add custom variables
      if (options.vars) {
        for (const [key, value] of Object.entries(options.vars)) {
          planCommand += ` -var="${key}=${value}"`;
        }
      }

      if (options.out) {
        planCommand += ` -out=${options.out}`;
      }

      console.log(chalk.blue(`Running: ${planCommand}`));
      const { stdout } = await execAsync(planCommand, { cwd: this.terraformDir });
      console.log(stdout);
      console.log(chalk.green('✅ Terraform plan completed'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Terraform plan failed: ${error.message}`));
      return false;
    }
  }

  async applyTerraform(options = {}) {
    console.log(chalk.cyan('🚀 Deploying infrastructure with Terraform...'));

    const config = this.loadInfraConfig();

    // Check prerequisites
    if (config.terraform.provider === 'aws') {
      const awsCheck = await this.checkAwsCliAvailable();
      if (!awsCheck.available) {
        console.log(chalk.yellow('⚠️ AWS CLI not found - make sure AWS credentials are configured'));
      }
    }

    try {
      let applyCommand = 'terraform apply';
      
      // Add variables
      if (config.terraform.region) {
        applyCommand += ` -var="region=${config.terraform.region}"`;
      }
      if (config.terraform.environment) {
        applyCommand += ` -var="environment=${config.terraform.environment}"`;
      }

      // Add custom variables
      if (options.vars) {
        for (const [key, value] of Object.entries(options.vars)) {
          applyCommand += ` -var="${key}=${value}"`;
        }
      }

      // Auto-approve if configured or requested
      if (config.terraform.autoApprove || options.autoApprove) {
        applyCommand += ' -auto-approve';
      }

      console.log(chalk.blue(`Running: ${applyCommand}`));
      
      if (!config.terraform.autoApprove && !options.autoApprove) {
        console.log(chalk.yellow('⚠️ Terraform will prompt for approval'));
      }

      const { stdout } = await execAsync(applyCommand, { 
        cwd: this.terraformDir,
        stdio: 'inherit' 
      });

      // Record successful deployment
      config.deployments.push({
        type: 'terraform',
        timestamp: new Date().toISOString(),
        environment: config.terraform.environment,
        region: config.terraform.region
      });
      this.saveInfraConfig(config);

      console.log(chalk.green('✅ Infrastructure deployed successfully'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Terraform deployment failed: ${error.message}`));
      return false;
    }
  }

  async destroyTerraform(options = {}) {
    console.log(chalk.red('🗑️ Destroying Terraform infrastructure...'));
    console.log(chalk.yellow('⚠️ This will destroy all resources managed by Terraform'));

    if (!options.force) {
      console.log(chalk.red('   Use --force to confirm destruction'));
      return false;
    }

    const config = this.loadInfraConfig();

    try {
      let destroyCommand = 'terraform destroy';
      
      // Add variables
      if (config.terraform.region) {
        destroyCommand += ` -var="region=${config.terraform.region}"`;
      }
      if (config.terraform.environment) {
        destroyCommand += ` -var="environment=${config.terraform.environment}"`;
      }

      if (options.autoApprove) {
        destroyCommand += ' -auto-approve';
      }

      console.log(chalk.blue(`Running: ${destroyCommand}`));
      await execAsync(destroyCommand, { 
        cwd: this.terraformDir,
        stdio: 'inherit' 
      });

      console.log(chalk.green('✅ Infrastructure destroyed successfully'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Infrastructure destruction failed: ${error.message}`));
      return false;
    }
  }

  async deployKubernetes(options = {}) {
    console.log(chalk.cyan('⚙️ Deploying to Kubernetes...'));

    // Check if kubectl is available
    const kubectlCheck = await this.checkKubectlAvailable();
    if (!kubectlCheck.available) {
      console.log(chalk.red('❌ kubectl is not installed'));
      console.log(chalk.yellow('   Please install kubectl: https://kubernetes.io/docs/tasks/tools/'));
      return false;
    }

    console.log(chalk.green(`✅ ${kubectlCheck.version}`));

    // Check if kubernetes directory exists
    const k8sProductionDir = path.join(this.kubernetesDir, 'production');
    if (!fs.existsSync(k8sProductionDir)) {
      console.log(chalk.red(`❌ Kubernetes manifests not found at: ${k8sProductionDir}`));
      return false;
    }

    const config = this.loadInfraConfig();

    try {
      // Create namespace if it doesn't exist
      console.log(chalk.cyan(`📋 Creating namespace: ${config.kubernetes.namespace}`));
      try {
        await execAsync(`kubectl create namespace ${config.kubernetes.namespace}`);
        console.log(chalk.green(`✅ Namespace created: ${config.kubernetes.namespace}`));
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(chalk.yellow(`⚠️ Namespace already exists: ${config.kubernetes.namespace}`));
        } else {
          throw error;
        }
      }

      // Apply all manifests in production directory
      console.log(chalk.cyan('🚀 Applying Kubernetes manifests...'));
      
      const manifestFiles = fs.readdirSync(k8sProductionDir)
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

      for (const manifest of manifestFiles) {
        const manifestPath = path.join(k8sProductionDir, manifest);
        console.log(chalk.blue(`Applying: ${manifest}`));
        
        await execAsync(
          `kubectl apply -f ${manifestPath} -n ${config.kubernetes.namespace}`,
          { stdio: 'inherit' }
        );
      }

      // Record successful deployment
      config.deployments.push({
        type: 'kubernetes',
        timestamp: new Date().toISOString(),
        namespace: config.kubernetes.namespace,
        environment: config.kubernetes.environment,
        manifests: manifestFiles
      });
      this.saveInfraConfig(config);

      console.log(chalk.green('✅ Kubernetes deployment completed'));
      
      // Show deployment status
      await this.getKubernetesStatus();
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Kubernetes deployment failed: ${error.message}`));
      return false;
    }
  }

  async getKubernetesStatus() {
    console.log(chalk.cyan('📊 Kubernetes deployment status:'));
    
    const config = this.loadInfraConfig();

    try {
      // Get pods
      const { stdout: pods } = await execAsync(
        `kubectl get pods -n ${config.kubernetes.namespace}`,
        { encoding: 'utf8' }
      );
      console.log(chalk.yellow('Pods:'));
      console.log(pods);

      // Get services
      const { stdout: services } = await execAsync(
        `kubectl get services -n ${config.kubernetes.namespace}`,
        { encoding: 'utf8' }
      );
      console.log(chalk.yellow('Services:'));
      console.log(services);

      // Get deployments
      try {
        const { stdout: deployments } = await execAsync(
          `kubectl get deployments -n ${config.kubernetes.namespace}`,
          { encoding: 'utf8' }
        );
        console.log(chalk.yellow('Deployments:'));
        console.log(deployments);
      } catch (error) {
        // Deployments might not exist
      }

    } catch (error) {
      console.log(chalk.red(`❌ Failed to get status: ${error.message}`));
    }
  }

  async getKubernetesLogs(podName = null) {
    const config = this.loadInfraConfig();

    try {
      if (!podName) {
        // Get first pod
        const { stdout: pods } = await execAsync(
          `kubectl get pods -n ${config.kubernetes.namespace} -o name`,
          { encoding: 'utf8' }
        );
        
        const podList = pods.trim().split('\n');
        if (podList.length === 0) {
          console.log(chalk.yellow('⚠️ No pods found'));
          return;
        }
        
        podName = podList[0].replace('pod/', '');
      }

      console.log(chalk.cyan(`📋 Viewing logs for pod: ${podName}`));
      console.log(chalk.gray('Press Ctrl+C to exit'));

      const child = spawn('kubectl', [
        'logs', '-f', podName, '-n', config.kubernetes.namespace
      ], {
        stdio: 'inherit'
      });

      child.on('error', (error) => {
        console.log(chalk.red(`❌ Failed to view logs: ${error.message}`));
      });

    } catch (error) {
      console.log(chalk.red(`❌ Failed to get logs: ${error.message}`));
    }
  }

  async deleteKubernetesDeployment() {
    console.log(chalk.red('🗑️ Deleting Kubernetes deployment...'));
    
    const config = this.loadInfraConfig();

    try {
      await execAsync(
        `kubectl delete all --all -n ${config.kubernetes.namespace}`,
        { stdio: 'inherit' }
      );

      console.log(chalk.green('✅ Kubernetes deployment deleted'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to delete deployment: ${error.message}`));
      return false;
    }
  }

  async showInfraStatus() {
    console.log(chalk.cyan('🏗️ Infrastructure Status'));
    console.log('');

    const config = this.loadInfraConfig();

    // Check tool availability
    console.log(chalk.yellow('🔧 Available Tools:'));
    
    const terraformCheck = await this.checkTerraformAvailable();
    console.log(`   Terraform: ${terraformCheck.available ? 
      chalk.green('✅ ' + terraformCheck.version) : 
      chalk.red('❌ Not installed')}`);
    
    const kubectlCheck = await this.checkKubectlAvailable();
    console.log(`   kubectl: ${kubectlCheck.available ? 
      chalk.green('✅ ' + kubectlCheck.version) : 
      chalk.red('❌ Not installed')}`);

    if (config.terraform.provider === 'aws') {
      const awsCheck = await this.checkAwsCliAvailable();
      console.log(`   AWS CLI: ${awsCheck.available ? 
        chalk.green('✅ ' + awsCheck.version) : 
        chalk.yellow('⚠️ Not configured')}`);
    }

    console.log('');

    // Show configuration
    console.log(chalk.yellow('⚙️ Configuration:'));
    console.log(`   Provider: ${config.terraform.provider}`);
    console.log(`   Region: ${config.terraform.region}`);
    console.log(`   Environment: ${config.terraform.environment}`);
    console.log(`   K8s Namespace: ${config.kubernetes.namespace}`);
    console.log('');

    // Show deployment history
    if (config.deployments.length > 0) {
      console.log(chalk.yellow('📋 Recent Deployments:'));
      config.deployments.slice(-5).forEach(deployment => {
        const date = new Date(deployment.timestamp).toLocaleString();
        console.log(`   ${deployment.type}: ${deployment.environment} (${date})`);
      });
    } else {
      console.log(chalk.blue('💡 No deployments yet. Try:'));
      console.log('   recoder-code infra plan    # Plan Terraform');
      console.log('   recoder-code k8s deploy    # Deploy to Kubernetes');
    }
  }

  async showHelp() {
    console.log(chalk.cyan('🏗️ Recoder-Code Infrastructure Management'));
    console.log('');
    console.log(chalk.yellow('🏗️ TERRAFORM COMMANDS:'));
    console.log('  infra init      Initialize Terraform');
    console.log('  infra plan      Create deployment plan');
    console.log('  infra apply     Deploy infrastructure');
    console.log('  infra destroy   Destroy infrastructure');
    console.log('');
    console.log(chalk.yellow('⚙️ KUBERNETES COMMANDS:'));
    console.log('  k8s deploy      Deploy to Kubernetes');
    console.log('  k8s status      Check deployment status');
    console.log('  k8s logs        View pod logs');
    console.log('  k8s delete      Delete deployment');
    console.log('');
    console.log(chalk.yellow('📋 EXAMPLES:'));
    console.log('  recoder-code infra plan                    # Plan deployment');
    console.log('  recoder-code infra apply --auto-approve    # Deploy without prompts');
    console.log('  recoder-code k8s deploy                    # Deploy to Kubernetes');
    console.log('  recoder-code k8s status                    # Check pod status');
    console.log('  recoder-code infra status                  # Show overall status');
    console.log('');
    console.log(chalk.yellow('🔧 OPTIONS:'));
    console.log('  --auto-approve   Skip confirmation prompts');
    console.log('  --force          Force destructive operations');
    console.log('  --environment    Set environment (dev/staging/prod)');
    console.log('  --region         Set AWS/Azure/GCP region');
    console.log('');
    console.log(chalk.blue('💡 Uses Terraform configs from terraform/ directory'));
    console.log(chalk.blue('   and Kubernetes manifests from kubernetes/production/'));
  }
}

module.exports = InfrastructureManager;