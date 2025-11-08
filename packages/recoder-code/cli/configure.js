#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const OpenAI = require('openai');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const configPath = path.join(process.cwd(), '.recoderrc');
const localesPath = path.join(__dirname, '../locales/en.json');
const logPath = path.join(__dirname, '../logs/setup.log');

let translations = {};

try {
  translations = JSON.parse(fs.readFileSync(localesPath, 'utf8'));
} catch (err) {
  console.error('Error loading translations:', err.message);
  process.exit(1);
}

function log(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `${timestamp} - ${message}\n`);
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(translations.configSaved);
    log('Configuration saved');
  } catch (err) {
    console.error('Error saving configuration:', err.message);
    log(`Error saving configuration: ${err.message}`);
    process.exit(1);
  }
}

function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    log('Configuration loaded');
    return config;
  } catch (err) {
    if (err.code === 'ENOENT') {
      log('Configuration file not found');
      return {};
    }
    console.error('Error loading configuration:', err.message);
    log(`Error loading configuration: ${err.message}`);
    process.exit(1);
  }
}

function askQuestion(query) {
  if (typeof query !== 'string') {
    throw new Error('Query must be a string');
  }
  return new Promise(resolve => rl.question(query, resolve));
}

async function configure() {
  let config = loadConfig();

  if (Object.keys(config).length > 0) {
    const overwrite = await askQuestion(translations.configExists);
    log(`User chose to overwrite configuration: ${overwrite.toLowerCase() === 'y'}`);
    if (overwrite.toLowerCase() === 'y') {
      console.log(translations.configOverwritten);
      log('Overwriting existing configuration');
      config = {};
    } else {
      const merge = await askQuestion(translations.mergeConfig);
      log(`User chose to merge configuration: ${merge.toLowerCase() === 'y'}`);
      if (merge.toLowerCase() === 'y') {
        console.log('Merging with existing configuration.');
        log('Merging with existing configuration');
      } else {
        console.log(translations.configAborted);
        log('Configuration setup aborted');
        rl.close();
        return;
      }
    }
  }

  // Check if ENCRYPTION_KEY and ENCRYPTION_IV are set
  let encryptionKey = process.env.ENCRYPTION_KEY;
  let encryptionIV = process.env.ENCRYPTION_IV;

  if (!encryptionKey || !encryptionIV) {
    // Generate a random 256-bit key and a 128-bit IV
    encryptionKey = crypto.randomBytes(32).toString('hex');
    encryptionIV = crypto.randomBytes(16).toString('hex');

    // Save the generated key and IV to the .recoderrc file
    config.ENCRYPTION_KEY = encryptionKey;
    config.ENCRYPTION_IV = encryptionIV;
    saveConfig(config);

    log('Generated and saved encryption key and IV');
  }

  if (!encryptionKey || !encryptionIV) {
    console.error(translations.encryptionError);
    log('Encryption key and IV are not set');
    process.exit(1);
  }

  const apiKey = await askQuestion(translations.apiKeyPrompt);
  log(`User entered API key: ${'*'.repeat(apiKey.length)}`);
  const model = await askQuestion(translations.modelPrompt) || 'gpt-3.5-turbo';
  log(`User entered model: ${model}`);
  const proxyUrl = await askQuestion(translations.proxyUrlPrompt);
  log(`User entered proxy URL: ${proxyUrl || 'None'}`);

  // Encrypt the API key
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), Buffer.from(encryptionIV, 'hex'));
  let encryptedApiKey = cipher.update(apiKey, 'utf8', 'hex');
  encryptedApiKey += cipher.final('hex');

  config.openRouterApiKey = encryptedApiKey;
  config.openRouterModel = model;
  config.openRouterProxyUrl = proxyUrl;

  // Usage analytics opt-in prompt
  const analyticsOptIn = await askQuestion(translations.analyticsOptInPrompt);
  log(`User opted into analytics: ${analyticsOptIn.toLowerCase() === 'y'}`);
  config.analyticsOptIn = analyticsOptIn.toLowerCase() === 'y';

  // Summary screen
  console.log('\nSummary of your configuration:');
  console.log(`Open Router API Key: ${'*'.repeat(apiKey.length)}`);
  console.log(`Open Router Model: ${config.openRouterModel}`);
  console.log(`Open Router Proxy URL: ${config.openRouterProxyUrl || 'None'}`);
  console.log(`Analytics Opt-In: ${config.analyticsOptIn ? 'Yes' : 'No'}`);

  const confirmSave = await askQuestion('Do you want to save this configuration? (y/n): ');
  log(`User confirmed save: ${confirmSave.toLowerCase() === 'y'}`);
  if (confirmSave.toLowerCase() === 'y') {
    saveConfig(config);
  } else {
    console.log('Configuration setup aborted.');
    log('Configuration setup aborted');
  }

  rl.close();
}

function viewConfig() {
  const config = loadConfig();
  if (Object.keys(config).length === 0) {
    console.log('No configuration found.');
    log('No configuration found');
    return;
  }

  // Decrypt the API key
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(config.ENCRYPTION_KEY, 'hex'), Buffer.from(config.ENCRYPTION_IV, 'hex'));
  let decryptedApiKey = decipher.update(config.openRouterApiKey, 'hex', 'utf8');
  decryptedApiKey += decipher.final('utf8');

  console.log('Current Configuration:');
  console.log(`Open Router API Key: ${'*'.repeat(decryptedApiKey.length)}`);
  console.log(`Open Router Model: ${config.openRouterModel}`);
  console.log(`Open Router Proxy URL: ${config.openRouterProxyUrl || 'None'}`);
  console.log(`Analytics Opt-In: ${config.analyticsOptIn ? 'Yes' : 'No'}`);
  log('Configuration viewed');
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--view')) {
    viewConfig();
  } else {
    configure();
  }
}


main();
