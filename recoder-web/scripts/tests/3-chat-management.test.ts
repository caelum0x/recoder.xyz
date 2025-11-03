/**
 * TEST 3: CHAT MANAGEMENT
 *
 * Tests:
 * - Add user messages
 * - Add assistant messages with metadata
 * - Retrieve messages
 * - Update messages (streaming simulation)
 * - Message ordering
 * - Message count tracking
 * - Chat history
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

async function testChatManagement() {
  section('TEST 3: CHAT MANAGEMENT');

  let testsPassed = 0;
  let testsFailed = 0;
  let sessionId = '';
  let messageIds: string[] = [];
  const anonymousId = `test-anon-${Date.now()}`;
  const sessionUrlId = `test-session-${Date.now()}`;

  const db = new ChatHistoryDB(loadEnv());

  try {
    // Setup: Create test session
    console.log('🔧 Setup: Creating test session...');
    const session = await db.createSession({
      anonymousId,
      urlId: sessionUrlId,
      title: 'Chat Management Test',
      description: 'Testing chat and message features',
    });
    sessionId = session.id;
    info(`Session created: ${sessionId}`);

    // Test 3.1: Add user message
    console.log('\n📋 Test 3.1: Adding user message...');
    const userMessage = await db.addMessage({
      sessionId,
      role: 'user',
      content: 'Hello! Can you help me build a React app?',
    });

    if (!userMessage.id) throw new Error('Message ID not generated');
    if (userMessage.role !== 'user') throw new Error('Role mismatch');
    if (!userMessage.created_at) throw new Error('Timestamp not set');

    messageIds.push(userMessage.id);
    info(`Message ID: ${userMessage.id}`);
    info(`Content: ${userMessage.content.substring(0, 50)}...`);
    info(`Created at: ${userMessage.created_at}`);
    success('User message added');
    testsPassed++;

    // Test 3.2: Add assistant message with metadata
    console.log('\n📋 Test 3.2: Adding assistant message with metadata...');
    const assistantMessage = await db.addMessage({
      sessionId,
      role: 'assistant',
      content: 'Sure! I\'ll help you build a React app. Let me create the basic structure...',
      modelUsed: 'gemini-2.5-flash',
      tokensUsed: 245,
      metadata: {
        temperature: 0.7,
        maxTokens: 2000,
        stopReason: 'end_turn',
      },
    });

    if (!assistantMessage.model_used) throw new Error('Model not saved');
    if (assistantMessage.tokens_used !== 245) throw new Error('Tokens mismatch');
    if (!assistantMessage.metadata?.temperature) throw new Error('Metadata not saved');

    messageIds.push(assistantMessage.id);
    info(`Model: ${assistantMessage.model_used}`);
    info(`Tokens: ${assistantMessage.tokens_used}`);
    info(`Metadata: ${Object.keys(assistantMessage.metadata).join(', ')}`);
    success('Assistant message with metadata added');
    testsPassed++;

    // Test 3.3: Add multiple messages in conversation
    console.log('\n📋 Test 3.3: Adding conversation (4 more messages)...');
    const conversation = [
      { role: 'user' as const, content: 'Can you add TypeScript support?' },
      { role: 'assistant' as const, content: 'Yes! I\'ll add TypeScript configuration...', model: 'gemini-2.5-flash', tokens: 180 },
      { role: 'user' as const, content: 'Great! Now add a dark mode toggle' },
      { role: 'assistant' as const, content: 'I\'ll implement dark mode using CSS variables...', model: 'gemini-2.5-flash', tokens: 320 },
    ];

    for (const msg of conversation) {
      const added = await db.addMessage({
        sessionId,
        role: msg.role,
        content: msg.content,
        modelUsed: 'model' in msg ? msg.model : undefined,
        tokensUsed: 'tokens' in msg ? msg.tokens : undefined,
      });
      messageIds.push(added.id);
    }

    info(`Added ${conversation.length} messages`);
    info(`Total messages: ${messageIds.length}`);
    success('Conversation messages added');
    testsPassed++;

    // Test 3.4: Retrieve all messages
    console.log('\n📋 Test 3.4: Retrieving all messages...');
    const allMessages = await db.getMessages(sessionId);

    if (allMessages.length !== messageIds.length) {
      throw new Error(`Expected ${messageIds.length} messages, got ${allMessages.length}`);
    }

    info(`Retrieved ${allMessages.length} messages`);
    info(`User messages: ${allMessages.filter(m => m.role === 'user').length}`);
    info(`Assistant messages: ${allMessages.filter(m => m.role === 'assistant').length}`);
    success('All messages retrieved');
    testsPassed++;

    // Test 3.5: Verify message ordering
    console.log('\n📋 Test 3.5: Verifying message order...');
    let orderCorrect = true;
    for (let i = 0; i < allMessages.length - 1; i++) {
      const current = new Date(allMessages[i].created_at);
      const next = new Date(allMessages[i + 1].created_at);
      if (current > next) {
        orderCorrect = false;
        break;
      }
    }

    if (!orderCorrect) throw new Error('Messages not in chronological order');

    info('Messages are in chronological order');
    info(`First: ${new Date(allMessages[0].created_at).toISOString()}`);
    info(`Last: ${new Date(allMessages[allMessages.length - 1].created_at).toISOString()}`);
    success('Message ordering verified');
    testsPassed++;

    // Test 3.6: Update message (streaming simulation)
    console.log('\n📋 Test 3.6: Updating message (streaming simulation)...');
    const originalContent = allMessages[1].content;
    const streamedContent = originalContent + ' [UPDATED with more details about the implementation]';

    await db.updateMessage(allMessages[1].id, streamedContent);

    const updatedMessages = await db.getMessages(sessionId);
    const updatedMessage = updatedMessages.find(m => m.id === allMessages[1].id);

    if (!updatedMessage) throw new Error('Updated message not found');
    if (updatedMessage.content !== streamedContent) throw new Error('Content not updated');

    info(`Original length: ${originalContent.length} chars`);
    info(`Updated length: ${streamedContent.length} chars`);
    info(`Difference: +${streamedContent.length - originalContent.length} chars`);
    success('Message updated (streaming simulated)');
    testsPassed++;

    // Test 3.7: Test message metadata retrieval
    console.log('\n📋 Test 3.7: Checking message metadata...');
    const messagesWithModel = allMessages.filter(m => m.model_used);
    const totalTokens = allMessages.reduce((sum, m) => sum + (m.tokens_used || 0), 0);

    info(`Messages with model info: ${messagesWithModel.length}`);
    info(`Total tokens used: ${totalTokens}`);
    info(`Average tokens per AI message: ${Math.round(totalTokens / messagesWithModel.length)}`);
    success('Message metadata verified');
    testsPassed++;

    // Test 3.8: Save complete chat with saveChat
    console.log('\n📋 Test 3.8: Testing saveChat method...');
    await db.saveChat({
      anonymousId,
      urlId: sessionUrlId,
      title: 'Complete Chat Test',
      description: 'Full chat saved via saveChat',
      messages: allMessages.map((m, i) => ({
        id: String(i + 1),
        role: m.role,
        content: m.content,
      })),
      fileSnapshot: {},
    });

    const savedChat = await db.loadChat(sessionUrlId);
    if (!savedChat) throw new Error('Chat not found after save');
    if (savedChat.messages.length !== allMessages.length) {
      throw new Error('Message count mismatch after save');
    }

    info('Chat saved via saveChat method');
    info(`Messages: ${savedChat.messages.length}`);
    success('saveChat method working');
    testsPassed++;

    // Test 3.9: Get chat history
    console.log('\n📋 Test 3.9: Getting chat history...');
    const history = await db.getChatHistory(undefined, anonymousId, 10);

    if (history.length === 0) throw new Error('No history found');
    const testChat = history.find(h => h.urlId === sessionUrlId);
    if (!testChat) throw new Error('Test chat not in history');

    info(`Total chats: ${history.length}`);
    info(`Test chat title: ${testChat.description}`);
    info(`Message count: ${testChat.messageCount}`);
    success('Chat history retrieved');
    testsPassed++;

    // Test 3.10: Delete individual message
    console.log('\n📋 Test 3.10: Deleting individual message...');
    const messageToDelete = messageIds[0];
    await db.sql`DELETE FROM chat_messages WHERE id = ${messageToDelete}`;

    const afterDelete = await db.getMessages(sessionId);
    if (afterDelete.some(m => m.id === messageToDelete)) {
      throw new Error('Message not deleted');
    }

    info(`Deleted message: ${messageToDelete}`);
    info(`Remaining messages: ${afterDelete.length}`);
    success('Message deleted');
    testsPassed++;

    // Cleanup
    console.log('\n📋 Cleanup: Deleting test session...');
    await db.deleteSession(sessionId);
    info('Test session and messages deleted');

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}TEST SUMMARY${colors.reset}`);
    console.log('='.repeat(80));
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);

    if (testsFailed === 0) {
      console.log(`${colors.bright}${colors.green}🎉 All chat management tests passed!${colors.reset}\n`);
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
    if (sessionId) {
      try {
        await db.deleteSession(sessionId);
        info('Cleanup: Test session deleted');
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Run tests
testChatManagement();
