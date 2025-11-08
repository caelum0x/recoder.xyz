/**
 * Services Manager - Integrates with hosted/local services
 * Adds collaboration, plugin registry, and ML training to existing CLI
 */

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class ServicesManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.recoder-services-config.json');
    this.config = this.loadConfig();
    this.wsConnection = null;
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load services config: ${error.message}`));
    }

    // Default configuration
    return {
      services: {
        ml: process.env.RECODER_ML_SERVICE || 'http://localhost:8000',
        plugins: process.env.RECODER_PLUGIN_REGISTRY || 'http://localhost:3000', 
        collaboration: process.env.RECODER_COLLAB_SERVICE || 'http://localhost:3003'
      },
      auth: {
        token: null,
        user: null
      },
      enabled: true
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save config: ${error.message}`));
    }
  }

  async retryWithBackoff(operation, context = '') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }
        
        const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
        console.log(chalk.yellow(`⚠️  ${context} failed (attempt ${attempt}/${this.retryConfig.maxRetries}), retrying in ${delay}ms...`));
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // Network errors, timeouts, 5xx server errors are retryable
    return (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      (error.response && error.response.status >= 500)
    );
  }

  async checkServicesHealth() {
    if (!this.config.enabled) {
      return { available: false, reason: 'Services disabled' };
    }

    const results = {};
    
    for (const [name, url] of Object.entries(this.config.services)) {
      try {
        const response = await axios.get(`${url}/health`, { timeout: 2000 });
        results[name] = { 
          available: true, 
          status: response.data.status,
          url: url
        };
      } catch (error) {
        results[name] = { 
          available: false, 
          error: error.message,
          url: url
        };
      }
    }

    return results;
  }

  // Authenticate with ML service and get JWT token
  async authenticate() {
    if (this.config.auth.token && this.config.auth.expires_at && Date.now() < this.config.auth.expires_at) {
      return this.config.auth.token;
    }

    try {
      // Login to ML service to get a real JWT token
      const loginResponse = await axios.post(`${this.config.services.ml}/api/v1/auth/login`, {
        username: 'testuser',
        password: 'testpass123'
      });

      const { access_token, expires_in } = loginResponse.data;
      
      this.config.auth.token = access_token;
      this.config.auth.expires_at = Date.now() + (expires_in * 1000);
      this.config.auth.user = {
        id: 'testuser',
        name: 'Test User',
        email: 'test@example.com'
      };
      
      this.saveConfig();
      console.log(chalk.gray('🔐 Authenticated with ML service'));
      return access_token;

    } catch (error) {
      console.log(chalk.yellow(`⚠️  Authentication failed: ${error.message}`));
      // Fallback to local token for other services
      const token = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.config.auth.token = token;
      this.config.auth.user = {
        id: 'local_user',
        name: 'Local User',
        email: 'user@localhost'
      };
      this.saveConfig();
      return token;
    }
  }

  async getAuthHeaders() {
    const token = await this.authenticate();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // ML Training Service Integration
  async trainModel(config) {
    console.log(chalk.blue('🧠 Submitting model training job...'));
    
    return await this.retryWithBackoff(async () => {
      const headers = await this.getAuthHeaders();
      
      // Transform config to match API schema
      const mergeRequest = {
        name: config.name || `merge-${Date.now()}`,
        description: config.description || 'Model merge job from CLI',
        merge_method: config.merge_method || 'linear',
        models: config.models.map(m => ({
          model: m.model,
          parameters: { weight: m.weight, ...m.parameters }
        })),
        parameters: {
          dtype: config.dtype || 'float16',
          output_path: config.output_path || './merged-model',
          ...config.parameters
        },
        tags: config.tags || ['cli-merge']
      };
      
      const response = await axios.post(
        `${this.config.services.ml}/api/v1/merge/jobs`,
        mergeRequest,
        { headers, timeout: 30000 }
      );
      
      console.log(chalk.green(`✅ Training job submitted: ${response.data.job_id}`));
      return response.data;
    }, 'ML training job submission').catch(error => {
      console.log(chalk.red(`❌ Training failed: ${error.response?.data?.detail || error.message}`));
      throw error;
    });
  }

  async getTrainingStatus(jobId) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(
        `${this.config.services.ml}/api/v1/merge/jobs/${jobId}`,
        { headers }
      );
      return response.data;
    } catch (error) {
      console.log(chalk.red(`❌ Could not get training status: ${error.message}`));
      throw error;
    }
  }

  // Plugin Registry Integration
  async searchPlugins(query) {
    try {
      const response = await axios.get(
        `${this.config.services.plugins}/api/packages/search`,
        { params: { q: query } }
      );
      
      return response.data.results || [];
    } catch (error) {
      console.log(chalk.red(`❌ Plugin search failed: ${error.message}`));
      return [];
    }
  }

  async installPlugin(name) {
    try {
      console.log(chalk.blue(`📦 Installing plugin ${name}...`));
      
      const headers = await this.getAuthHeaders();
      const response = await axios.post(
        `${this.config.services.plugins}/api/packages/${name}/install`,
        {},
        { headers }
      );
      
      console.log(chalk.green(`✅ Plugin ${name} installed successfully`));
      return response.data;
    } catch (error) {
      console.log(chalk.red(`❌ Plugin installation failed: ${error.message}`));
      throw error;
    }
  }

  // Collaboration Service Integration
  async createCollaborationSession(name = 'Untitled Session') {
    try {
      console.log(chalk.blue(`🤝 Creating collaboration session "${name}"...`));
      
      const headers = await this.getAuthHeaders();
      const response = await axios.post(
        `${this.config.services.collaboration}/api/sessions`,
        { name },
        { headers }
      );
      
      const sessionId = response.data.sessionId;
      console.log(chalk.green(`✅ Session created: ${sessionId}`));
      console.log(chalk.cyan(`🔗 Join URL: ${this.config.services.collaboration}/session/${sessionId}`));
      
      return sessionId;
    } catch (error) {
      console.log(chalk.red(`❌ Session creation failed: ${error.message}`));
      throw error;
    }
  }

  async joinCollaboration(sessionId) {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.services.collaboration.replace('http://', 'ws://').replace('https://', 'wss://');
        
        console.log(chalk.blue(`🔗 Connecting to collaboration session ${sessionId}...`));
        
        this.wsConnection = new WebSocket(`${wsUrl}/ws`);
        
        this.wsConnection.on('open', () => {
          console.log(chalk.green('✅ Connected to collaboration session'));
          
          // Send authentication and join session
          this.wsConnection.send(JSON.stringify({
            type: 'authenticate',
            token: this.config.auth.token
          }));
          
          this.wsConnection.send(JSON.stringify({
            type: 'join-session',
            sessionId: sessionId
          }));
          
          resolve(sessionId);
        });
        
        this.wsConnection.on('message', (data) => {
          const message = JSON.parse(data.toString());
          this.handleCollaborationMessage(message);
        });
        
        this.wsConnection.on('error', (error) => {
          console.log(chalk.red(`❌ Collaboration error: ${error.message}`));
          reject(error);
        });
        
        this.wsConnection.on('close', () => {
          console.log(chalk.yellow('🔌 Collaboration session ended'));
        });
        
      } catch (error) {
        console.log(chalk.red(`❌ Failed to join collaboration: ${error.message}`));
        reject(error);
      }
    });
  }

  handleCollaborationMessage(message) {
    switch (message.type) {
      case 'user-joined':
        console.log(chalk.green(`👥 ${message.user?.username || 'User'} joined the session`));
        break;
      case 'user-left':  
        console.log(chalk.yellow(`👋 ${message.user?.username || 'User'} left the session`));
        break;
      case 'operation':
        console.log(chalk.blue(`📝 Document updated by ${message.author || 'someone'}`));
        break;
      case 'cursor-position':
        // Don't spam cursor updates
        break;
      default:
        console.log(chalk.gray(`📨 ${message.type}: ${JSON.stringify(message)}`));
    }
  }

  // Service management commands
  async servicesCommand(action, ...args) {
    switch (action) {
      case 'status':
        await this.showServicesStatus();
        break;
      case 'config':
        console.log(chalk.cyan('⚙️  Current services configuration:'));
        console.log(JSON.stringify(this.config, null, 2));
        break;
      case 'enable':
        this.config.enabled = true;
        this.saveConfig();
        console.log(chalk.green('✅ Services enabled'));
        break;
      case 'disable':
        this.config.enabled = false;
        this.saveConfig();
        console.log(chalk.yellow('⏸️  Services disabled'));
        break;
      case 'reset':
        fs.unlinkSync(this.configPath);
        console.log(chalk.green('✅ Services configuration reset'));
        break;
      default:
        console.log(chalk.yellow('Usage: recoder-code services <status|config|enable|disable|reset>'));
    }
  }

  async showServicesStatus() {
    console.log(chalk.cyan.bold('\n🔍 Recoder Code Services Status\n'));
    
    if (!this.config.enabled) {
      console.log(chalk.yellow('⏸️  Services are disabled'));
      console.log(chalk.gray('   Enable with: recoder-code services enable\n'));
      return;
    }
    
    const health = await this.checkServicesHealth();
    
    Object.entries(health).forEach(([name, status]) => {
      if (status.available) {
        console.log(chalk.green(`✅ ${name.toUpperCase()}: ${status.status} (${status.url})`));
      } else {
        console.log(chalk.red(`❌ ${name.toUpperCase()}: offline (${status.url})`));
        console.log(chalk.gray(`   Error: ${status.error}`));
      }
    });
    
    console.log();
  }

  // User Management
  async registerUser(username, email, password, fullName = null) {
    try {
      console.log(chalk.blue(`👤 Registering user ${username}...`));
      
      const response = await axios.post(
        `${this.config.services.ml}/api/v1/auth/register`,
        {
          username,
          email,
          password,
          full_name: fullName
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
      
      console.log(chalk.green(`✅ User ${username} registered successfully`));
      return response.data;
    } catch (error) {
      const message = error.response?.data?.detail || error.message;
      console.log(chalk.red(`❌ Registration failed: ${message}`));
      throw error;
    }
  }

  async loginUser(username, password) {
    try {
      console.log(chalk.blue(`🔐 Logging in user ${username}...`));
      
      const response = await axios.post(
        `${this.config.services.ml}/api/v1/auth/login`,
        { username, password },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
      
      const { access_token, expires_in } = response.data;
      
      // Save authentication info
      this.config.auth.token = access_token;
      this.config.auth.expires_at = Date.now() + (expires_in * 1000);
      this.config.auth.user = {
        username,
        authenticated_at: new Date().toISOString()
      };
      
      this.saveConfig();
      console.log(chalk.green(`✅ Successfully logged in as ${username}`));
      return response.data;
    } catch (error) {
      const message = error.response?.data?.detail || error.message;
      console.log(chalk.red(`❌ Login failed: ${message}`));
      throw error;
    }
  }

  async getUserInfo() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(
        `${this.config.services.ml}/api/v1/auth/me`,
        { headers, timeout: 10000 }
      );
      
      return response.data;
    } catch (error) {
      console.log(chalk.red(`❌ Could not get user info: ${error.message}`));
      throw error;
    }
  }

  logoutUser() {
    this.config.auth = {
      token: null,
      user: null,
      expires_at: null
    };
    this.saveConfig();
    console.log(chalk.green('✅ Successfully logged out'));
  }

  // Integration with main CLI
  async handleServiceCommand(command, ...args) {
    if (!this.config.enabled) {
      console.log(chalk.yellow('⏸️  Services are disabled. Enable with: recoder-code services enable'));
      return;
    }

    try {
      switch (command) {
        case 'train':
          await this.handleTrainCommand(...args);
          break;
        case 'collab':
        case 'collaborate':
          await this.handleCollabCommand(...args);
          break;
        case 'plugins':
          await this.handlePluginCommand(...args);
          break;
        case 'services':
          await this.servicesCommand(...args);
          break;
        case 'auth':
        case 'user':
          await this.handleUserCommand(...args);
          break;
        case 'config':
          const ConfigManager = require('./config-manager');
          const configManager = new ConfigManager();
          await configManager.handleConfigCommand(...args);
          break;
        default:
          return false; // Command not handled
      }
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Service command failed: ${error.message}`));
      return true; // We handled it, even if it failed
    }
  }

  async handleTrainCommand(...args) {
    const [action, configFile] = args;
    
    if (action === 'merge' && configFile) {
      if (!fs.existsSync(configFile)) {
        console.log(chalk.red(`❌ Config file not found: ${configFile}`));
        return;
      }
      
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      await this.trainModel(config);
    } else if (action === 'status' && configFile) {
      const status = await this.getTrainingStatus(configFile);
      console.log(chalk.cyan(`📊 Job ${configFile}: ${status.status}`));
      if (status.progress) {
        console.log(chalk.blue(`📈 Progress: ${status.progress}%`));
      }
    } else {
      console.log(chalk.yellow('Usage: recoder-code train merge <config.json> | status <jobId>'));
    }
  }

  async handleCollabCommand(...args) {
    const [action, sessionId] = args;
    
    if (action === 'create') {
      await this.createCollaborationSession(sessionId || 'New Session');
    } else if (action === 'join' && sessionId) {
      await this.joinCollaboration(sessionId);
      console.log(chalk.green('📝 Collaboration session active. Press Ctrl+C to exit.'));
      
      // Keep process alive for collaboration
      process.stdin.resume();
    } else {
      console.log(chalk.yellow('Usage: recoder-code collab create [name] | join <sessionId>'));
    }
  }

  async handlePluginCommand(...args) {
    const [action, query] = args;
    
    if (action === 'search' && query) {
      const plugins = await this.searchPlugins(query);
      if (plugins.length === 0) {
        console.log(chalk.yellow('No plugins found'));
        return;
      }
      
      console.log(chalk.green(`\n📦 Found ${plugins.length} plugins:\n`));
      plugins.forEach(plugin => {
        console.log(chalk.cyan(`${plugin.name}`) + chalk.gray(` v${plugin.version}`));
        console.log(`   ${plugin.description}`);
        if (plugin.rating) {
          console.log(chalk.gray(`   ⭐ ${plugin.rating}/5 • 📥 ${plugin.downloads || 0} downloads`));
        }
        console.log();
      });
    } else if (action === 'install' && query) {
      await this.installPlugin(query);
    } else {
      console.log(chalk.yellow('Usage: recoder-code plugins search <query> | install <name>'));
    }
  }
  async handleUserCommand(...args) {
    const [action, ...params] = args;
    
    switch (action) {
      case 'register':
        const [username, email, password, fullName] = params;
        if (!username || !email || !password) {
          console.log(chalk.yellow('Usage: recoder-code auth register <username> <email> <password> [fullName]'));
          return;
        }
        await this.registerUser(username, email, password, fullName);
        break;
        
      case 'login':
        const [loginUser, loginPass] = params;
        if (!loginUser || !loginPass) {
          console.log(chalk.yellow('Usage: recoder-code auth login <username> <password>'));
          return;
        }
        await this.loginUser(loginUser, loginPass);
        break;
        
      case 'logout':
        this.logoutUser();
        break;
        
      case 'whoami':
      case 'me':
        try {
          if (!this.config.auth.token) {
            console.log(chalk.yellow('Not logged in. Use: recoder-code auth login <username> <password>'));
            return;
          }
          
          const userInfo = await this.getUserInfo();
          console.log(chalk.cyan.bold('\\n👤 Current User Information\\n'));
          console.log(chalk.green(`Username: ${userInfo.username}`));
          console.log(chalk.green(`Email: ${userInfo.email}`));
          console.log(chalk.green(`Role: ${userInfo.role}`));
          console.log(chalk.green(`Active: ${userInfo.is_active ? 'Yes' : 'No'}`));
          if (userInfo.full_name) {
            console.log(chalk.green(`Full Name: ${userInfo.full_name}`));
          }
          console.log(chalk.gray(`Created: ${new Date(userInfo.created_at).toLocaleString()}\\n`));
        } catch (error) {
          console.log(chalk.red(`❌ Could not get user info: ${error.message}`));
        }
        break;
        
      case 'status':
        if (this.config.auth.token && this.config.auth.user) {
          console.log(chalk.green(`✅ Logged in as ${this.config.auth.user.username}`));
          const expiresAt = new Date(this.config.auth.expires_at);
          console.log(chalk.gray(`Token expires: ${expiresAt.toLocaleString()}`));
        } else {
          console.log(chalk.yellow('❌ Not logged in'));
        }
        break;
        
      default:
        console.log(chalk.yellow('Usage: recoder-code auth <register|login|logout|whoami|status>'));
        console.log(chalk.gray('  register <username> <email> <password> [fullName] - Register new user'));
        console.log(chalk.gray('  login <username> <password>                       - Login to services'));  
        console.log(chalk.gray('  logout                                            - Logout from services'));
        console.log(chalk.gray('  whoami                                            - Show current user info'));
        console.log(chalk.gray('  status                                            - Show authentication status'));
    }
  }
}

module.exports = ServicesManager;