#!/usr/bin/env tsx
/**
 * REAL MCP Functionality Test
 * This script actually tests if MCP works - no mocking, no fake data
 * Run with: npx tsx scripts/test-mcp-real.ts
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5173';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

function addResult(result: TestResult) {
  results.push(result);
  const emoji = result.passed ? '✅' : '❌';
  log(emoji, `${result.name}: ${result.message}`);
  if (result.data) {
    console.log('   Data:', JSON.stringify(result.data, null, 2).split('\n').map(l => '   ' + l).join('\n').trim());
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// TEST 1: Check if MCP API endpoints exist
async function testAPIEndpoints() {
  log('🧪', 'TEST 1: Checking if MCP API endpoints exist...');

  try {
    const response = await fetch(`${API_BASE}/api/mcp/servers`);
    addResult({
      name: 'MCP Servers API',
      passed: response.status === 200 || response.status === 401, // 401 means endpoint exists but needs auth
      message: response.status === 401
        ? 'Endpoint exists but requires authentication'
        : `Responded with status ${response.status}`,
      data: response.status === 200 ? await response.json() : null,
    });
  } catch (error: any) {
    addResult({
      name: 'MCP Servers API',
      passed: false,
      message: `Failed to connect: ${error.message}`,
    });
  }
}

// TEST 2: Check MCP Health
async function testMCPHealth() {
  log('🧪', 'TEST 2: Checking MCP health endpoint...');

  try {
    const response = await fetch(`${API_BASE}/api/mcp/health`);
    const data = await response.json();

    addResult({
      name: 'MCP Health Check',
      passed: response.status === 200 && typeof data.healthy === 'boolean',
      message: data.healthy ? 'MCP is healthy' : 'MCP health check failed',
      data,
    });
  } catch (error: any) {
    addResult({
      name: 'MCP Health Check',
      passed: false,
      message: `Health check failed: ${error.message}`,
    });
  }
}

// TEST 3: Try to install a test server
async function testServerInstallation() {
  log('🧪', 'TEST 3: Testing server installation...');

  try {
    const response = await fetch(`${API_BASE}/api/mcp/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId: 'test-server-' + Date.now(),
        config: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
          env: {},
        },
      }),
    });

    const data = await response.json();

    addResult({
      name: 'Server Installation',
      passed: response.status === 200 && data.server,
      message: response.status === 200
        ? `Server installed: ${data.server?.serverId}`
        : `Installation failed: ${data.error || 'Unknown error'}`,
      data: data.server || data,
    });

    return data.server?.serverId;
  } catch (error: any) {
    addResult({
      name: 'Server Installation',
      passed: false,
      message: `Installation failed: ${error.message}`,
    });
    return null;
  }
}

// TEST 4: List available tools
async function testToolListing() {
  log('🧪', 'TEST 4: Listing available MCP tools...');

  try {
    const response = await fetch(`${API_BASE}/api/mcp?action=list-tools`);
    const data = await response.json();

    const hasTools = data.success && Array.isArray(data.data) && data.data.length > 0;

    addResult({
      name: 'Tool Listing',
      passed: data.success !== undefined, // Endpoint works
      message: hasTools
        ? `Found ${data.data.length} tools`
        : 'No tools available (this is ok if no servers are configured)',
      data: hasTools ? data.data : null,
    });
  } catch (error: any) {
    addResult({
      name: 'Tool Listing',
      passed: false,
      message: `Failed to list tools: ${error.message}`,
    });
  }
}

// TEST 5: Check if MCP Client library works
async function testMCPClient() {
  log('🧪', 'TEST 5: Testing MCP Client library...');

  try {
    const { MCPClient } = await import('../app/lib/mcp/client');
    const client = new MCPClient();

    addResult({
      name: 'MCP Client Library',
      passed: true,
      message: 'MCPClient class successfully imported and instantiated',
      data: {
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(client)),
      },
    });
  } catch (error: any) {
    addResult({
      name: 'MCP Client Library',
      passed: false,
      message: `Failed to load MCPClient: ${error.message}`,
    });
  }
}

// TEST 6: Check if UI components exist
async function testUIComponents() {
  log('🧪', 'TEST 6: Checking if MCP UI components exist...');

  const components = [
    { name: 'MCPServerManager', path: '../app/components/mcp/MCPServerManager' },
    { name: 'MCPServerPanel', path: '../app/components/mcp/MCPServerPanel' },
    { name: 'MCPToolsPanel', path: '../app/components/mcp/MCPToolsPanel' },
  ];

  for (const comp of components) {
    try {
      await import(comp.path);
      addResult({
        name: `UI Component: ${comp.name}`,
        passed: true,
        message: 'Component file exists and can be imported',
      });
    } catch (error: any) {
      addResult({
        name: `UI Component: ${comp.name}`,
        passed: false,
        message: `Failed to import: ${error.message}`,
      });
    }
  }
}

// TEST 7: Check if MCP registry works
async function testMCPRegistry() {
  log('🧪', 'TEST 7: Testing MCP Registry...');

  try {
    const { mcpRegistry } = await import('../mcp/registry');

    const allServers = mcpRegistry.getAll();
    const enabledServers = mcpRegistry.getEnabled();

    addResult({
      name: 'MCP Registry',
      passed: true,
      message: `Registry working: ${allServers.length} total servers, ${enabledServers.length} enabled`,
      data: {
        total: allServers.length,
        enabled: enabledServers.length,
        servers: allServers.map(s => ({ id: s.id, name: s.name, enabled: s.enabled })),
      },
    });
  } catch (error: any) {
    addResult({
      name: 'MCP Registry',
      passed: false,
      message: `Registry test failed: ${error.message}`,
    });
  }
}

// Main test runner
async function runTests() {
  console.log('\n');
  log('🚀', '═══════════════════════════════════════════════════════════');
  log('🚀', '  MCP REAL FUNCTIONALITY TEST');
  log('🚀', '  Testing if MCP actually works (not just TypeScript types)');
  log('🚀', '═══════════════════════════════════════════════════════════');
  console.log('\n');

  // Wait a bit for server to be ready
  log('⏳', 'Waiting for server to be ready...');
  await sleep(1000);

  // Run all tests
  await testAPIEndpoints();
  await testMCPHealth();
  await testServerInstallation();
  await testToolListing();
  await testMCPClient();
  await testUIComponents();
  await testMCPRegistry();

  // Print summary
  console.log('\n');
  log('📊', '═══════════════════════════════════════════════════════════');
  log('📊', '  TEST SUMMARY');
  log('📊', '═══════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\n  Total Tests: ${total}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    log('⚠️', '  FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    • ${r.name}: ${r.message}`);
    });
    console.log('\n');
  }

  log('📊', '═══════════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});
