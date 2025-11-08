#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const configPath = path.join(process.cwd(), '.recoderrc');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('Error loading configuration:', err.message);
    process.exit(1);
  }
}

function decryptApiKey(encryptedApiKey, encryptionKey, encryptionIV) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), Buffer.from(encryptionIV, 'hex'));
  let decryptedApiKey = decipher.update(encryptedApiKey, 'hex', 'utf8');
  decryptedApiKey += decipher.final('utf8');
  return decryptedApiKey;
}

const config = loadConfig();

if (!config.openRouterApiKey || !config.openRouterModel) {
  console.error('API key or model not configured. Please run the setup wizard.');
  process.exit(1);
}

const apiKey = decryptApiKey(config.openRouterApiKey, process.env.ENCRYPTION_KEY, process.env.ENCRYPTION_IV);
const model = config.openRouterModel;
const proxyUrl = config.openRouterProxyUrl || null;

console.log(`Configured API Key: ${apiKey}`);
console.log(`Configured Model: ${model}`);
console.log(`Configured Proxy URL: ${proxyUrl}`);