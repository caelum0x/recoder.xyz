#!/usr/bin/env node
/**
 * Test additional AI providers
 */

const https = require('https');
const fs = require('fs');

// Load environment variables
const envFile = fs.readFileSync('/Users/arhansubasi/recoder.xyz/.env.production', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key] = value.replace(/"/g, '');
  }
});

const ADDITIONAL_PROVIDERS = [
  {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }),
    testKey: envVars.OPENAI_API_KEY
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'microsoft/wizardlm-2-8x22b',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }),
    testKey: envVars.OPENROUTER_API_KEY
  },
  {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }),
    testKey: envVars.DEEPSEEK_API_KEY
  }
];

async function testProvider(provider) {
  return new Promise((resolve) => {
    if (!provider.testKey) {
      resolve({ name: provider.name, status: 'SKIP', error: 'No API key' });
      return;
    }

    const url = new URL(provider.url);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: provider.headers,
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve({ 
              name: provider.name, 
              status: 'OK', 
              statusCode: res.statusCode,
              hasResponse: !!response 
            });
          } else {
            resolve({ 
              name: provider.name, 
              status: 'ERROR', 
              statusCode: res.statusCode,
              error: response.error?.message || 'Unknown error'
            });
          }
        } catch (e) {
          resolve({ 
            name: provider.name, 
            status: 'ERROR', 
            error: 'Invalid JSON response' 
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ 
        name: provider.name, 
        status: 'ERROR', 
        error: error.message 
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ 
        name: provider.name, 
        status: 'TIMEOUT', 
        error: 'Request timeout' 
      });
    });

    req.write(provider.body);
    req.end();
  });
}

async function testAdditionalProviders() {
  console.log('🔥 Testing Additional AI Providers...\n');
  
  let totalWorking = 0;
  for (const provider of ADDITIONAL_PROVIDERS) {
    process.stdout.write(`Testing ${provider.name}... `);
    const result = await testProvider(provider);
    console.log(`${result.status === 'OK' ? '✅ OK' : result.status === 'SKIP' ? '⚠️  SKIP' : '❌ ERROR'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.status === 'OK') totalWorking++;
  }
  
  console.log(`\n✅ Additional working providers: ${totalWorking}/${ADDITIONAL_PROVIDERS.length}`);
  return totalWorking;
}

testAdditionalProviders().catch(console.error);