#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

const program = new Command();

program
  .description('Validate the Open Router API key')
  .action(async () => {
    const configPath = path.join(process.cwd(), '.recoderrc');

    function loadConfig() {
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (err) {
        console.error('Error reading .recoderrc:', err.message);
        process.exit(1);
      }
    }

    const config = loadConfig();
    const apiKey = config.openRouterApiKey;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      console.error('No valid Open Router API key found. Please configure it using `node setup-wizard.js`.');
      process.exit(1);
    }

const axiosRetry = require('axios-retry');

axiosRetry(axios, {
  retries: 3,
  retryCondition: (error) => {
    return error.response.status === 429; // Retry on rate limit errors
  },
  retryDelay: (retryCount) => {
    return retryCount * 1000; // Exponential backoff
  }
});
    async function validateApiKey() {
      try {
        const response = await axios.get('https://api.openrouter.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('API key is valid.');
      } catch (err) {
        console.error('Invalid API key:', err.message);
        process.exit(1);
      }
    }

    validateApiKey();
  })
  .addHelpText('afterAll', `
Examples:
  $ node validate-api-key.js
`);

program.parse(process.argv);