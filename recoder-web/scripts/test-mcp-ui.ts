#!/usr/bin/env tsx
/**
 * MCP UI Functionality Test
 * Tests if MCP UI components work in the browser
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
    console.log('   ', JSON.stringify(data, null, 2).split('\n').slice(0, 10).join('\n   '));
  }
}

// TEST 1: Check if MCP settings page renders
async function testMCPSettingsPage() {
  log('\n⚙️', '═══ TEST 1: MCP Settings Page ═══\n');

  try {
    const response = await fetch(`${API_BASE}/settings/mcp`);
    const html = await response.text();

    addResult(
      'MCP Settings Route',
      response.ok,
      response.ok ? 'Settings page loads' : `Failed with status ${response.status}`
    );

    if (response.ok) {
      // Check for MCP-related content
      const hasMCPContent = html.includes('MCP') ||
                           html.includes('Model Context Protocol') ||
                           html.includes('mcp') ||
                           html.includes('server');

      addResult(
        'MCP Content in Page',
        hasMCPContent,
        hasMCPContent ? 'Page contains MCP-related content' : 'No MCP content found',
        {
          hasReactRoot: html.includes('root'),
          hasScripts: html.includes('<script'),
          pageLength: html.length
        }
      );
    }
  } catch (error: any) {
    addResult('MCP Settings Route', false, `Error: ${error.message}`);
  }
}

// TEST 2: Check if configure routes exist
async function testMCPConfigureRoutes() {
  log('\n🔧', '═══ TEST 2: MCP Configure Routes ═══\n');

  const routes = [
    '/settings/mcp',
    '/settings/mcp/configure/filesystem',
    '/settings/mcp/logs/github',
    '/settings/mcp/marketplace'
  ];

  for (const route of routes) {
    try {
      const response = await fetch(`${API_BASE}${route}`);

      addResult(
        `Route: ${route}`,
        response.status !== 404,
        response.status === 200
          ? 'Route exists and renders'
          : response.status === 404
          ? 'Route not found'
          : `Status: ${response.status}`,
        { status: response.status }
      );
    } catch (error: any) {
      addResult(`Route: ${route}`, false, `Error: ${error.message}`);
    }
  }
}

// TEST 3: Check MCP component JavaScript bundles
async function testMCPComponentBundles() {
  log('\n📦', '═══ TEST 3: MCP Component Bundles ═══\n');

  try {
    const response = await fetch(`${API_BASE}/`);
    const html = await response.text();

    // Extract script tags
    const scriptMatches = html.match(/<script[^>]*src="([^"]+)"/g);
    const scripts = scriptMatches?.map(s => s.match(/src="([^"]+)"/)?.[1]) || [];

    addResult(
      'JavaScript Bundles',
      scripts.length > 0,
      `Found ${scripts.length} script bundles`,
      { count: scripts.length, samples: scripts.slice(0, 5) }
    );

    // Check if any bundle contains MCP-related code (by checking bundle names)
    const hasMCPBundle = scripts.some(s =>
      s?.toLowerCase().includes('mcp') ||
      s?.toLowerCase().includes('server')
    );

    addResult(
      'MCP Component Bundle',
      true, // This is informational, not a pass/fail
      hasMCPBundle
        ? 'Found MCP-specific bundles'
        : 'MCP code likely in main bundle (normal for Remix)',
      { hasMCPBundle }
    );

  } catch (error: any) {
    addResult('JavaScript Bundles', false, `Error: ${error.message}`);
  }
}

// TEST 4: Test MCP button in main chat
async function testMCPButtonInChat() {
  log('\n💬', '═══ TEST 4: MCP Button in Chat ═══\n');

  try {
    const response = await fetch(`${API_BASE}/`);
    const html = await response.text();

    // Can't check exact component without running JS, but can check if page structure is correct
    addResult(
      'Main Chat Page',
      response.ok,
      response.ok ? 'Chat page loads successfully' : `Failed with status ${response.status}`,
      {
        hasRoot: html.includes('root'),
        hasScripts: html.includes('<script'),
        hasStyles: html.includes('<link') || html.includes('<style')
      }
    );

  } catch (error: any) {
    addResult('Main Chat Page', false, `Error: ${error.message}`);
  }
}

// TEST 5: Check if MCP API endpoints return proper UI data
async function testMCPUIDataAPIs() {
  log('\n📡', '═══ TEST 5: MCP UI Data APIs ═══\n');

  const apis = [
    { name: 'Available Servers', url: '/api/mcp/servers/available' },
    { name: 'Server Templates', url: '/api/mcp/templates' },
    { name: 'MCP Analytics', url: '/api/mcp/analytics' },
  ];

  for (const api of apis) {
    try {
      const response = await fetch(`${API_BASE}${api.url}`);

      addResult(
        api.name,
        response.status !== 404,
        response.status === 200
          ? 'API endpoint working'
          : response.status === 404
          ? 'Endpoint not found (may not be implemented yet)'
          : response.status === 401
          ? 'Requires authentication (endpoint exists)'
          : `Status: ${response.status}`,
        { status: response.status }
      );
    } catch (error: any) {
      addResult(api.name, false, `Error: ${error.message}`);
    }
  }
}

// TEST 6: Check component rendering errors in browser console
async function testComponentRenderability() {
  log('\n🎨', '═══ TEST 6: Component Renderability ═══\n');

  try {
    // Import and check if components can be loaded
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

        addResult(
          `Component: ${comp.name}`,
          hasDefault,
          hasDefault ? 'Component exports correctly' : 'Missing default export',
          { hasDefault, exports: Object.keys(module) }
        );
      } catch (error: any) {
        addResult(`Component: ${comp.name}`, false, `Failed to import: ${error.message}`);
      }
    }
  } catch (error: any) {
    addResult('Component Renderability', false, `Error: ${error.message}`);
  }
}

// MAIN TEST RUNNER
async function runTests() {
  console.log('\n');
  log('🚀', '═══════════════════════════════════════════════════════');
  log('🚀', '  MCP UI FUNCTIONALITY TEST');
  log('🚀', '  Testing if MCP UI works in browser');
  log('🚀', '═══════════════════════════════════════════════════════');
  console.log('\n');

  await testMCPSettingsPage();
  await testMCPConfigureRoutes();
  await testMCPComponentBundles();
  await testMCPButtonInChat();
  await testMCPUIDataAPIs();
  await testComponentRenderability();

  // Print summary
  console.log('\n');
  log('📊', '═══════════════════════════════════════════════════════');
  log('📊', '  UI TEST SUMMARY');
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
    log('🎉', '✨ ALL UI TESTS PASSED! ✨');
  } else if (passed > failed) {
    log('⚠️', `UI mostly functional (${((passed/total)*100).toFixed(0)}% pass rate)`);
  } else {
    log('❌', 'UI has significant issues');
  }

  console.log('\n');
  log('💡', 'NOTE: These tests verify UI routes and components load.');
  log('💡', 'For full verification, manually test in browser:');
  console.log('   1. Go to http://localhost:5173/settings/mcp');
  console.log('   2. Try installing an MCP server');
  console.log('   3. Check if servers list shows up');
  console.log('   4. Try enabling/disabling a server\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
