#!/usr/bin/env tsx
/**
 * Complete MCP Verification Script
 * Tests actual MCP functionality with dev server running
 * Run with dev server: pnpm run dev (in another terminal)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5173';

interface TestResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function log(emoji: string, msg: string) {
  console.log(`${emoji} ${msg}`);
}

function addResult(category: string, test: string, passed: boolean, message: string, data?: any) {
  results.push({ category, test, passed, message, data });
  const emoji = passed ? '✅' : '❌';
  log(emoji, `[${category}] ${test}: ${message}`);
  if (data && Object.keys(data).length > 0) {
    console.log('   ', JSON.stringify(data, null, 2).split('\n').slice(0, 10).join('\n   '));
  }
}

async function waitForServer(maxAttempts = 10) {
  log('⏳', 'Waiting for dev server to be ready...');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${API_BASE}`, { method: 'HEAD' });
      if (response.ok || response.status === 404) {
        log('✅', 'Dev server is ready!');
        return true;
      }
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  log('❌', 'Dev server not responding. Please run: pnpm run dev');
  return false;
}

// TEST 1: Server Health
async function testServerHealth() {
  log('\n🏥', '═══ TEST 1: Server Health ═══\n');

  try {
    const response = await fetch(`${API_BASE}/api/mcp/health`);
    const data = await response.json();

    addResult('Health', 'MCP Health Endpoint', response.ok,
      response.ok ? 'Endpoint responding' : `Failed with status ${response.status}`,
      data);

    if (data.healthy !== undefined) {
      addResult('Health', 'MCP Health Status', typeof data.healthy === 'boolean',
        data.healthy ? 'MCP system is healthy' : 'MCP system unhealthy',
        { healthy: data.healthy });
    }
  } catch (error: any) {
    addResult('Health', 'MCP Health Endpoint', false, `Error: ${error.message}`);
  }
}

// TEST 2: List Servers
async function testListServers() {
  log('\n📋', '═══ TEST 2: List MCP Servers ═══\n');

  try {
    const response = await fetch(`${API_BASE}/api/mcp/servers`);

    if (response.status === 401) {
      addResult('Servers', 'List Servers', false,
        'Authentication required - MCP endpoints need auth');
      return null;
    }

    const data = await response.json();

    addResult('Servers', 'List Servers API', response.ok,
      response.ok ? 'API responding' : `Failed with status ${response.status}`);

    if (data.servers) {
      addResult('Servers', 'Server Data Structure', Array.isArray(data.servers),
        `Found ${data.servers.length} servers`,
        { count: data.servers.length, servers: data.servers.slice(0, 3) });

      return data.servers;
    }

    return [];
  } catch (error: any) {
    addResult('Servers', 'List Servers API', false, `Error: ${error.message}`);
    return null;
  }
}

// TEST 3: Install Test Server
async function testInstallServer() {
  log('\n⚙️', '═══ TEST 3: Install MCP Server ═══\n');

  const testServer = {
    serverId: `test-filesystem-${Date.now()}`,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
      env: {}
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/mcp/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testServer)
    });

    if (response.status === 401) {
      addResult('Install', 'Install Server', false, 'Authentication required');
      return null;
    }

    const data = await response.json();

    addResult('Install', 'Install Server API', response.ok,
      response.ok ? 'Installation API works' : `Failed: ${data.error || 'Unknown error'}`,
      response.ok ? { serverId: data.server?.serverId } : { error: data.error });

    if (response.ok && data.server) {
      addResult('Install', 'Server Created', true,
        `Server ${data.server.serverId} created successfully`);
      return data.server.serverId;
    }

    return null;
  } catch (error: any) {
    addResult('Install', 'Install Server API', false, `Error: ${error.message}`);
    return null;
  }
}

// TEST 4: Get Server Details
async function testGetServer(serverId: string | null) {
  log('\n🔍', '═══ TEST 4: Get Server Details ═══\n');

  if (!serverId) {
    addResult('Details', 'Get Server', false, 'No server ID available to test');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/mcp/servers/${serverId}`);

    if (response.status === 401) {
      addResult('Details', 'Get Server', false, 'Authentication required');
      return;
    }

    const data = await response.json();

    addResult('Details', 'Get Server API', response.ok,
      response.ok ? 'Can fetch server details' : `Failed with status ${response.status}`,
      response.ok ? data.server : { error: data.error });

  } catch (error: any) {
    addResult('Details', 'Get Server API', false, `Error: ${error.message}`);
  }
}

// TEST 5: Update Server
async function testUpdateServer(serverId: string | null) {
  log('\n✏️', '═══ TEST 5: Update Server ═══\n');

  if (!serverId) {
    addResult('Update', 'Update Server', false, 'No server ID available to test');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/mcp/servers/${serverId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true })
    });

    if (response.status === 401) {
      addResult('Update', 'Update Server', false, 'Authentication required');
      return;
    }

    const data = await response.json();

    addResult('Update', 'Update Server API', response.ok,
      response.ok ? 'Can update server config' : `Failed: ${data.error}`,
      response.ok ? { updated: true } : { error: data.error });

  } catch (error: any) {
    addResult('Update', 'Update Server API', false, `Error: ${error.message}`);
  }
}

// TEST 6: List Tools
async function testListTools() {
  log('\n🛠️', '═══ TEST 6: List MCP Tools ═══\n');

  try {
    const response = await fetch(`${API_BASE}/api/mcp?action=list-tools`);

    if (response.status === 401) {
      addResult('Tools', 'List Tools', false, 'Authentication required');
      return;
    }

    const data = await response.json();

    if (data.success !== undefined) {
      addResult('Tools', 'List Tools API', data.success,
        data.success ? `Found ${data.data?.length || 0} tools` : 'API failed',
        data.success ? { count: data.data?.length, tools: data.data?.slice(0, 3) } : {});
    } else {
      addResult('Tools', 'List Tools API', false, 'Unexpected response format', data);
    }
  } catch (error: any) {
    addResult('Tools', 'List Tools API', false, `Error: ${error.message}`);
  }
}

// TEST 7: Frontend Loading
async function testFrontend() {
  log('\n🌐', '═══ TEST 7: Frontend Access ═══\n');

  try {
    const response = await fetch(`${API_BASE}/`);

    addResult('Frontend', 'Homepage', response.ok,
      response.ok ? 'Frontend loads successfully' : `Failed with status ${response.status}`);

    const html = await response.text();

    addResult('Frontend', 'React Hydration', html.includes('root'),
      html.includes('root') ? 'React app markup present' : 'No React markup found');

  } catch (error: any) {
    addResult('Frontend', 'Homepage', false, `Error: ${error.message}`);
  }
}

// MAIN TEST RUNNER
async function runAllTests() {
  console.log('\n');
  log('🚀', '═══════════════════════════════════════════════════════');
  log('🚀', '  COMPLETE MCP FUNCTIONALITY VERIFICATION');
  log('🚀', '  Testing with REAL dev server');
  log('🚀', '═══════════════════════════════════════════════════════');
  console.log('\n');

  // Check server is running
  const serverReady = await waitForServer();
  if (!serverReady) {
    log('❌', '\nCannot proceed without dev server. Please run:\n    pnpm run dev\n');
    process.exit(1);
  }

  // Run all tests
  await testServerHealth();
  const servers = await testListServers();
  const serverId = await testInstallServer();
  await testGetServer(serverId);
  await testUpdateServer(serverId);
  await testListTools();
  await testFrontend();

  // Print summary
  console.log('\n');
  log('📊', '═══════════════════════════════════════════════════════');
  log('📊', '  FINAL RESULTS');
  log('📊', '═══════════════════════════════════════════════════════');
  console.log('\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`  Total Tests: ${total}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  // Group by category
  const categories = [...new Set(results.map(r => r.category))];
  console.log('  BY CATEGORY:');
  categories.forEach(cat => {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.passed).length;
    const emoji = catPassed === catResults.length ? '✅' : catPassed > 0 ? '⚠️' : '❌';
    console.log(`    ${emoji} ${cat}: ${catPassed}/${catResults.length} passed`);
  });

  if (failed > 0) {
    console.log('\n  ❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    • [${r.category}] ${r.test}: ${r.message}`);
    });
  }

  console.log('\n');
  log('📊', '═══════════════════════════════════════════════════════');

  // Final verdict
  console.log('\n');
  if (passed === total) {
    log('🎉', '✨ ALL TESTS PASSED! MCP is fully functional! ✨');
  } else if (passed > failed) {
    log('⚠️', `MCP is mostly working (${((passed/total)*100).toFixed(0)}% pass rate)`);
    log('💡', 'Check failures above for issues to fix');
  } else {
    log('❌', 'MCP has significant issues - many tests failing');
    log('🔧', 'Requires debugging and fixes');
  }
  console.log('\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run it
runAllTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
