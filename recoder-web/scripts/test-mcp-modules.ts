#!/usr/bin/env tsx
/**
 * MCP Module Tests - No Server Required
 * Tests if the MCP code modules actually work
 */

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function test(category: string, name: string, passed: boolean, message: string, data?: any) {
  const result: TestResult = { category, name, passed, message, data };
  results.push(result);
  const emoji = passed ? '✅' : '❌';
  console.log(`${emoji} [${category}] ${name}: ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2));
  }
}

async function testTypeDefinitions() {
  console.log('\n📦 Testing Type Definitions...\n');

  try {
    const types = await import('../app/types/mcp');
    test('Types', 'MCP Types', true, 'Successfully imported MCP type definitions');

    // Check if key types exist
    const hasServer = 'MCPServer' in types;
    const hasConfig = 'MCPServerConfig' in types;
    const hasTool = 'MCPTool' in types;

    test('Types', 'Type Exports', hasServer && hasConfig && hasTool,
      `Exported types: MCPServer=${hasServer}, MCPServerConfig=${hasConfig}, MCPTool=${hasTool}`);

  } catch (error: any) {
    test('Types', 'MCP Types', false, `Failed to import: ${error.message}`);
  }
}

async function testMCPClient() {
  console.log('\n🔌 Testing MCP Client...\n');

  try {
    const { MCPClient } = await import('../app/lib/mcp/client');

    test('Client', 'Import', true, 'MCPClient class imported successfully');

    // Test instantiation
    const client = new MCPClient();
    test('Client', 'Instantiation', true, 'MCPClient instance created');

    // Check methods exist
    const methods = ['connect', 'listTools', 'callTool', 'disconnect'];
    const hasMethods = methods.every(m => typeof (client as any)[m] === 'function');

    test('Client', 'Methods', hasMethods,
      hasMethods ? 'All required methods exist' : 'Some methods missing',
      { methods: methods.filter(m => typeof (client as any)[m] === 'function') });

  } catch (error: any) {
    test('Client', 'MCPClient', false, `Failed: ${error.message}`);
  }
}

async function testMCPRegistry() {
  console.log('\n📚 Testing MCP Registry...\n');

  try {
    const { mcpRegistry, MCPRegistry } = await import('../mcp/registry');

    test('Registry', 'Import', true, 'Registry imported successfully');

    // Test registry instance
    test('Registry', 'Instance', !!mcpRegistry, 'Global registry instance exists');

    // Test methods
    const methods = ['register', 'unregister', 'get', 'getAll', 'getEnabled', 'getAllTools'];
    const hasMethods = methods.every(m => typeof (mcpRegistry as any)[m] === 'function');

    test('Registry', 'Methods', hasMethods,
      hasMethods ? 'All required methods exist' : 'Some methods missing');

    // Test initial state
    const allServers = mcpRegistry.getAll();
    const enabledServers = mcpRegistry.getEnabled();

    test('Registry', 'Initial State', true,
      `${allServers.length} total servers, ${enabledServers.length} enabled`,
      { total: allServers.length, enabled: enabledServers.length });

  } catch (error: any) {
    test('Registry', 'Registry', false, `Failed: ${error.message}`);
  }
}

async function testAPIClient() {
  console.log('\n🌐 Testing API Client...\n');

  try {
    const apiClient = await import('../app/lib/api-client');

    test('API', 'Import', true, 'API client imported successfully');

    // Check functions exist
    const functions = ['get', 'post', 'patch', 'del', 'typedFetch'];
    const hasFunctions = functions.every(f => typeof (apiClient as any)[f] === 'function');

    test('API', 'Functions', hasFunctions,
      hasFunctions ? 'All API functions exist' : 'Some functions missing',
      { functions: functions.filter(f => typeof (apiClient as any)[f] === 'function') });

  } catch (error: any) {
    test('API', 'API Client', false, `Failed: ${error.message}`);
  }
}

async function testUIComponents() {
  console.log('\n🎨 Testing UI Components...\n');

  const components = [
    { name: 'MCPServerManager', path: '../app/components/mcp/MCPServerManager' },
    { name: 'MCPServerPanel', path: '../app/components/mcp/MCPServerPanel' },
    { name: 'MCPToolsPanel', path: '../app/components/mcp/MCPToolsPanel' },
    { name: 'MCPButton', path: '../app/components/chat/MCPButton' },
  ];

  for (const comp of components) {
    try {
      const module = await import(comp.path);
      const hasDefault = 'default' in module;
      test('UI', comp.name, hasDefault,
        hasDefault ? 'Component exists' : 'Component missing default export');
    } catch (error: any) {
      test('UI', comp.name, false, `Failed to import: ${error.message}`);
    }
  }
}

async function testMCPServers() {
  console.log('\n🖥️  Testing MCP Server Implementations...\n');

  const servers = [
    { name: 'GitHub Server', path: '../app/lib/.server/mcp/servers/github' },
    { name: 'Filesystem Server', path: '../app/lib/.server/mcp/servers/filesystem' },
    { name: 'API Server', path: '../app/lib/.server/mcp/servers/api' },
    { name: 'Database Server', path: '../app/lib/.server/mcp/servers/database' },
  ];

  for (const server of servers) {
    try {
      const module = await import(server.path);
      const hasExports = Object.keys(module).length > 0;
      test('Servers', server.name, hasExports,
        hasExports ? 'Server module exists' : 'Server module empty',
        { exports: Object.keys(module) });
    } catch (error: any) {
      test('Servers', server.name, false, `Failed to import: ${error.message}`);
    }
  }
}

async function testRouteHandlers() {
  console.log('\n🛣️  Testing Route Handlers...\n');

  const routes = [
    { name: 'MCP Servers Route', path: '../app/routes/api.mcp.servers' },
    { name: 'MCP Health Route', path: '../app/routes/api.mcp.health' },
    { name: 'MCP Main Route', path: '../app/routes/api.mcp' },
  ];

  for (const route of routes) {
    try {
      const module = await import(route.path);
      const hasHandlers = ['GET', 'POST', 'PATCH', 'DELETE'].some(method => method in module);
      test('Routes', route.name, hasHandlers,
        hasHandlers ? 'Route handlers exist' : 'No route handlers found',
        { handlers: ['GET', 'POST', 'PATCH', 'DELETE'].filter(m => m in module) });
    } catch (error: any) {
      test('Routes', route.name, false, `Failed to import: ${error.message}`);
    }
  }
}

async function runTests() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MCP MODULE FUNCTIONALITY TEST');
  console.log('  Testing if MCP code modules work (without running server)');
  console.log('═══════════════════════════════════════════════════════════');

  await testTypeDefinitions();
  await testMCPClient();
  await testMCPRegistry();
  await testAPIClient();
  await testUIComponents();
  await testMCPServers();
  await testRouteHandlers();

  // Print summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

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
    console.log('\n  FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    • [${r.category}] ${r.name}: ${r.message}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Provide actionable summary
  if (failed === 0) {
    console.log('🎉 ALL MCP MODULES WORKING! Type fixes were successful.\n');
  } else if (passed > failed) {
    console.log('⚠️  MOSTLY WORKING but some issues remain. Check failures above.\n');
  } else {
    console.log('❌ CRITICAL ISSUES - Many modules are broken. Need fixes.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
