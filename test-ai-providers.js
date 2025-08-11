#!/usr/bin/env node
/**
 * Recoder.xyz Multi-AI Provider Test
 * Tests all AI providers with real API keys
 */

const https = require('https');
const fs = require('fs');

// Load environment variables from .env.production
const envFile = fs.readFileSync('/Users/arhansubasi/recoder.xyz/.env.production', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key] = value.replace(/"/g, '');
  }
});

const AI_PROVIDERS = [
  {
    name: 'Anthropic Claude',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': envVars.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say hello' }]
    }),
    testKey: envVars.ANTHROPIC_API_KEY
  },
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }),
    testKey: envVars.GROQ_API_KEY
  },
  {
    name: 'Google Gemini',
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${envVars.GOOGLE_API_KEY}`,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Say hello' }] }],
      generationConfig: { maxOutputTokens: 10 }
    }),
    testKey: envVars.GOOGLE_API_KEY
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

async function testAllProviders() {
  console.log('🤖 Testing Recoder.xyz Multi-AI Providers...\n');
  
  const results = [];
  for (const provider of AI_PROVIDERS) {
    process.stdout.write(`Testing ${provider.name}... `);
    const result = await testProvider(provider);
    console.log(`${result.status === 'OK' ? '✅ OK' : result.status === 'SKIP' ? '⚠️  SKIP' : '❌ ERROR'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    results.push(result);
  }

  console.log('\n📊 Test Results Summary:');
  const working = results.filter(r => r.status === 'OK').length;
  const total = results.filter(r => r.status !== 'SKIP').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  console.log(`✅ Working: ${working}/${total}`);
  console.log(`⚠️  Skipped: ${skipped} (no API key)`);
  console.log(`❌ Failed: ${total - working}`);
  
  if (working > 0) {
    console.log('\n🚀 Multi-AI system is functional!');
    return true;
  } else {
    console.log('\n⚠️  No AI providers are working. Check API keys.');
    return false;
  }
}

if (require.main === module) {
  testAllProviders().catch(console.error);
}

module.exports = { testAllProviders };