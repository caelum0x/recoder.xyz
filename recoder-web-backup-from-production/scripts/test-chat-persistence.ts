/**
 * Test script to verify chat persistence is working
 * Tests:
 * 1. Create a chat session
 * 2. Add messages
 * 3. Save file snapshot
 * 4. Load chat back
 * 5. Verify all data is persisted
 */

import { ChatHistoryDB } from '../app/lib/.server/db/chat-history-db';

async function testChatPersistence() {
  console.log('🧪 Testing Chat Persistence...\n');

  // Load DATABASE_URL from .env.local
  const fs = await import('fs');
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const databaseUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  const db = new ChatHistoryDB(databaseUrl);

  try {
    // Test 1: Create a chat session
    console.log('📝 Test 1: Creating chat session...');
    const testUrlId = `test-${Date.now()}`;
    const session = await db.createSession({
      anonymousId: 'test-user-123',
      urlId: testUrlId,
      title: 'Test Chat',
      description: 'Testing chat persistence',
    });
    console.log(`✅ Session created: ${session.id}\n`);

    // Test 2: Add messages
    console.log('💬 Test 2: Adding messages...');
    const userMessage = await db.addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Hello, create a React todo app',
    });
    console.log(`✅ User message added: ${userMessage.id}`);

    const assistantMessage = await db.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: 'I\'ll create a React todo app for you...',
      modelUsed: 'gemini-2.5-flash',
      tokensUsed: 150,
    });
    console.log(`✅ Assistant message added: ${assistantMessage.id}\n`);

    // Test 3: Save file snapshot
    console.log('📂 Test 3: Saving file snapshot...');
    const fileSnapshot = {
      'src/App.tsx': 'import React from "react";\n\nexport default function App() {\n  return <div>Todo App</div>;\n}',
      'src/components/TodoList.tsx': 'export function TodoList() {\n  return <ul>...</ul>;\n}',
      'package.json': '{\n  "name": "todo-app",\n  "version": "1.0.0"\n}',
    };

    await db.saveChat({
      anonymousId: 'test-user-123',
      urlId: testUrlId,
      title: 'Todo App Project',
      description: 'React Todo Application',
      messages: [
        { id: '1', role: 'user', content: 'Hello, create a React todo app' },
        { id: '2', role: 'assistant', content: 'I\'ll create a React todo app for you...' },
      ],
      fileSnapshot,
    });
    console.log(`✅ File snapshot saved: ${Object.keys(fileSnapshot).length} files\n`);

    // Test 4: Load chat back
    console.log('📥 Test 4: Loading chat...');
    const loadedChat = await db.loadChat(testUrlId);

    if (!loadedChat) {
      throw new Error('Failed to load chat');
    }

    console.log(`✅ Chat loaded:`);
    console.log(`   - URL ID: ${loadedChat.urlId}`);
    console.log(`   - Messages: ${loadedChat.messages.length}`);
    console.log(`   - Files: ${Object.keys(loadedChat.fileSnapshot || {}).length}\n`);

    // Test 5: Verify data integrity
    console.log('🔍 Test 5: Verifying data integrity...');

    // Check messages
    if (loadedChat.messages.length !== 2) {
      throw new Error(`Expected 2 messages, got ${loadedChat.messages.length}`);
    }
    console.log('✅ Message count correct');

    // Check file snapshot
    const loadedFiles = Object.keys(loadedChat.fileSnapshot || {});
    const originalFiles = Object.keys(fileSnapshot);

    if (loadedFiles.length !== originalFiles.length) {
      throw new Error(`Expected ${originalFiles.length} files, got ${loadedFiles.length}`);
    }
    console.log('✅ File count correct');

    // Check file contents
    for (const filename of originalFiles) {
      if (loadedChat.fileSnapshot?.[filename] !== fileSnapshot[filename]) {
        throw new Error(`File content mismatch for ${filename}`);
      }
    }
    console.log('✅ File contents correct');

    // Test 6: Get chat history
    console.log('\n📋 Test 6: Getting chat history...');
    const history = await db.getChatHistory(undefined, 'test-user-123', 10);
    console.log(`✅ Found ${history.length} chat sessions for user`);

    if (history.length === 0) {
      throw new Error('No chat history found');
    }

    const latestChat = history[0];
    console.log(`   Latest chat: "${latestChat.description}"`);
    console.log(`   Messages: ${latestChat.messageCount}`);
    console.log(`   Timestamp: ${latestChat.timestamp}\n`);

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await db.deleteSession(session.id);
    console.log('✅ Test data deleted\n');

    console.log('🎉 All tests passed! Chat persistence is working correctly.\n');
    console.log('Summary:');
    console.log('✅ Sessions can be created');
    console.log('✅ Messages can be added');
    console.log('✅ File snapshots are saved');
    console.log('✅ Chat data can be loaded');
    console.log('✅ Data integrity is maintained');
    console.log('✅ Chat history can be retrieved');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testChatPersistence().then(() => {
  console.log('\n✨ Testing complete!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
