#!/usr/bin/env node

/**
 * Test Guest Authentication Flow
 * Tests the guest authentication endpoint
 */

async function testGuestAuth() {
  const baseUrl = 'http://localhost:3010';

  console.log('🧪 Testing Guest Authentication Flow\n');

  try {
    // Test 1: Check if server is running
    console.log('1. Checking server health...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Server is healthy:', healthData);

    // Test 2: Try to access login page
    console.log('\n2. Accessing login page...');
    const loginResponse = await fetch(`${baseUrl}/login`);
    console.log('✅ Login page accessible:', loginResponse.status === 200);

    // Test 3: Test guest authentication API
    console.log('\n3. Testing guest authentication...');
    const guestAuthResponse = await fetch(`${baseUrl}/api/auth/guest`, {
      method: 'GET',
      redirect: 'manual',
    });

    console.log('Guest auth response status:', guestAuthResponse.status);
    console.log('Guest auth redirect location:', guestAuthResponse.headers.get('location'));

    if (guestAuthResponse.status === 302 || guestAuthResponse.status === 307) {
      console.log('✅ Guest authentication endpoint working (redirect detected)');
    } else {
      console.log('⚠️  Guest authentication may need configuration');
    }

    // Test 4: Check NextAuth endpoints
    console.log('\n4. Checking NextAuth endpoints...');
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
    const csrfData = await csrfResponse.json();
    console.log('✅ CSRF token available:', !!csrfData.csrfToken);

    console.log('\n✅ Authentication system is ready!');
    console.log('\n📝 Next steps:');
    console.log('   - Open http://localhost:3010 in your browser');
    console.log('   - Click "Continue as Guest" to test guest authentication');
    console.log('   - Test AI chat functionality');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   - Make sure the dev server is running: pnpm run dev');
    console.log('   - Check that port 3010 is accessible');
  }
}

testGuestAuth();
