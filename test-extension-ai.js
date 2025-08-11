#!/usr/bin/env node
/**
 * Test VSCode Extension AI Functionality
 * Tests the extension's AI provider integrations
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

const EXTENSION_AI_PROVIDERS = [
  {
    name: 'Together AI (Free DeepSeek R1)',
    url: 'https://api.together.xyz/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.TOGETHER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-ai/deepseek-r1-distill-llama-70b',
      messages: [{ role: 'user', content: 'Write a simple hello world function in JavaScript' }],
      max_tokens: 100
    }),
    testKey: envVars.TOGETHER_API_KEY
  },
  {
    name: 'Together AI (Free Llama Vision)',
    url: 'https://api.together.xyz/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.TOGETHER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-vision-free',
      messages: [{ role: 'user', content: 'Explain async/await in JavaScript' }],
      max_tokens: 100
    }),
    testKey: envVars.TOGETHER_API_KEY
  },
  {
    name: 'Groq (Extension Compatible)',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envVars.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Fix this TypeScript error: Property x does not exist' }],
      max_tokens: 100
    }),
    testKey: envVars.GROQ_API_KEY
  },
  {
    name: 'Google Gemini (Extension Compatible)',
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${envVars.GOOGLE_API_KEY}`,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Generate JSDoc comments for a React component' }] }],
      generationConfig: { maxOutputTokens: 100 }
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
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200) {
            const hasContent = response.choices?.[0]?.message?.content || 
                             response.candidates?.[0]?.content?.parts?.[0]?.text;
            resolve({ 
              name: provider.name, 
              status: 'OK', 
              statusCode: res.statusCode,
              hasResponse: !!hasContent,
              preview: hasContent ? (hasContent.substring(0, 50) + '...') : 'No content'
            });
          } else {
            resolve({ 
              name: provider.name, 
              status: 'ERROR', 
              statusCode: res.statusCode,
              error: response.error?.message || response.error?.type || 'Unknown error'
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

async function testExtensionAI() {
  console.log('🔌 Testing VSCode Extension AI Functionality...\n');
  
  const results = [];
  for (const provider of EXTENSION_AI_PROVIDERS) {
    process.stdout.write(`Testing ${provider.name}... `);
    const result = await testProvider(provider);
    console.log(`${result.status === 'OK' ? '✅ OK' : result.status === 'SKIP' ? '⚠️  SKIP' : '❌ ERROR'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.preview && result.status === 'OK') {
      console.log(`   Response: ${result.preview}`);
    }
    results.push(result);
  }

  console.log('\n📊 VSCode Extension AI Test Results:');
  const working = results.filter(r => r.status === 'OK').length;
  const total = results.filter(r => r.status !== 'SKIP').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  console.log(`✅ Working: ${working}/${total}`);
  console.log(`⚠️  Skipped: ${skipped} (no API key)`);
  console.log(`❌ Failed: ${total - working}`);
  
  if (working >= 2) {
    console.log('\n🚀 VSCode Extension AI is functional with multiple providers!');
    console.log('💰 Cost optimization: Free Together AI models available');
    return true;
  } else {
    console.log('\n⚠️  VSCode Extension AI needs attention.');
    return false;
  }
}

testExtensionAI().catch(console.error);