/**
 * MCP Testing Script
 * Tests all MCP servers and tools
 */

import { MCPClient } from '../lib/mcp/client';
import { DEFAULT_SERVERS } from '../lib/mcp/servers';

async function testServer(config: any) {
  console.log(`\n🧪 Testing ${config.name}...`);
  
  const client = new MCPClient();
  
  try {
    // Test connection
    console.log('  ⏳ Connecting...');
    await client.connect(config);
    console.log('  ✅ Connected');
    
    // Test list tools
    console.log('  ⏳ Listing tools...');
    const tools = await client.listTools(config.id);
    console.log(`  ✅ Found ${tools.length} tools`);
    
    if (tools.length > 0) {
      console.log('  📋 Available tools:');
      tools.forEach((tool: any) => {
        console.log(`     - ${tool.name}: ${tool.description || 'No description'}`);
      });
    }
    
    // Disconnect
    await client.disconnect(config.id);
    console.log('  ✅ Disconnected');
    
    return { success: true, toolCount: tools.length };
  } catch (error: any) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 MCP Server Testing\n');
  console.log('=' .repeat(50));
  
  const results = [];
  
  for (const server of DEFAULT_SERVERS) {
    const result = await testServer(server);
    results.push({ server: server.name, ...result });
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results:\n');
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const info = r.success ? `${r.toolCount} tools` : r.error;
    console.log(`${status} ${r.server}: ${info}`);
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✨ ${successCount}/${results.length} servers passed`);
}

runTests().catch(console.error);
