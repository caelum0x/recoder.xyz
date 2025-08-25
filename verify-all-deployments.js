#!/usr/bin/env node
const https = require('https');
const http = require('http');

// Deployment endpoints to verify
const deployments = [
  {
    name: 'Recoder Web Platform',
    url: 'https://recoder-web.netlify.app',
    type: 'website'
  },
  {
    name: 'Backend API',
    url: 'https://resplendent-marshmallow-7de2b1.netlify.app/.netlify/functions/server/health',
    type: 'api'
  },
  {
    name: 'Production Engine API',
    url: 'https://recoder-production-engine.netlify.app/.netlify/functions/server/health',
    type: 'api'
  }
];

async function checkEndpoint(deployment) {
  return new Promise((resolve) => {
    const url = new URL(deployment.url);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'Deployment-Verification-Script'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          ...deployment,
          status: res.statusCode,
          response: data.substring(0, 200) // First 200 chars
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        ...deployment,
        status: 'ERROR',
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ...deployment,
        status: 'TIMEOUT',
        error: 'Request timed out after 10 seconds'
      });
    });

    req.end();
  });
}

async function verifyAllDeployments() {
  console.log('🚀 Verifying All Recoder Deployments...\n');
  console.log('=' .repeat(60));
  
  const results = [];
  
  for (const deployment of deployments) {
    console.log(`\n📍 Checking ${deployment.name}...`);
    console.log(`   URL: ${deployment.url}`);
    
    const result = await checkEndpoint(deployment);
    results.push(result);
    
    if (result.status === 200 || result.status === 201) {
      console.log(`   ✅ Status: ${result.status} - HEALTHY`);
      if (result.response) {
        console.log(`   📄 Response: ${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}`);
      }
    } else if (result.status === 'ERROR' || result.status === 'TIMEOUT') {
      console.log(`   ❌ Status: ${result.status}`);
      console.log(`   💥 Error: ${result.error}`);
    } else {
      console.log(`   ⚠️  Status: ${result.status} - Unexpected response`);
      if (result.response) {
        console.log(`   📄 Response: ${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}`);
      }
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 DEPLOYMENT SUMMARY');
  console.log('=' .repeat(60));
  
  const healthy = results.filter(r => r.status === 200 || r.status === 201).length;
  const total = results.length;
  
  console.log(`\n🎯 Overall Health: ${healthy}/${total} deployments healthy`);
  
  results.forEach(result => {
    const icon = (result.status === 200 || result.status === 201) ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.status}`);
  });
  
  if (healthy === total) {
    console.log('\n🎉 ALL DEPLOYMENTS ARE LIVE AND HEALTHY! 🎉');
  } else {
    console.log('\n⚠️  Some deployments need attention.');
  }
  
  return results;
}

// Run verification
verifyAllDeployments().catch(console.error);
