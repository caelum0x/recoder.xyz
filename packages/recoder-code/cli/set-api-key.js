#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const configPath = path.join(process.cwd(), '.recoderrc');

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Configuration saved to .recoderrc');
  } catch (err) {
    console.error('Error saving configuration:', err.message);
    process.exit(1);
  }
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('Error loading configuration:', err.message);
    process.exit(1);
  }
}

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setApiKey() {
  const config = loadConfig();

  // Check if ENCRYPTION_KEY and ENCRYPTION_IV are set
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const encryptionIV = process.env.ENCRYPTION_IV;

  if (!encryptionKey || !encryptionIV) {
    console.error('Encryption key and IV are not set. Please run the setup wizard to set them.');
    process.exit(1);
  }

  const apiKey = await askQuestion('Enter your new Open Router API key: ');

  // Encrypt the API key
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), Buffer.from(encryptionIV, 'hex'));
  let encryptedApiKey = cipher.update(apiKey, 'utf8', 'hex');
  encryptedApiKey += cipher.final('hex');

  config.openRouterApiKey = encryptedApiKey;

  saveConfig(config);

  rl.close();
}

setApiKey();