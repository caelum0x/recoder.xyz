// Global setup for Jest tests
const fs = require('fs');
const path = require('path');

// Log current working directory
console.log('Current working directory:', process.cwd());
console.log('Resolved .recoderrc path:', path.resolve(__dirname, '..', '.recoderrc'));
console.log('Current working directory:', process.cwd());

// Mock axios
jest.mock('axios');

// Mock OpenAI
jest.mock('openai');

// Load .recoderrc configuration
const configPath = path.join(__dirname, '..', '.recoderrc');
console.log('Resolved .recoderrc path:', configPath);

if (!fs.existsSync(configPath)) {
  throw new Error('.recoderrc file not found');
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Set encryption key for tests
process.env.ENCRYPTION_KEY = config.encryptionKey || 'test-encryption-key';

// Export the config for use in tests
global.config = config;