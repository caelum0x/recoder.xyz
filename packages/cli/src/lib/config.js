const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class Config {
  constructor() {
    this.configPath = path.join(os.homedir(), '.codecraft', 'config.json');
    this.config = {};
    this.loaded = false;
  }

  async load(customPath = null) {
    try {
      const configPath = customPath || this.configPath;
      
      if (await fs.pathExists(configPath)) {
        this.config = await fs.readJSON(configPath);
        this.loaded = true;
      } else {
        this.config = this.getDefaultConfig();
        await this.save();
      }
    } catch (error) {
      this.config = this.getDefaultConfig();
    }
  }

  async save() {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      await fs.writeJSON(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  get(key, defaultValue = null) {
    if (!this.loaded) {
      this.load();
    }
    return this.config[key] || defaultValue;
  }

  set(key, value) {
    this.config[key] = value;
  }

  getDefaultConfig() {
    return {
      logLevel: 'info',
      enableTelemetry: true,
      defaultModel: 'gpt-4',
      apiEndpoint: 'https://api.codecraft.dev',
      created: new Date().toISOString()
    };
  }

  getAll() {
    return { ...this.config };
  }
}

const config = new Config();

module.exports = { config, Config };