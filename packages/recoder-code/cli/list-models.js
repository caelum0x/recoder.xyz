#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const { Command } = require('commander');

const program = new Command();

program
  .description('List available models from OpenRouter API')
  .action(async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      console.error('No valid Open Router API key found. Please configure it using `node setup-wizard.js`.');
      process.exit(1);
    }

    async function listModels() {
      try {
        const response = await axios.get('https://api.openrouter.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('Available models:');
        response.data.data.forEach(model => {
          console.log(`- ${model.id}`);
        });
      } catch (err) {
        console.error('Error listing models:', err.message);
        process.exit(1);
      }
    }

    listModels();
  })
  .addHelpText('afterAll', `
Examples:
  $ node list-models.js
`);

program.parse(process.argv);