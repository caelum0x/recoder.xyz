/**
 * Test updated AI generation with OpenRouter
 */
const https = require('https');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from production-engine
dotenv.config({ path: path.resolve(__dirname, 'production-engine/.env') });

async function testOpenRouterGeneration() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.log('❌ OPENROUTER_API_KEY not found');
    return;
  }
  
  console.log('✅ OPENROUTER_API_KEY found:', apiKey.substring(0, 15) + '...');
  
  // Test with the exact model ID from OpenRouter API
  const models = [
    'anthropic/claude-sonnet-4',
    'google/gemini-2.5-flash',
    'google/gemini-2.0-flash-001',
    'deepseek/deepseek-chat-v3-0324',
    'qwen/qwen3-coder'
  ];
  
  for (const model of models) {
    console.log(`\n🧪 Testing ${model}...`);
    
    const data = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert software developer. Generate production-ready code.'
        },
        {
          role: 'user',
          content: 'Create a simple React component that displays "Hello World" with a button to increment a counter.'
        }
      ],
      max_tokens: 500,
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

    try {
      const response = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let responseBody = '';
          
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          
          res.on('end', () => {
            try {
              const response = JSON.parse(responseBody);
              if (res.statusCode === 200) {
                console.log(`✅ ${model} working!`);
                console.log('  Response length:', response.choices?.[0]?.message?.content?.length || 0, 'chars');
                console.log('  Usage:', response.usage?.total_tokens || 0, 'tokens');
                resolve(response);
              } else {
                console.log(`❌ ${model} error:`, res.statusCode, responseBody.substring(0, 200));
                reject(new Error(responseBody));
              }
            } catch (error) {
              console.log(`❌ ${model} parse error:`, error.message);
              reject(error);
            }
          });
        });

        req.on('error', (error) => {
          console.log(`❌ ${model} request error:`, error.message);
          reject(error);
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      console.log(`❌ ${model} failed:`, error.message);
    }
  }
}

console.log('🤖 Testing updated AI models from OpenRouter...\n');
testOpenRouterGeneration();