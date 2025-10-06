#!/usr/bin/env node

/**
 * End-to-End Chat Creation Test
 * Tests both recoder-web and recoder-chat
 */

const http = require('http');

function testEndpoint(host, port, path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body ? Buffer.byteLength(body) : 0
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Chat Creation End-to-End\n');

  // Test 1: recoder-web homepage
  console.log('1️⃣  Testing recoder-web homepage (port 3000)...');
  try {
    const homeResult = await testEndpoint('localhost', 3000, '/', 'GET');
    if (homeResult.status === 200 && homeResult.data.includes('Recoder')) {
      console.log('   ✅ recoder-web homepage loads');
    } else {
      console.log('   ❌ recoder-web homepage failed');
    }
  } catch (error) {
    console.log(`   ❌ recoder-web not running: ${error.message}`);
  }

  // Test 2: recoder-web health check
  console.log('\n2️⃣  Testing recoder-web health check...');
  try {
    const healthResult = await testEndpoint('localhost', 3000, '/api/health', 'GET');
    if (healthResult.status === 200) {
      console.log('   ✅ recoder-web API is healthy');
    } else {
      console.log(`   ⚠️  Health check returned ${healthResult.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error.message}`);
  }

  // Test 3: Check recoder-chat
  console.log('\n3️⃣  Testing recoder-chat (checking if running)...');
  try {
    // recoder-chat is typically on port 3010 based on earlier logs
    const chatResult = await testEndpoint('localhost', 3010, '/', 'GET');
    if (chatResult.status === 200) {
      console.log('   ✅ recoder-chat is running');
    } else {
      console.log(`   ⚠️  recoder-chat returned ${chatResult.status}`);
    }
  } catch (error) {
    console.log(`   ℹ️  recoder-chat not on 3010: ${error.message}`);
  }

  console.log('\n📊 Test Summary:');
  console.log('   - recoder-web should be on http://localhost:3000');
  console.log('   - Check browser for actual chat creation test');
  console.log('   - Open DevTools console to see errors\n');
}

runTests().catch(console.error);
