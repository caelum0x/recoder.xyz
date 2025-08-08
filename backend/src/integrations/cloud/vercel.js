const axios = require('axios');
const { logger } = require('../../utils/logger');

class VercelIntegration {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.VERCEL_API_KEY;
    this.teamId = config.teamId || process.env.VERCEL_TEAM_ID;
    this.baseURL = 'https://api.vercel.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (this.teamId) {
      this.client.defaults.params = { teamId: this.teamId };
    }
  }

  async authenticate() {
    try {
      if (!this.apiKey) {
        throw new Error('Vercel API key not configured');
      }

      const response = await this.client.get('/v2/user');
      logger.info('Vercel authentication successful:', response.data.user);
      return { success: true, user: response.data.user };
    } catch (error) {
      logger.error('Vercel authentication failed:', error);
      return { success: false, error: error.message };
    }
  }

  async deployProject(projectConfig) {
    try {
      const { name, gitUrl, framework, envVars = {}, buildCommand, outputDirectory } = projectConfig;

      // Create project deployment
      const deploymentData = {
        name,
        gitSource: {
          type: 'github',
          repo: gitUrl
        },
        framework,
        buildCommand,
        outputDirectory,
        env: Object.entries(envVars).map(([key, value]) => ({
          key,
          value,
          type: 'encrypted'
        }))
      };

      const response = await this.client.post('/v13/deployments', deploymentData);
      
      logger.info(`Vercel deployment created: ${response.data.url}`);
      
      return {
        success: true,
        deploymentId: response.data.id,
        url: response.data.url,
        inspectorUrl: response.data.inspectorUrl
      };
    } catch (error) {
      logger.error('Vercel deployment failed:', error);
      return { 
        success: false, 
        error: error.response?.data?.error?.message || error.message 
      };
    }
  }

  async getDeploymentStatus(deploymentId) {
    try {
      const response = await this.client.get(`/v13/deployments/${deploymentId}`);
      return {
        success: true,
        status: response.data.readyState,
        url: response.data.url,
        createdAt: response.data.createdAt,
        buildDuration: response.data.buildingAt ? 
          Date.now() - new Date(response.data.buildingAt).getTime() : null
      };
    } catch (error) {
      logger.error('Failed to get Vercel deployment status:', error);
      return { success: false, error: error.message };
    }
  }

  async listProjects() {
    try {
      const response = await this.client.get('/v9/projects');
      return {
        success: true,
        projects: response.data.projects.map(project => ({
          id: project.id,
          name: project.name,
          framework: project.framework,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }))
      };
    } catch (error) {
      logger.error('Failed to list Vercel projects:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteProject(projectId) {
    try {
      await this.client.delete(`/v9/projects/${projectId}`);
      logger.info(`Vercel project deleted: ${projectId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete Vercel project:', error);
      return { success: false, error: error.message };
    }
  }

  // Environment variables management
  async setEnvironmentVariable(projectId, key, value, target = ['production', 'preview', 'development']) {
    try {
      const response = await this.client.post(`/v9/projects/${projectId}/env`, {
        key,
        value,
        type: 'encrypted',
        target
      });
      
      return { success: true, envVar: response.data };
    } catch (error) {
      logger.error('Failed to set Vercel environment variable:', error);
      return { success: false, error: error.message };
    }
  }

  async getEnvironmentVariables(projectId) {
    try {
      const response = await this.client.get(`/v9/projects/${projectId}/env`);
      return {
        success: true,
        envVars: response.data.envs.map(env => ({
          id: env.id,
          key: env.key,
          target: env.target,
          createdAt: env.createdAt,
          updatedAt: env.updatedAt
        }))
      };
    } catch (error) {
      logger.error('Failed to get Vercel environment variables:', error);
      return { success: false, error: error.message };
    }
  }

  // Domain management
  async addDomain(projectId, domain) {
    try {
      const response = await this.client.post(`/v9/projects/${projectId}/domains`, {
        name: domain
      });
      
      return { success: true, domain: response.data };
    } catch (error) {
      logger.error('Failed to add Vercel domain:', error);
      return { success: false, error: error.message };
    }
  }

  async getDomains(projectId) {
    try {
      const response = await this.client.get(`/v9/projects/${projectId}/domains`);
      return {
        success: true,
        domains: response.data.domains
      };
    } catch (error) {
      logger.error('Failed to get Vercel domains:', error);
      return { success: false, error: error.message };
    }
  }

  // Utility methods
  isConfigured() {
    return !!(this.apiKey);
  }

  getConfiguration() {
    return {
      hasApiKey: !!this.apiKey,
      hasTeamId: !!this.teamId,
      baseURL: this.baseURL
    };
  }
}

module.exports = VercelIntegration;