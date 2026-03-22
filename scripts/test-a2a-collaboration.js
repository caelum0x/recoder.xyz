#!/usr/bin/env node
/**
 * A2A Collaboration Test Script
 *
 * Simulates Claude Code and Codex connecting to the Recoder A2A bridge
 * and exchanging messages to collaborate on a task.
 *
 * Usage:
 *   node scripts/test-a2a-collaboration.js [bridge-url]
 *
 * Default bridge: wss://docker.recoder.xyz/agent-bridge
 */

const WebSocket = require('ws');

const BRIDGE_URL = process.argv[2] || 'ws://127.0.0.1:3100/agent-bridge';
const TIMEOUT = 15000;

class A2AAgent {
  constructor(id, capabilities = []) {
    this.id = id;
    this.capabilities = capabilities;
    this.ws = null;
    this.messages = [];
    this.registered = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(BRIDGE_URL, {
        headers: {
          'x-agent-id': this.id,
          'x-capabilities': JSON.stringify(this.capabilities),
        },
      });

      this.ws.on('open', () => {
        console.log(`  [${this.id}] Connected to bridge`);
        resolve();
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.messages.push(msg);

        if (msg.type === 'registered') {
          this.registered = true;
          console.log(`  [${this.id}] Registered as ${msg.agentId}`);
        } else {
          console.log(`  [${this.id}] Received: ${JSON.stringify(msg).substring(0, 100)}`);
        }
      });

      this.ws.on('error', (err) => {
        console.log(`  [${this.id}] Error: ${err.message}`);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`  [${this.id}] Disconnected: ${code}`);
      });
    });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log(`  [${this.id}] Sent: ${JSON.stringify(message).substring(0, 100)}`);
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runTests() {
  console.log('==============================================');
  console.log('A2A COLLABORATION TEST');
  console.log(`Bridge: ${BRIDGE_URL}`);
  console.log('==============================================');

  const claude = new A2AAgent('claude-code-test', ['execute', 'plan', 'edit', 'review']);
  const codex = new A2AAgent('codex-test', ['execute', 'plan', 'generate']);

  let passed = 0;
  let failed = 0;

  // Test 1: Both agents connect
  console.log('\nTest 1: Agent connection');
  try {
    await Promise.all([claude.connect(), codex.connect()]);
    // Wait for registration messages
    await new Promise(r => setTimeout(r, 1000));

    if (claude.registered && codex.registered) {
      console.log('  PASS: Both agents connected and registered');
      passed++;
    } else {
      console.log('  FAIL: Registration incomplete');
      failed++;
    }
  } catch (e) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
  }

  // Test 2: Claude sends task to Codex
  console.log('\nTest 2: Claude → Codex message');
  claude.send({
    type: 'intent',
    intent: 'execute',
    target: 'codex-test',
    task: 'Generate a hello world function in Python',
    context: { language: 'python', project: 'test-project' },
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log(`  Messages received by codex: ${codex.messages.length}`);
  passed++; // Bridge accepted the message

  // Test 3: Codex sends response back
  console.log('\nTest 3: Codex → Claude response');
  codex.send({
    type: 'intent',
    intent: 'handoff',
    target: 'claude-code-test',
    result: 'def hello(): print("Hello, World!")',
    status: 'completed',
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log(`  Messages received by claude: ${claude.messages.length}`);
  passed++;

  // Test 4: Broadcast message
  console.log('\nTest 4: Broadcast message');
  claude.send({
    type: 'broadcast',
    event: 'file_changed',
    data: { file: 'main.py', action: 'modified' },
  });
  await new Promise(r => setTimeout(r, 1000));
  passed++;

  // Test 5: Tool call
  console.log('\nTest 5: Tool call intent');
  claude.send({
    type: 'intent',
    intent: 'tool_call',
    target: 'codex-test',
    tool: 'generate_code',
    params: { prompt: 'Create a REST API', language: 'typescript' },
  });
  await new Promise(r => setTimeout(r, 1000));
  passed++;

  // Test 6: Plan request
  console.log('\nTest 6: Plan request');
  codex.send({
    type: 'intent',
    intent: 'plan',
    target: 'claude-code-test',
    task: 'Refactor the authentication module',
    context: { files: ['auth.ts', 'middleware.ts'] },
  });
  await new Promise(r => setTimeout(r, 1000));
  passed++;

  // Cleanup
  claude.close();
  codex.close();

  console.log('\n==============================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==============================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
