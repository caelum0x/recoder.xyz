#!/usr/bin/env node

/**
 * Simple Ollama connectivity test
 * Tests if Ollama is working with the recoder.xyz project
 */

const { spawn } = require('child_process');

console.log('🧪 Testing Ollama Integration\n');

// Test 1: Check if Ollama is installed
console.log('1. Checking Ollama installation...');
const ollamaVersion = spawn('ollama', ['--version']);

ollamaVersion.stdout.on('data', (data) => {
  console.log(`✅ Ollama found: ${data.toString().trim()}`);
});

ollamaVersion.stderr.on('data', (data) => {
  console.log(`❌ Ollama error: ${data}`);
});

ollamaVersion.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Ollama is installed\n');
    
    // Test 2: List available models
    console.log('2. Checking available models...');
    const ollamaList = spawn('ollama', ['list']);
    
    ollamaList.stdout.on('data', (data) => {
      console.log(`📋 Available models:\n${data.toString()}`);
    });
    
    ollamaList.on('close', (listCode) => {
      if (listCode === 0) {
        console.log('✅ Models listed successfully\n');
        
        // Test 3: Simple API test
        console.log('3. Testing simple Ollama API call...');
        testOllamaAPI();
      } else {
        console.log('❌ Failed to list models');
      }
    });
  } else {
    console.log('❌ Ollama is not installed or not accessible');
  }
});

async function testOllamaAPI() {
  try {
    // Try to make a simple HTTP request to Ollama
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama API is accessible');
      console.log(`📊 Found ${data.models?.length || 0} models via API`);
      
      if (data.models && data.models.length > 0) {
        console.log('\n4. Testing simple completion...');
        await testCompletion(data.models[0].name);
      }
    } else {
      console.log('❌ Ollama API not accessible');
    }
  } catch (error) {
    console.log(`❌ Ollama API test failed: ${error.message}`);
  }
}

async function testCompletion(modelName) {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt: 'Hello! Can you say hi back?',
        stream: false
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Test completion successful with ${modelName}`);
      console.log(`🤖 Response: ${data.response?.substring(0, 100) || 'No response'}...`);
    } else {
      console.log(`❌ Test completion failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Test completion error: ${error.message}`);
  }
}

// Make sure we have fetch available (Node 18+)
if (typeof fetch === 'undefined') {
  console.log('⚠️  Node.js version might be too old. Using fallback...');
  global.fetch = require('node-fetch');
}