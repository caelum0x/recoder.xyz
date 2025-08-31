/**
 * Test AI generation with OpenRouter
 */
const https = require('https');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from production-engine
dotenv.config({ path: path.resolve(__dirname, 'production-engine/.env') });

async function testOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.log('❌ OPENROUTER_API_KEY not found');
    return;
  }
  
  console.log('✅ OPENROUTER_API_KEY found:', apiKey.substring(0, 10) + '...');
  
  const data = JSON.stringify({
    model: 'google/gemini-2.0-flash',
    messages: [
      {
        role: 'system',
        content: 'You are an expert software developer.'
      },
      {
        role: 'user',
        content: 'Generate a simple hello world function in JavaScript'
      }
    ],
    max_tokens: 100,
    temperature: 0.3
  });

  const options = {
    hostname: 'openrouter.ai',
    port: 443,
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder Production Engine'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseBody);
          if (res.statusCode === 200) {
            console.log('✅ OpenRouter API working!');
            console.log('Model:', response.model);
            console.log('Content:', response.choices?.[0]?.message?.content?.substring(0, 100) + '...');
            console.log('Usage:', response.usage);
            resolve(response);
          } else {
            console.log('❌ OpenRouter API error:', res.statusCode, responseBody);
            reject(new Error(responseBody));
          }
        } catch (error) {
          console.log('❌ JSON parse error:', error.message);
          console.log('Response:', responseBody);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ Request error:', error.message);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Also test other providers
async function testProviders() {
  console.log('🤖 Testing AI providers...\n');
  
  const providers = [
    { name: 'Anthropic', key: 'ANTHROPIC_API_KEY' },
    { name: 'Groq', key: 'GROQ_API_KEY' },
    { name: 'Google', key: 'GOOGLE_API_KEY' },
    { name: 'OpenAI', key: 'OPENAI_API_KEY' },
    { name: 'OpenRouter', key: 'OPENROUTER_API_KEY' }
  ];
  
  providers.forEach(provider => {
    const key = process.env[provider.key];
    if (key) {
      console.log(`✅ ${provider.name}: ${key.substring(0, 10)}...`);
    } else {
      console.log(`❌ ${provider.name}: Not configured`);
    }
  });
  
  console.log('\n🧪 Testing OpenRouter generation...');
  try {
    await testOpenRouter();
  } catch (error) {
    console.log('❌ OpenRouter test failed:', error.message);
  }
}

testProviders();