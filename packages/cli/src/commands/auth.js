const { Command } = require('commander');
const { apiClient } = require('../lib/api');
const { logger } = require('../utils/logger');

class AuthCommand {
  constructor() {
    this.command = new Command('auth');
    this.setupCommands();
  }

  setupCommands() {
    this.command
      .description('Authentication commands')
      .command('login')
      .description('Login to CodeCraft')
      .action(this.login.bind(this));

    this.command
      .command('logout')
      .description('Logout from CodeCraft')
      .action(this.logout.bind(this));

    this.command
      .command('status')
      .description('Check authentication status')
      .action(this.status.bind(this));
  }

  async login() {
    try {
      logger.info('Starting authentication process...');
      const result = await apiClient.auth.login();
      logger.success('Successfully authenticated!');
      return result;
    } catch (error) {
      logger.error('Authentication failed:', error.message);
      process.exit(1);
    }
  }

  async logout() {
    try {
      await apiClient.auth.logout();
      logger.success('Successfully logged out!');
    } catch (error) {
      logger.error('Logout failed:', error.message);
    }
  }

  async status() {
    try {
      const status = await apiClient.auth.status();
      if (status.authenticated) {
        logger.info(`Authenticated as: ${status.user.email}`);
      } else {
        logger.info('Not authenticated');
      }
    } catch (error) {
      logger.error('Failed to check status:', error.message);
    }
  }
}

module.exports = { AuthCommand };