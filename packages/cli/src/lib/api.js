const axios = require('axios');
const { logger } = require('../utils/logger');

class APIClient {
  constructor(baseURL = 'https://api.codecraft.dev') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    this.auth = {
      login: this.login.bind(this),
      logout: this.logout.bind(this),
      status: this.status.bind(this)
    };
  }

  async login() {
    try {
      // Mock authentication for development
      logger.info('Authentication successful (mock)');
      return { 
        success: true, 
        user: { email: 'user@example.com' },
        token: 'mock-token'
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async logout() {
    try {
      // Mock logout for development
      logger.info('Logout successful (mock)');
      return { success: true };
    } catch (error) {
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  async status() {
    try {
      // Mock status check for development
      return { 
        authenticated: true, 
        user: { email: 'user@example.com' }
      };
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }
}

const apiClient = new APIClient();

module.exports = { apiClient, APIClient };