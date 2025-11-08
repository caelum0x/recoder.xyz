#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), '.recoderrc');

function deleteConfig() {
  try {
    fs.unlinkSync(configPath);
    console.log('Configuration deleted successfully.');
  } catch (err) {
    console.error('Error deleting configuration:', err.message);
    process.exit(1);
  }
}

function resetConfig() {
  try {
    const defaultConfig = {
      openRouterApiKey: '',
      openRouterModel: '',
      openRouterProxyUrl: null
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log('Configuration reset to default values.');
  } catch (err) {
    console.error('Error resetting configuration:', err.message);
    process.exit(1);
  }
}

const action = process.argv[2];

switch (action) {
  case 'delete':
    deleteConfig();
    break;
  case 'reset':
    resetConfig();
    break;
  default:
    console.log('Usage: reset-config.js [delete|reset]');
    process.exit(1);
}