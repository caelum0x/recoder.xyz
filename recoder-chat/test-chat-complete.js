#!/usr/bin/env node

/**
 * Complete Chat Functionality Test
 * Tests the entire flow: guest auth -> chat creation -> message sending
 */

const BASE_URL = 'http://localhost:3010';

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Chat Flow\n');
  console.log('=' .repeat(50));

  // Test 1: Health Check
  console.log('\n1️⃣  Testing Homepage...');
  try {
    const homeResponse = await fetch(BASE_URL);
    console.log(`   Status: ${homeResponse.status}`);
    console.log(`   Redirected to: ${homeResponse.url}`);

    if (homeResponse.url.includes('/login')) {
      console.log('   ✅ Correctly redirects to login (auth required)');
    }
  } catch (error) {
    console.error('   ❌ Homepage test failed:', error.message);
    return;
  }

  // Test 2: Guest Auth
  console.log('\n2️⃣  Testing Guest Authentication...');
  let sessionCookie = null;
  try {
    const guestResponse = await fetch(`${BASE_URL}/api/auth/guest`, {
      redirect: 'manual'
    });

    console.log(`   Status: ${guestResponse.status}`);

    // Extract session cookie
    const setCookie = guestResponse.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/next-auth\.session-token=([^;]+)/);
      if (match) {
        sessionCookie = `next-auth.session-token=${match[1]}`;
        console.log('   ✅ Session cookie obtained');
      }
    }

    if (!sessionCookie) {
      console.log('   ⚠️  No session cookie - checking callback URL');
      const location = guestResponse.headers.get('location');
      console.log(`   Redirect location: ${location}`);
    }
  } catch (error) {
    console.error('   ❌ Guest auth failed:', error.message);
  }

  // Test 3: Session Verification
  console.log('\n3️⃣  Testing Session...');
  try {
    const headers = sessionCookie ? { 'Cookie': sessionCookie } : {};
    const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, { headers });
    const sessionData = await sessionResponse.json();

    console.log(`   Status: ${sessionResponse.status}`);
    console.log('   Session data:', JSON.stringify(sessionData, null, 2));

    if (sessionData.user) {
      console.log('   ✅ Valid session');
    } else {
      console.log('   ❌ No user in session');
    }
  } catch (error) {
    console.error('   ❌ Session check failed:', error.message);
  }

  // Test 4: Database Connection
  console.log('\n4️⃣  Testing Database...');
  try {
    const dbTest = await fetch(`${BASE_URL}/api/health`);
    const healthData = await dbTest.json();
    console.log('   Health check:', healthData);
  } catch (error) {
    console.error('   ❌ Database test failed:', error.message);
  }

  // Test 5: Chat API (with proper authentication)
  console.log('\n5️⃣  Testing Chat API...');
  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const chatPayload = {
      id: `chat-${Date.now()}`,
      message: {
        role: 'user',
        content: 'Hello, test message',
        id: `msg-${Date.now()}`
      },
      selectedChatModel: 'deepseek/deepseek-r1:free',
      selectedVisibilityType: 'private'
    };

    console.log('   Sending chat request...');
    const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatPayload)
    });

    console.log(`   Status: ${chatResponse.status} ${chatResponse.statusText}`);

    if (chatResponse.ok) {
      console.log('   ✅ Chat API responding');
      const contentType = chatResponse.headers.get('content-type');
      console.log(`   Content-Type: ${contentType}`);

      if (contentType?.includes('text/event-stream')) {
        console.log('   ✅ Streaming response detected');
      }
    } else {
      const errorText = await chatResponse.text();
      console.log('   ❌ Chat failed:', errorText);

      try {
        const errorJson = JSON.parse(errorText);
        console.log('   Error details:', JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON
      }
    }
  } catch (error) {
    console.error('   ❌ Chat test failed:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`
Next Steps:
1. Check server logs for detailed errors
2. Verify database tables exist (especially 'stream')
3. Check AUTH_SECRET is set in .env.local
4. Verify AI provider API keys are configured

Current Issues to Check:
- If guest auth failed: Check auth.ts guest provider
- If chat returns 400: Check unified-providers.ts
- If database errors: Run SQL to create missing tables
  `);
}

// Run the test
testCompleteFlow().catch(console.error);
