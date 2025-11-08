const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenRouterClient = require('openrouter-client'); // Import openrouter-client

const configPath = path.join(process.cwd(), '.recoderrc');

function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('Configuration file not found. Please run `cli/configure.js` to set up your configuration.');
      process.exit(1);
    }
    console.error('Error loading configuration:', err.message);
    process.exit(1);
  }
}

function decryptApiKey(config) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(config.ENCRYPTION_KEY, 'hex'), Buffer.from(config.ENCRYPTION_IV, 'hex'));
  let decryptedApiKey = decipher.update(config.openRouterApiKey, 'hex', 'utf8');
  decryptedApiKey += decipher.final('utf8');
  return decryptedApiKey;
}

module.exports = {
  generatePrompt: async (userInput) => {
    const config = loadConfig();
    const apiKey = decryptApiKey(config);
    const model = config.openRouterModel || 'gpt-3.5-turbo';

    const client = new OpenRouterClient({ apiKey, model });

    const prompt = `You are a powerful command-line AI assistant using the Open Router API. Your task is to ${userInput}. Provide detailed instructions and code snippets as needed.`;

    try {
      const response = await client.send(prompt);
      return response;
    } catch (err) {
      console.error('Error sending prompt to Open Router API:', err.message);
      process.exit(1);
    }
  }
};