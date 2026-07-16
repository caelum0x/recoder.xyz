#!/usr/bin/env node

/**
 * Test script for CLI authentication flow
 * This demonstrates how the CLI would authenticate with recoder.xyz
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startAuthFlow() {
  log('\n🚀 Starting Recoder CLI Authentication Flow\n', 'bright');
  log('═'.repeat(60), 'cyan');

  // Step 1: Generate device code
  log('\n📝 Step 1: Generating device code...', 'yellow');

  const deviceResponse = await fetch(`${BASE_URL}/api/auth/cli/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'recoder-cli' }),
  });

  if (!deviceResponse.ok) {
    log('❌ Failed to generate device code', 'red');
    process.exit(1);
  }

  const deviceData = await deviceResponse.json();

  log('\n✅ Device code generated!', 'green');
  log(`\n${'═'.repeat(60)}`, 'cyan');
  log(`\n  Please visit: ${deviceData.verification_uri}`, 'bright');
  log(`\n  Enter this code: ${colors.bright}${colors.magenta}${deviceData.user_code}${colors.reset}`, 'cyan');
  log(`\n  Or scan QR code at: ${deviceData.verification_uri_complete}`, 'cyan');
  log(`\n  Expires in: ${deviceData.expires_in} seconds`, 'yellow');
  log(`\n${'═'.repeat(60)}\n`, 'cyan');

  // Step 2: Poll for authorization
  log('⏳ Waiting for authorization...', 'yellow');
  log('   (Open the URL above in your browser and enter the code)\n', 'cyan');

  const pollInterval = deviceData.interval * 1000; // Convert to milliseconds
  const maxAttempts = Math.floor(deviceData.expires_in / deviceData.interval);
  let attempts = 0;
  let authorized = false;
  let tokenData = null;

  while (attempts < maxAttempts && !authorized) {
    attempts++;
    process.stdout.write(`\r   Polling... (attempt ${attempts}/${maxAttempts})`);

    const tokenResponse = await fetch(`${BASE_URL}/api/auth/cli/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceData.device_code,
      }),
    });

    const data = await tokenResponse.json();

    if (tokenResponse.status === 200 && data.status === 'authorized') {
      authorized = true;
      tokenData = data;
      console.log(''); // New line
      break;
    } else if (tokenResponse.status === 428) {
      // Still pending
      await sleep(pollInterval);
      continue;
    } else if (tokenResponse.status === 403) {
      console.log(''); // New line
      log('\n❌ Authorization denied by user', 'red');
      process.exit(1);
    } else if (tokenResponse.status === 410) {
      console.log(''); // New line
      log('\n❌ Device code expired', 'red');
      process.exit(1);
    } else {
      console.log(''); // New line
      log(`\n❌ Error: ${data.error || 'Unknown error'}`, 'red');
      process.exit(1);
    }
  }

  if (!authorized) {
    log('\n❌ Authorization timed out', 'red');
    process.exit(1);
  }

  // Step 3: Success!
  log('\n✅ Successfully authenticated!', 'green');
  log(`\n${'═'.repeat(60)}`, 'cyan');
  log(`\n  User: ${tokenData.user.name} (${tokenData.user.email})`, 'bright');
  log(`  Plan: ${tokenData.user.plan}`, 'cyan');
  log(`\n  Access Token: ${tokenData.access_token.substring(0, 20)}...`, 'green');
  log(`  Refresh Token: ${tokenData.refresh_token.substring(0, 20)}...`, 'green');
  log(`  Expires in: ${tokenData.expires_in} seconds`, 'yellow');
  log(`\n${'═'.repeat(60)}\n`, 'cyan');

  // Step 4: Verify token
  log('🔍 Verifying access token...', 'yellow');

  const verifyResponse = await fetch(`${BASE_URL}/api/auth/cli/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
  });

  if (!verifyResponse.ok) {
    log('❌ Token verification failed', 'red');
    process.exit(1);
  }

  const verifyData = await verifyResponse.json();

  log('✅ Token verified!', 'green');
  log(`\n  Valid: ${verifyData.valid}`, 'cyan');
  log(`  User ID: ${verifyData.user.userId}`, 'cyan');
  log(`  Plan: ${verifyData.user.plan}`, 'cyan');
  log(`  Status: ${verifyData.user.status}`, 'cyan');

  log(`\n${'═'.repeat(60)}`, 'cyan');
  log('\n🎉 CLI authentication flow completed successfully!\n', 'bright');

  // Save tokens to file (in real CLI, this would be in ~/.recoder/config)
  log('💾 In a real CLI, tokens would be saved to:', 'cyan');
  log('   ~/.recoder/config.json', 'yellow');
  log('\n   Example usage:', 'cyan');
  log('   $ recoder "create a React component"', 'yellow');
  log('   $ recoder chat', 'yellow');
  log('   $ recoder status\n', 'yellow');
}

// Run the authentication flow
startAuthFlow().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
