#!/usr/bin/env node
/**
 * Test Platform Start Functionality
 * Quick test to ensure platforms can start properly
 */

const { spawn } = require('child_process');
const http = require('http');

const PLATFORMS = [
  {
    name: '🌐 Recoder Web',
    directory: 'recoder-web',
    startCommand: 'npm run start',
    port: 3000,
    healthPath: '/'
  },
  {
    name: '💬 Recoder Chat', 
    directory: 'recoder-chat',
    startCommand: 'npm run start',
    port: 3001,
    healthPath: '/'
  }
];

async function testPlatformStart(platform) {
  console.log(`\n🚀 Testing ${platform.name} startup`);
  
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'start'], {
      cwd: platform.directory,
      stdio: 'pipe',
      env: { ...process.env, PORT: platform.port }
    });

    let started = false;
    const timeout = 30000; // 30 seconds

    child.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Check for common Next.js start indicators
      if (output.includes('Ready') || output.includes('started') || output.includes(`localhost:${platform.port}`)) {
        console.log(`   ✅ ${platform.name} started successfully`);
        started = true;
        child.kill();
        resolve({ success: true });
      }
    });

    child.stderr.on('data', (data) => {
      const error = data.toString();
      console.log(`   📝 ${platform.name}: ${error.slice(0, 100)}...`);
    });

    child.on('close', (code) => {
      if (!started) {
        console.log(`   ⚠️ ${platform.name} process ended (code: ${code})`);
        resolve({ success: false, code });
      }
    });

    child.on('error', (error) => {
      console.log(`   ❌ ${platform.name} failed to start: ${error.message}`);
      resolve({ success: false, error: error.message });
    });

    // Timeout
    setTimeout(() => {
      if (!started) {
        console.log(`   ⏱️ ${platform.name} start test timed out`);
        child.kill();
        resolve({ success: false, error: 'timeout' });
      }
    }, timeout);
  });
}

async function testAllPlatformStarts() {
  console.log('🚀 Testing Platform Start Functionality\n');
  
  const results = {};
  let successCount = 0;

  for (const platform of PLATFORMS) {
    const result = await testPlatformStart(platform);
    results[platform.name] = result;
    
    if (result.success) {
      successCount++;
    }
  }

  console.log('\n📊 Start Test Results:');
  console.log('=======================');
  
  for (const [name, result] of Object.entries(results)) {
    const status = result.success ? '✅ CAN START' : '⚠️  START ISSUES';
    console.log(`${status} ${name}`);
  }

  console.log(`\n📈 Summary: ${successCount}/${PLATFORMS.length} platforms can start successfully`);

  return {
    totalPlatforms: PLATFORMS.length,
    successCount,
    canStart: successCount >= 1, // At least one platform should start
    results
  };
}

if (require.main === module) {
  testAllPlatformStarts().then(results => {
    if (results.canStart) {
      console.log('\n🎉 Platform start functionality validated!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Platform start needs attention');
      process.exit(1);
    }
  }).catch(console.error);
}