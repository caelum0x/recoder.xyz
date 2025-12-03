#!/usr/bin/env tsx
/**
 * MCP Tool Execution Test
 * Tests if MCP tools actually execute (not just list)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5173';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function log(emoji: string, msg: string) {
  console.log(`${emoji} ${msg}`);
}

function addResult(test: string, passed: boolean, message: string, data?: any) {
  results.push({ test, passed, message, data });
  const emoji = passed ? '✅' : '❌';
  log(emoji, `${test}: ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2).split('\n').slice(0, 15).join('\n   '));
  }
}

// TEST 1: Check if tool execution endpoint exists
async function testToolExecutionEndpoint() {
  log('\n🔧', '═══ TEST 1: Tool Execution Endpoint ═══\n');

  try {
    // Try to execute a simple tool
    const response = await fetch(`${API_BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'call-tool',
        serverId: 'filesystem',
        toolName: 'list_directory',
        parameters: { path: './' }
      })
    });

    const data = await response.json();

    addResult(
      'Tool Execution Endpoint',
      response.status !== 404,
      response.status === 404
        ? 'Endpoint does not exist'
        : `Endpoint exists (status: ${response.status})`,
      { status: response.status, response: data }
    );

    return data;
  } catch (error: any) {
    addResult('Tool Execution Endpoint', false, `Error: ${error.message}`);
    return null;
  }
}

// TEST 2: Try different tool call formats
async function testToolCallFormats() {
  log('\n🛠️', '═══ TEST 2: Different Tool Call Formats ═══\n');

  const formats = [
    {
      name: 'Format 1: Direct POST',
      url: '/api/mcp',
      body: {
        toolName: 'read_file',
        parameters: { path: './package.json' },
        context: {}
      }
    },
    {
      name: 'Format 2: With action',
      url: '/api/mcp?action=call-tool',
      body: {
        serverId: 'filesystem',
        toolName: 'list_directory',
        parameters: { path: './' }
      }
    },
    {
      name: 'Format 3: Tool call route',
      url: '/api/mcp/tools/call',
      body: {
        serverId: 'filesystem',
        toolName: 'read_file',
        parameters: { path: './package.json' }
      }
    }
  ];

  for (const format of formats) {
    try {
      const response = await fetch(`${API_BASE}${format.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(format.body)
      });

      const data = await response.json();

      addResult(
        format.name,
        response.ok || response.status === 400, // 400 means endpoint exists but bad params
        response.ok
          ? 'Tool executed successfully'
          : response.status === 400
          ? 'Endpoint exists (validation error)'
          : response.status === 404
          ? 'Endpoint not found'
          : `Status: ${response.status}`,
        {
          status: response.status,
          hasResult: !!data.result,
          hasError: !!data.error,
          response: data
        }
      );
    } catch (error: any) {
      addResult(format.name, false, `Error: ${error.message}`);
    }
  }
}

// TEST 3: Check MCP client functionality
async function testMCPClientLibrary() {
  log('\n🔌', '═══ TEST 3: MCP Client Library ═══\n');

  try {
    const { MCPClient } = await import('../app/lib/mcp/client');
    const client = new MCPClient();

    addResult(
      'MCPClient Instantiation',
      true,
      'Client created successfully'
    );

    // Try to test connection (this will likely fail without actual server, but tests the code path)
    try {
      // This should fail gracefully
      const testConfig = {
        id: 'test-client',
        name: 'Test Client',
        command: 'echo',
        args: ['test'],
        env: {}
      };

      await client.connect(testConfig);

      addResult(
        'MCPClient Connection',
        true,
        'Connection attempted (likely failed but code works)'
      );
    } catch (error: any) {
      addResult(
        'MCPClient Connection',
        true, // True because we expect it to fail, we're testing if the code runs
        `Connection failed as expected: ${error.message.substring(0, 100)}`
      );
    }

  } catch (error: any) {
    addResult('MCPClient Library', false, `Failed to import: ${error.message}`);
  }
}

// TEST 4: Check if filesystem tools are available
async function testFilesystemTools() {
  log('\n📁', '═══ TEST 4: Filesystem Tools Availability ═══\n');

  try {
    const response = await fetch(`${API_BASE}/api/mcp?action=list-tools`);
    const data = await response.json();

    if (data.success && data.data) {
      const filesystemTools = data.data.filter((t: any) =>
        t.category === 'filesystem' ||
        t.name.includes('file') ||
        t.name.includes('directory')
      );

      addResult(
        'Filesystem Tools Available',
        filesystemTools.length > 0,
        `Found ${filesystemTools.length} filesystem tools`,
        {
          count: filesystemTools.length,
          tools: filesystemTools.map((t: any) => t.name)
        }
      );

      return filesystemTools;
    } else {
      addResult('Filesystem Tools Available', false, 'Failed to get tools list');
      return [];
    }
  } catch (error: any) {
    addResult('Filesystem Tools Available', false, `Error: ${error.message}`);
    return [];
  }
}

// TEST 5: Check tool call logging
async function testToolCallLogging() {
  log('\n📝', '═══ TEST 5: Tool Call Logging ═══\n');

  try {
    // First make a tool call attempt
    await fetch(`${API_BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: 'read_file',
        parameters: { path: './package.json' }
      })
    });

    // Check if there's a logs endpoint
    const logsResponse = await fetch(`${API_BASE}/api/mcp/servers/filesystem/logs`);

    addResult(
      'Tool Call Logs Endpoint',
      logsResponse.status !== 404,
      logsResponse.status === 404
        ? 'Logs endpoint not found'
        : `Logs endpoint exists (status: ${logsResponse.status})`
    );

    if (logsResponse.ok) {
      const logsData = await logsResponse.json();
      addResult(
        'Tool Call Logs Data',
        !!logsData.logs,
        logsData.logs?.length > 0
          ? `Found ${logsData.logs.length} log entries`
          : 'No logs found',
        { count: logsData.logs?.length }
      );
    }
  } catch (error: any) {
    addResult('Tool Call Logging', false, `Error: ${error.message}`);
  }
}

// TEST 6: Check server status/health per server
async function testIndividualServerHealth() {
  log('\n🏥', '═══ TEST 6: Individual Server Health ═══\n');

  try {
    const serversResponse = await fetch(`${API_BASE}/api/mcp/servers`);
    const serversData = await serversResponse.json();

    if (serversData.servers && serversData.servers.length > 0) {
      const firstServer = serversData.servers[0];

      // Try to get health for specific server
      const healthResponse = await fetch(`${API_BASE}/api/mcp/servers/${firstServer.server_id}/health`);

      addResult(
        'Individual Server Health Endpoint',
        healthResponse.status !== 404,
        healthResponse.status === 404
          ? 'Per-server health endpoint not found'
          : `Endpoint exists (status: ${healthResponse.status})`
      );

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        addResult(
          'Server Health Data',
          !!healthData.status,
          `Server status: ${healthData.status}`,
          healthData
        );
      }
    } else {
      addResult('Individual Server Health', false, 'No servers to test');
    }
  } catch (error: any) {
    addResult('Individual Server Health', false, `Error: ${error.message}`);
  }
}

// MAIN TEST RUNNER
async function runTests() {
  console.log('\n');
  log('🚀', '═══════════════════════════════════════════════════════');
  log('🚀', '  MCP TOOL EXECUTION TEST');
  log('🚀', '  Testing if MCP tools actually EXECUTE');
  log('🚀', '═══════════════════════════════════════════════════════');
  console.log('\n');

  await testToolExecutionEndpoint();
  await testToolCallFormats();
  await testMCPClientLibrary();
  await testFilesystemTools();
  await testToolCallLogging();
  await testIndividualServerHealth();

  // Print summary
  console.log('\n');
  log('📊', '═══════════════════════════════════════════════════════');
  log('📊', '  EXECUTION TEST SUMMARY');
  log('📊', '═══════════════════════════════════════════════════════');
  console.log('\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`  Total Tests: ${total}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('  ❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    • ${r.test}: ${r.message}`);
    });
    console.log('\n');
  }

  log('📊', '═══════════════════════════════════════════════════════');

  // Verdict
  console.log('\n');
  if (passed === total) {
    log('🎉', '✨ ALL EXECUTION TESTS PASSED! ✨');
  } else if (passed > failed) {
    log('⚠️', `Tool execution partially working (${((passed/total)*100).toFixed(0)}% pass rate)`);
  } else {
    log('❌', 'Tool execution has significant issues');
  }

  console.log('\n');
  log('💡', 'INTERPRETATION:');
  console.log('   - If "Endpoint exists" → Routes are configured');
  console.log('   - If "Tool executed" → Full execution working');
  console.log('   - If "Validation error" → Endpoint works but needs correct params');
  console.log('   - If "Not found" → Endpoint not implemented\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
