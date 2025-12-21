/**
 * TEST 5: DATA INTEGRITY & CONSTRAINTS
 *
 * Tests:
 * - URL ID uniqueness constraint
 * - Cascading deletes (session → messages)
 * - Foreign key constraints
 * - Transaction handling
 * - Data validation
 * - Timestamp tracking
 */

import { ChatHistoryDB } from '../../app/lib/.server/db/chat-history-db';
import { readFileSync } from 'fs';
import { join } from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function success(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function error(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function info(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function section(title: string) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

function loadEnv(): string {
  const envPath = join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const databaseUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];
  if (!databaseUrl) throw new Error('DATABASE_URL not found');
  return databaseUrl;
}

async function testDataIntegrity() {
  section('TEST 5: DATA INTEGRITY & CONSTRAINTS');

  let testsPassed = 0;
  let testsFailed = 0;
  const sessionIds: string[] = [];
  const anonymousId = `test-anon-${Date.now()}`;

  const db = new ChatHistoryDB(loadEnv());

  try {
    // Test 5.1: URL ID uniqueness constraint
    console.log('\n📋 Test 5.1: Testing URL ID uniqueness constraint...');
    const urlId = `test-unique-${Date.now()}`;

    const session1 = await db.createSession({
      anonymousId,
      urlId,
      title: 'First Session',
    });
    sessionIds.push(session1.id);

    try {
      await db.createSession({
        anonymousId: 'another-user',
        urlId, // Duplicate URL ID
        title: 'Second Session',
      });
      throw new Error('Should have failed due to duplicate URL ID');
    } catch (err: any) {
      if (err.message.includes('Should have failed')) {
        throw err;
      }
      // Expected error
      info('Duplicate URL ID correctly rejected');
    }

    success('URL ID uniqueness enforced');
    testsPassed++;

    // Test 5.2: Cascading delete (session → messages)
    console.log('\n📋 Test 5.2: Testing cascading delete...');
    const tempSession = await db.createSession({
      anonymousId,
      urlId: `temp-${Date.now()}`,
      title: 'Temporary Session',
    });

    // Add messages
    await db.addMessage({
      sessionId: tempSession.id,
      role: 'user',
      content: 'Test message 1',
    });
    await db.addMessage({
      sessionId: tempSession.id,
      role: 'assistant',
      content: 'Test response 1',
    });
    await db.addMessage({
      sessionId: tempSession.id,
      role: 'user',
      content: 'Test message 2',
    });

    // Verify messages exist
    const messagesBefore = await db.getMessages(tempSession.id);
    if (messagesBefore.length !== 3) throw new Error('Messages not created');

    info(`Created ${messagesBefore.length} messages`);

    // Delete session
    await db.deleteSession(tempSession.id);

    // Verify messages are also deleted
    const messagesAfter = await db.getMessages(tempSession.id);
    if (messagesAfter.length !== 0) throw new Error('Messages not cascading deleted');

    info('Session deleted');
    info('All messages automatically deleted (cascading)');
    success('Cascading delete working');
    testsPassed++;

    // Test 5.3: Timestamp tracking
    console.log('\n📋 Test 5.3: Testing timestamp tracking...');
    const tsSession = await db.createSession({
      anonymousId,
      urlId: `timestamp-${Date.now()}`,
      title: 'Timestamp Test',
    });
    sessionIds.push(tsSession.id);

    const createdAt = new Date(tsSession.created_at);
    const updatedAt = new Date(tsSession.updated_at);

    if (createdAt > new Date()) throw new Error('created_at in future');
    if (updatedAt > new Date()) throw new Error('updated_at in future');
    if (updatedAt < createdAt) throw new Error('updated_at before created_at');

    info(`Created at: ${createdAt.toISOString()}`);
    info(`Updated at: ${updatedAt.toISOString()}`);

    // Wait and update
    await new Promise(resolve => setTimeout(resolve, 1000));
    await db.updateSession(tsSession.id, { title: 'Updated Title' });

    const updated = await db.getSession(tsSession.id);
    if (!updated) throw new Error('Session not found');

    const newUpdatedAt = new Date(updated.updated_at);
    if (newUpdatedAt <= updatedAt) {
      throw new Error('updated_at not refreshed');
    }

    info(`New updated_at: ${newUpdatedAt.toISOString()}`);
    info(`Time difference: ${newUpdatedAt.getTime() - updatedAt.getTime()}ms`);
    success('Timestamps tracked correctly');
    testsPassed++;

    // Test 5.4: Data validation (role check)
    console.log('\n📋 Test 5.4: Testing data validation...');
    const validSession = await db.createSession({
      anonymousId,
      urlId: `valid-${Date.now()}`,
      title: 'Validation Test',
    });
    sessionIds.push(validSession.id);

    // Test valid roles
    const validRoles = ['user', 'assistant', 'system'] as const;
    for (const role of validRoles) {
      await db.addMessage({
        sessionId: validSession.id,
        role,
        content: `Test ${role} message`,
      });
    }
    info('Valid roles accepted: user, assistant, system');

    // Test invalid role
    try {
      await db.sql`
        INSERT INTO chat_messages (session_id, role, content)
        VALUES (${validSession.id}, 'invalid_role', 'Test')
      `;
      throw new Error('Should have failed with invalid role');
    } catch (err: any) {
      if (err.message.includes('Should have failed')) {
        throw err;
      }
      info('Invalid role correctly rejected');
    }

    success('Data validation working');
    testsPassed++;

    // Test 5.5: Session without messages
    console.log('\n📋 Test 5.5: Testing session without messages...');
    const emptySession = await db.createSession({
      anonymousId,
      urlId: `empty-${Date.now()}`,
      title: 'Empty Session',
    });
    sessionIds.push(emptySession.id);

    const emptyMessages = await db.getMessages(emptySession.id);
    if (emptyMessages.length !== 0) throw new Error('Found messages in empty session');

    info('Empty session created successfully');
    success('Sessions without messages allowed');
    testsPassed++;

    // Test 5.6: Message without model metadata
    console.log('\n📋 Test 5.6: Testing message without metadata...');
    const metaSession = await db.createSession({
      anonymousId,
      urlId: `meta-${Date.now()}`,
      title: 'Metadata Test',
    });
    sessionIds.push(metaSession.id);

    const minimalMessage = await db.addMessage({
      sessionId: metaSession.id,
      role: 'user',
      content: 'User message without metadata',
    });

    if (minimalMessage.model_used !== null && minimalMessage.model_used !== undefined) {
      throw new Error('model_used should be null');
    }
    if (minimalMessage.tokens_used !== 0 && minimalMessage.tokens_used !== null) {
      throw new Error('tokens_used should be 0 or null');
    }

    info('Message without metadata created');
    info(`Model: ${minimalMessage.model_used ?? 'null'}`);
    info(`Tokens: ${minimalMessage.tokens_used ?? 0}`);
    success('Optional metadata handled');
    testsPassed++;

    // Test 5.7: Session metadata (JSONB)
    console.log('\n📋 Test 5.7: Testing JSONB metadata storage...');
    const jsonbSession = await db.createSession({
      anonymousId,
      urlId: `jsonb-${Date.now()}`,
      title: 'JSONB Test',
    });
    sessionIds.push(jsonbSession.id);

    const complexMetadata = {
      userSettings: {
        theme: 'dark',
        fontSize: 14,
        features: ['autocomplete', 'linting', 'formatting'],
      },
      projectInfo: {
        framework: 'React',
        version: '18.0.0',
        buildTool: 'Vite',
      },
      timestamps: {
        lastSaved: new Date().toISOString(),
        lastDeployed: null,
      },
    };

    await db.updateSession(jsonbSession.id, {
      metadata: complexMetadata,
    });

    const retrieved = await db.getSession(jsonbSession.id);
    if (!retrieved) throw new Error('Session not found');

    // Verify nested metadata
    if (retrieved.metadata?.userSettings?.theme !== 'dark') {
      throw new Error('Nested metadata not preserved');
    }
    if (!Array.isArray(retrieved.metadata?.userSettings?.features)) {
      throw new Error('Array in metadata not preserved');
    }

    info('Complex JSONB metadata stored');
    info(`Metadata keys: ${Object.keys(retrieved.metadata).join(', ')}`);
    info(`Nested theme: ${retrieved.metadata.userSettings.theme}`);
    info(`Array length: ${retrieved.metadata.userSettings.features.length}`);
    success('JSONB metadata working');
    testsPassed++;

    // Test 5.8: Concurrent updates
    console.log('\n📋 Test 5.8: Testing concurrent updates...');
    const concurrentSession = await db.createSession({
      anonymousId,
      urlId: `concurrent-${Date.now()}`,
      title: 'Concurrent Test',
    });
    sessionIds.push(concurrentSession.id);

    // Add multiple messages concurrently
    const concurrentMessages = await Promise.all([
      db.addMessage({ sessionId: concurrentSession.id, role: 'user', content: 'Message 1' }),
      db.addMessage({ sessionId: concurrentSession.id, role: 'assistant', content: 'Response 1' }),
      db.addMessage({ sessionId: concurrentSession.id, role: 'user', content: 'Message 2' }),
      db.addMessage({ sessionId: concurrentSession.id, role: 'assistant', content: 'Response 2' }),
      db.addMessage({ sessionId: concurrentSession.id, role: 'user', content: 'Message 3' }),
    ]);

    if (concurrentMessages.length !== 5) throw new Error('Not all messages saved');

    // Verify all messages saved
    const allConcurrent = await db.getMessages(concurrentSession.id);
    if (allConcurrent.length !== 5) throw new Error('Message count mismatch');

    info('5 messages added concurrently');
    info('All messages saved successfully');
    success('Concurrent updates handled');
    testsPassed++;

    // Cleanup
    console.log('\n📋 Cleanup: Deleting test sessions...');
    for (const sid of sessionIds) {
      await db.deleteSession(sid);
    }
    info(`Deleted ${sessionIds.length} test sessions`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}TEST SUMMARY${colors.reset}`);
    console.log('='.repeat(80));
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);

    if (testsFailed === 0) {
      console.log(`${colors.bright}${colors.green}🎉 All data integrity tests passed!${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.bright}${colors.red}❌ Some tests failed${colors.reset}\n`);
      process.exit(1);
    }

  } catch (err) {
    error(`Test failed: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
    console.log(`\n${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}\n`);

    // Cleanup on failure
    for (const sid of sessionIds) {
      try {
        await db.deleteSession(sid);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Run tests
testDataIntegrity();
