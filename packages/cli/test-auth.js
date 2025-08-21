#!/usr/bin/env node

/**
 * Test script for CLI authentication integration
 * Tests direct connection to the web backend authentication API
 */

const axios = require('axios');

async function testCLIAuthentication() {
  console.log('🧪 Testing CLI Authentication Integration');
  console.log('======================================\n');

  const backendUrl = 'http://localhost:3000';

  try {
    // Test 1: Basic API endpoint
    console.log('1. Testing CLI auth endpoint availability...');
    const healthResponse = await axios.get(`${backendUrl}/api/auth/cli`);
    console.log('✅ CLI auth endpoint is available');
    console.log('   Response:', healthResponse.data);
    console.log('');

    // Test 2: API Key validation
    console.log('2. Testing API key validation...');
    const apiKeyResponse = await axios.post(`${backendUrl}/api/auth/cli`, {
      action: 'validate_token',
      token: 'rck_demo_key_12345678'
    });
    console.log('✅ API key validation successful');
    console.log('   User:', apiKeyResponse.data.user);
    console.log('');

    // Test 3: Device flow initiation
    console.log('3. Testing device flow initiation...');
    const deviceFlowResponse = await axios.post(`${backendUrl}/api/auth/cli`, {
      action: 'device_flow',
      client_id: 'recoder-cli-test'
    });
    console.log('✅ Device flow initiated successfully');
    console.log('   User code:', deviceFlowResponse.data.user_code);
    console.log('   Verification URL:', deviceFlowResponse.data.verification_uri);
    console.log('');

    // Test 4: Email/password authentication
    console.log('4. Testing email/password authentication...');
    const emailAuthResponse = await axios.post(`${backendUrl}/api/auth/cli`, {
      action: 'authenticate',
      email: 'test@recoder.xyz',
      password: 'test123'
    });
    console.log('✅ Email authentication successful');
    console.log('   Access token:', emailAuthResponse.data.session.access_token.substring(0, 20) + '...');
    console.log('   User:', emailAuthResponse.data.user);
    console.log('');

    console.log('🎉 All CLI authentication tests passed!');
    console.log('');
    console.log('📋 Integration Summary:');
    console.log('   ✓ Web backend is running and accessible');
    console.log('   ✓ CLI authentication endpoints are working');
    console.log('   ✓ API key validation is functional');
    console.log('   ✓ Device flow is ready for CLI users');
    console.log('   ✓ Email/password authentication works');
    console.log('');
    console.log('🚀 Ready for production deployment!');

  } catch (error) {
    console.error('❌ Authentication test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testCLIAuthentication().catch(console.error);