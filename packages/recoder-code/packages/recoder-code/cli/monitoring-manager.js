/**
 * Monitoring Manager - Integrates Prometheus/Grafana monitoring system
 * Provides CLI commands to set up and manage observability infrastructure
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

class MonitoringManager {
  constructor() {
    this.monitoringDir = path.join(__dirname, '../monitoring');
    this.prometheusConfigPath = path.join(this.monitoringDir, 'prometheus.yml');
    this.alertRulesPath = path.join(this.monitoringDir, 'rules');
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.monitoringConfigPath = path.join(this.configDir, 'monitoring-config.json');
    
    this.defaultConfig = {
      prometheus: {
        enabled: false,
        port: 9090,
        dataRetention: '30d',
        storageSize: '10GB'
      },
      grafana: {
        enabled: false,
        port: 3000,
        adminPassword: this.generatePassword()
      },
      alertmanager: {
        enabled: false,
        port: 9093,
        webhook: null
      },
      exporters: {
        nodeExporter: true,
        dockerExporter: true,
        redisExporter: false,
        postgresExporter: false
      }
    };
  }

  generatePassword() {
    return Math.random().toString(36).slice(-8);
  }

  loadMonitoringConfig() {
    try {
      if (fs.existsSync(this.monitoringConfigPath)) {
        return JSON.parse(fs.readFileSync(this.monitoringConfigPath, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not load monitoring config: ${error.message}`));
    }
    return { ...this.defaultConfig };
  }

  saveMonitoringConfig(config) {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.monitoringConfigPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save monitoring config: ${error.message}`));
    }
  }

  async checkDockerAvailable() {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkDockerCompose() {
    try {
      await execAsync('docker-compose --version');
      return true;
    } catch (error) {
      try {
        await execAsync('docker compose version');
        return true;
      } catch (error2) {
        return false;
      }
    }
  }

  generateDockerCompose(config) {
    const services = {
      prometheus: {
        image: 'prom/prometheus:latest',
        container_name: 'recoder-prometheus',
        ports: [`${config.prometheus.port}:9090`],
        volumes: [
          `${this.prometheusConfigPath}:/etc/prometheus/prometheus.yml:ro`,
          `${this.alertRulesPath}:/etc/prometheus/rules:ro`,
          'prometheus_data:/prometheus'
        ],
        command: [
          '--config.file=/etc/prometheus/prometheus.yml',
          '--storage.tsdb.path=/prometheus',
          `--storage.tsdb.retention.time=${config.prometheus.dataRetention}`,
          `--storage.tsdb.retention.size=${config.prometheus.storageSize}`,
          '--web.console.libraries=/etc/prometheus/console_libraries',
          '--web.console.templates=/etc/prometheus/consoles',
          '--web.enable-lifecycle',
          '--web.enable-admin-api'
        ],
        restart: 'unless-stopped',
        networks: ['recoder-monitoring']
      }
    };

    if (config.grafana.enabled) {
      services.grafana = {
        image: 'grafana/grafana:latest',
        container_name: 'recoder-grafana',
        ports: [`${config.grafana.port}:3000`],
        volumes: [
          'grafana_data:/var/lib/grafana',
          `${this.monitoringDir}/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro`,
          `${this.monitoringDir}/grafana/datasources:/etc/grafana/provisioning/datasources:ro`
        ],
        environment: {
          GF_SECURITY_ADMIN_PASSWORD: config.grafana.adminPassword,
          GF_USERS_ALLOW_SIGN_UP: 'false',
          GF_SERVER_DOMAIN: 'localhost',
          GF_SMTP_ENABLED: 'false'
        },
        restart: 'unless-stopped',
        networks: ['recoder-monitoring']
      };
    }

    if (config.alertmanager.enabled) {
      services.alertmanager = {
        image: 'prom/alertmanager:latest',
        container_name: 'recoder-alertmanager',
        ports: [`${config.alertmanager.port}:9093`],
        volumes: [
          `${this.monitoringDir}/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro`
        ],
        restart: 'unless-stopped',
        networks: ['recoder-monitoring']
      };
    }

    if (config.exporters.nodeExporter) {
      services.node_exporter = {
        image: 'prom/node-exporter:latest',
        container_name: 'recoder-node-exporter',
        ports: ['9100:9100'],
        volumes: [
          '/proc:/host/proc:ro',
          '/sys:/host/sys:ro',
          '/:/rootfs:ro'
        ],
        command: [
          '--path.procfs=/host/proc',
          '--path.sysfs=/host/sys',
          '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
        ],
        restart: 'unless-stopped',
        networks: ['recoder-monitoring']
      };
    }

    return {
      version: '3.8',
      services,
      volumes: {
        prometheus_data: {},
        grafana_data: {}
      },
      networks: {
        'recoder-monitoring': {
          driver: 'bridge'
        }
      }
    };
  }

  async setupMonitoring(options = {}) {
    console.log(chalk.cyan('🔍 Setting up Recoder-Code monitoring system...'));

    // Check prerequisites
    const dockerAvailable = await this.checkDockerAvailable();
    const dockerComposeAvailable = await this.checkDockerCompose();

    if (!dockerAvailable) {
      console.log(chalk.red('❌ Docker is required for monitoring setup'));
      console.log(chalk.yellow('   Please install Docker Desktop and try again'));
      return false;
    }

    if (!dockerComposeAvailable) {
      console.log(chalk.red('❌ Docker Compose is required for monitoring setup'));
      console.log(chalk.yellow('   Please install Docker Compose and try again'));
      return false;
    }

    // Check if monitoring config exists
    if (!fs.existsSync(this.prometheusConfigPath)) {
      console.log(chalk.red(`❌ Prometheus config not found at: ${this.prometheusConfigPath}`));
      return false;
    }

    // Load/create monitoring configuration
    let config = this.loadMonitoringConfig();
    
    // Apply options
    if (options.grafana !== undefined) config.grafana.enabled = options.grafana;
    if (options.alertmanager !== undefined) config.alertmanager.enabled = options.alertmanager;
    if (options.port) config.prometheus.port = options.port;

    // Generate docker-compose file
    const dockerCompose = this.generateDockerCompose(config);
    const dockerComposeFile = path.join(this.configDir, 'docker-compose.monitoring.yml');
    
    try {
      fs.writeFileSync(dockerComposeFile, require('js-yaml').dump(dockerCompose));
    } catch (error) {
      // Fallback to JSON if js-yaml not available
      const yamlContent = this.generateDockerComposeYAML(dockerCompose);
      fs.writeFileSync(dockerComposeFile, yamlContent);
    }

    // Start monitoring services
    console.log(chalk.cyan('🚀 Starting monitoring services...'));
    
    try {
      await execAsync(`docker-compose -f ${dockerComposeFile} pull`, { cwd: this.configDir });
      await execAsync(`docker-compose -f ${dockerComposeFile} up -d`, { cwd: this.configDir });
      
      // Update configuration
      config.prometheus.enabled = true;
      this.saveMonitoringConfig(config);

      console.log(chalk.green('✅ Monitoring system started successfully!'));
      console.log('');
      console.log(chalk.blue('📊 Access your monitoring:'));
      console.log(`   • Prometheus: http://localhost:${config.prometheus.port}`);
      
      if (config.grafana.enabled) {
        console.log(`   • Grafana: http://localhost:${config.grafana.port}`);
        console.log(`     Username: admin`);
        console.log(`     Password: ${config.grafana.adminPassword}`);
      }
      
      if (config.alertmanager.enabled) {
        console.log(`   • Alertmanager: http://localhost:${config.alertmanager.port}`);
      }

      console.log('');
      console.log(chalk.yellow('💡 Tip: Use "recoder-code monitor status" to check health'));
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to start monitoring: ${error.message}`));
      return false;
    }
  }

  generateDockerComposeYAML(compose) {
    // Simple YAML generator for docker-compose
    let yaml = `version: '${compose.version}'\n\n`;
    
    yaml += 'services:\n';
    for (const [name, service] of Object.entries(compose.services)) {
      yaml += `  ${name}:\n`;
      yaml += `    image: ${service.image}\n`;
      if (service.container_name) yaml += `    container_name: ${service.container_name}\n`;
      if (service.ports) yaml += `    ports: [${service.ports.map(p => `"${p}"`).join(', ')}]\n`;
      if (service.restart) yaml += `    restart: ${service.restart}\n`;
      yaml += '\n';
    }
    
    return yaml;
  }

  async checkMonitoringStatus() {
    console.log(chalk.cyan('🔍 Checking monitoring system status...'));
    
    const config = this.loadMonitoringConfig();
    
    if (!config.prometheus.enabled) {
      console.log(chalk.yellow('⚠️ Monitoring is not set up'));
      console.log(chalk.blue('   Run "recoder-code monitor setup" to enable monitoring'));
      return;
    }

    const dockerComposeFile = path.join(this.configDir, 'docker-compose.monitoring.yml');
    
    if (!fs.existsSync(dockerComposeFile)) {
      console.log(chalk.red('❌ Monitoring configuration not found'));
      return;
    }

    try {
      const { stdout } = await execAsync(`docker-compose -f ${dockerComposeFile} ps`, { cwd: this.configDir });
      console.log(chalk.green('✅ Monitoring services status:'));
      console.log(stdout);
      
      // Check individual service health
      await this.checkServiceHealth('prometheus', config.prometheus.port);
      if (config.grafana.enabled) {
        await this.checkServiceHealth('grafana', config.grafana.port);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed to check status: ${error.message}`));
    }
  }

  async checkServiceHealth(service, port) {
    try {
      const { stdout } = await execAsync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`);
      const statusCode = stdout.trim();
      
      if (statusCode.startsWith('2') || statusCode.startsWith('3')) {
        console.log(chalk.green(`   ✅ ${service}: http://localhost:${port} (${statusCode})`));
      } else {
        console.log(chalk.yellow(`   ⚠️ ${service}: http://localhost:${port} (${statusCode})`));
      }
    } catch (error) {
      console.log(chalk.red(`   ❌ ${service}: http://localhost:${port} (unreachable)`));
    }
  }

  async stopMonitoring() {
    console.log(chalk.cyan('🛑 Stopping monitoring services...'));
    
    const dockerComposeFile = path.join(this.configDir, 'docker-compose.monitoring.yml');
    
    if (!fs.existsSync(dockerComposeFile)) {
      console.log(chalk.yellow('⚠️ Monitoring configuration not found'));
      return;
    }

    try {
      await execAsync(`docker-compose -f ${dockerComposeFile} down`, { cwd: this.configDir });
      console.log(chalk.green('✅ Monitoring services stopped'));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to stop monitoring: ${error.message}`));
    }
  }

  async viewLogs(service = 'prometheus') {
    const dockerComposeFile = path.join(this.configDir, 'docker-compose.monitoring.yml');
    
    if (!fs.existsSync(dockerComposeFile)) {
      console.log(chalk.red('❌ Monitoring not set up'));
      return;
    }

    console.log(chalk.cyan(`📋 Viewing ${service} logs...`));
    console.log(chalk.gray('Press Ctrl+C to exit'));
    
    const child = spawn('docker-compose', ['-f', dockerComposeFile, 'logs', '-f', service], {
      cwd: this.configDir,
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      console.log(chalk.red(`❌ Failed to view logs: ${error.message}`));
    });
  }

  async openDashboard(service = 'prometheus') {
    const config = this.loadMonitoringConfig();
    let url;
    
    switch (service.toLowerCase()) {
      case 'prometheus':
        url = `http://localhost:${config.prometheus.port}`;
        break;
      case 'grafana':
        if (!config.grafana.enabled) {
          console.log(chalk.yellow('⚠️ Grafana is not enabled'));
          console.log(chalk.blue('   Run "recoder-code monitor setup --grafana" to enable'));
          return;
        }
        url = `http://localhost:${config.grafana.port}`;
        break;
      case 'alertmanager':
        if (!config.alertmanager.enabled) {
          console.log(chalk.yellow('⚠️ Alertmanager is not enabled'));
          return;
        }
        url = `http://localhost:${config.alertmanager.port}`;
        break;
      default:
        console.log(chalk.red(`❌ Unknown service: ${service}`));
        return;
    }

    console.log(chalk.cyan(`🌐 Opening ${service} dashboard: ${url}`));
    
    // Try to open in browser
    const platform = os.platform();
    let openCommand;
    
    if (platform === 'darwin') openCommand = 'open';
    else if (platform === 'win32') openCommand = 'start';
    else openCommand = 'xdg-open';
    
    try {
      await execAsync(`${openCommand} ${url}`);
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not open browser automatically`));
      console.log(chalk.blue(`   Please open: ${url}`));
    }
  }

  async showHelp() {
    console.log(chalk.cyan('🔍 Recoder-Code Monitoring System'));
    console.log('');
    console.log(chalk.yellow('📊 COMMANDS:'));
    console.log('  setup      Set up Prometheus/Grafana monitoring');
    console.log('  status     Check monitoring services status');
    console.log('  stop       Stop monitoring services');
    console.log('  logs       View service logs');
    console.log('  dashboard  Open monitoring dashboard');
    console.log('');
    console.log(chalk.yellow('📋 EXAMPLES:'));
    console.log('  recoder-code monitor setup                # Basic Prometheus setup');
    console.log('  recoder-code monitor setup --grafana      # Include Grafana');
    console.log('  recoder-code monitor status               # Check health');
    console.log('  recoder-code monitor logs prometheus      # View logs');
    console.log('  recoder-code monitor dashboard grafana    # Open Grafana');
    console.log('');
    console.log(chalk.yellow('🔧 OPTIONS:'));
    console.log('  --grafana      Enable Grafana dashboard');
    console.log('  --alertmanager Enable Alertmanager');
    console.log('  --port <PORT>  Custom Prometheus port (default: 9090)');
    console.log('');
    console.log(chalk.blue('💡 The monitoring system uses the Prometheus configuration'));
    console.log(chalk.blue('   from the monitoring/ directory in your installation.'));
  }
}

module.exports = MonitoringManager;