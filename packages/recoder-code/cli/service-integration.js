/**
 * Service Integration for Recoder Code CLI
 * This shows how users would interact with all services through the main CLI
 */

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ServiceManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.recoder-config.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load config, using defaults');
    }

    // Default configuration - hosted services
    return {
      services: {
        'ml-training': {
          url: process.env.RECODER_ML_SERVICE || 'https://ml.recoder.dev',
          local: false
        },
        'plugin-registry': {
          url: process.env.RECODER_PLUGIN_REGISTRY || 'https://plugins.recoder.dev',
          local: false
        },
        'collaboration': {
          url: process.env.RECODER_COLLAB_SERVICE || 'https://collab.recoder.dev',
          local: false
        }
      },
      user: {
        token: null
      }
    };
  }

  saveConfig() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getServiceUrl(serviceName) {
    const service = this.config.services[serviceName];
    if (service.local) {
      const localPorts = {
        'ml-training': 8000,
        'plugin-registry': 3001,
        'collaboration': 3002
      };
      return `http://localhost:${localPorts[serviceName]}`;
    }
    return service.url;
  }
}

class MLTrainingClient {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.baseUrl = serviceManager.getServiceUrl('ml-training');
  }

  async authenticate() {
    const token = this.serviceManager.config.user.token;
    if (!token) {
      throw new Error('Please login first: recoder-code auth login');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  async submitMergeJob(config) {
    try {
      const headers = await this.authenticate();
      const response = await axios.post(
        `${this.baseUrl}/api/v1/merge/jobs`,
        config,
        { headers }
      );
      
      console.log(`🧠 ML Training job submitted: ${response.data.job_id}`);
      console.log(`📊 Status: ${response.data.status}`);
      return response.data;
    } catch (error) {
      console.error('❌ ML Training failed:', error.response?.data?.detail || error.message);
      throw error;
    }
  }

  async getJobStatus(jobId) {
    try {
      const headers = await this.authenticate();
      const response = await axios.get(
        `${this.baseUrl}/api/v1/merge/jobs/${jobId}`,
        { headers }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Could not get job status:', error.message);
      throw error;
    }
  }
}

class PluginRegistryClient {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.baseUrl = serviceManager.getServiceUrl('plugin-registry');
  }

  async searchPlugins(query) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/packages/search`,
        { params: { q: query } }
      );
      
      console.log(`📦 Found ${response.data.results.length} plugins:`);
      response.data.results.forEach(plugin => {
        console.log(`   - ${plugin.name} (⭐ ${plugin.rating}, ${plugin.downloads} downloads)`);
        console.log(`     ${plugin.description}`);
      });
      
      return response.data.results;
    } catch (error) {
      console.error('❌ Plugin search failed:', error.message);
      throw error;
    }
  }

  async installPlugin(pluginName) {
    try {
      // Download plugin metadata
      const response = await axios.get(`${this.baseUrl}/api/packages/${pluginName}`);
      const plugin = response.data;
      
      console.log(`⬇️  Installing ${plugin.name} v${plugin.latest_version}...`);
      
      // Download and install plugin files
      const installResponse = await axios.get(
        `${this.baseUrl}/api/packages/${pluginName}/download`
      );
      
      // Save to local plugins directory
      const pluginsDir = path.join(os.homedir(), '.recoder', 'plugins');
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
      }
      
      const pluginPath = path.join(pluginsDir, pluginName);
      fs.writeFileSync(pluginPath, JSON.stringify(installResponse.data));
      
      console.log(`✅ Plugin ${pluginName} installed successfully`);
      return plugin;
    } catch (error) {
      console.error('❌ Plugin installation failed:', error.message);
      throw error;
    }
  }
}

class CollaborationClient {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.baseUrl = serviceManager.getServiceUrl('collaboration');
    this.ws = null;
  }

  async createSession(name) {
    try {
      const token = this.serviceManager.config.user.token;
      const response = await axios.post(
        `${this.baseUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/sessions`,
        { name },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const sessionId = response.data.session_id;
      console.log(`✅ Collaboration session created: ${sessionId}`);
      console.log(`📋 Share this link: ${this.baseUrl}/session/${sessionId}`);
      
      return sessionId;
    } catch (error) {
      console.error('❌ Session creation failed:', error.message);
      throw error;
    }
  }

  async joinSession(sessionId) {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      const token = this.serviceManager.config.user.token;
      
      this.ws = new WebSocket(`${wsUrl}/ws`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      this.ws.on('open', () => {
        console.log('🔗 Connected to collaboration session');
        
        // Authenticate and join session
        this.ws.send(JSON.stringify({
          type: 'authenticate',
          token: token
        }));
        
        this.ws.send(JSON.stringify({
          type: 'join-session',
          sessionId: sessionId
        }));
      });
      
      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleCollaborationMessage(message);
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ Collaboration connection error:', error.message);
        reject(error);
      });
      
      setTimeout(() => resolve(sessionId), 1000);
    });
  }

  handleCollaborationMessage(message) {
    switch (message.type) {
      case 'user-joined':
        console.log(`👥 ${message.user.username} joined the session`);
        break;
      case 'user-left':
        console.log(`👋 ${message.user.username} left the session`);
        break;
      case 'operation':
        console.log(`📝 Document updated by ${message.author}`);
        // Apply operational transform to local document
        break;
      case 'cursor-position':
        console.log(`🎯 ${message.author} moved cursor to line ${message.cursor.line}`);
        break;
    }
  }
}

// Main CLI Integration
class RecoderCLI {
  constructor() {
    this.serviceManager = new ServiceManager();
    this.mlClient = new MLTrainingClient(this.serviceManager);
    this.pluginClient = new PluginRegistryClient(this.serviceManager);
    this.collabClient = new CollaborationClient(this.serviceManager);
  }

  async handleCommand(command, args) {
    try {
      switch (command) {
        case 'login':
          await this.handleLogin(args);
          break;
        case 'collaborate':
          await this.handleCollaboration(args);
          break;
        case 'plugins':
          await this.handlePlugins(args);
          break;
        case 'train':
          await this.handleTraining(args);
          break;
        case 'services':
          await this.handleServices(args);
          break;
        default:
          console.log('Unknown command. Try: login, collaborate, plugins, train, services');
      }
    } catch (error) {
      console.error(`❌ Command failed: ${error.message}`);
      process.exit(1);
    }
  }

  async handleLogin(args) {
    const [email, password] = args;
    // Authenticate with services and store token
    console.log('🔐 Logging in to Recoder services...');
    // This would integrate with your auth system
    console.log('✅ Login successful');
  }

  async handleCollaboration(args) {
    const [action, sessionId] = args;
    
    if (action === 'create') {
      const newSessionId = await this.collabClient.createSession(sessionId || 'Unnamed Session');
      console.log(`🚀 Starting collaboration session: ${newSessionId}`);
    } else if (action === 'join') {
      await this.collabClient.joinSession(sessionId);
      console.log('📝 Real-time collaboration started. Press Ctrl+C to exit.');
      
      // Keep the process alive for real-time collaboration
      process.stdin.resume();
    }
  }

  async handlePlugins(args) {
    const [action, plugin] = args;
    
    if (action === 'search') {
      await this.pluginClient.searchPlugins(plugin);
    } else if (action === 'install') {
      await this.pluginClient.installPlugin(plugin);
    }
  }

  async handleTraining(args) {
    const [action, configFile] = args;
    
    if (action === 'merge' && configFile) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const job = await this.mlClient.submitMergeJob(config);
      console.log(`⏳ Training job ${job.job_id} submitted. Check status with: recoder-code train status ${job.job_id}`);
    } else if (action === 'status') {
      const status = await this.mlClient.getJobStatus(configFile);
      console.log(`📊 Job ${configFile}: ${status.status}`);
      if (status.progress) {
        console.log(`📈 Progress: ${status.progress}%`);
      }
    }
  }

  async handleServices(args) {
    const [action] = args;
    
    if (action === 'status') {
      console.log('🔍 Checking service status...');
      for (const [name, config] of Object.entries(this.serviceManager.config.services)) {
        try {
          const url = this.serviceManager.getServiceUrl(name);
          const response = await axios.get(`${url}/health`, { timeout: 5000 });
          console.log(`✅ ${name}: ${response.data.status} (${config.local ? 'local' : 'hosted'})`);
        } catch (error) {
          console.log(`❌ ${name}: offline (${config.local ? 'local' : 'hosted'})`);
        }
      }
    } else if (action === 'configure') {
      console.log('⚙️ Service configuration:');
      console.log(JSON.stringify(this.serviceManager.config.services, null, 2));
    }
  }
}

// Export for use in the main CLI
module.exports = {
  RecoderCLI,
  ServiceManager,
  MLTrainingClient,
  PluginRegistryClient,
  CollaborationClient
};

// Example usage in package.json bin script:
if (require.main === module) {
  const cli = new RecoderCLI();
  const [,, command, ...args] = process.argv;
  cli.handleCommand(command, args);
}