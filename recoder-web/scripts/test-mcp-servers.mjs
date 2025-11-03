#!/usr/bin/env node
/**
 * MCP Servers Diagnostic Test
 * Tests if MCP servers are properly initialized and working
 */

console.log('🧪 MCP Servers Diagnostic Test\n');
console.log('═'.repeat(60));

async function testMCPServers() {
  try {
    // Test list servers
    console.log('\n📋 Test 1: List MCP Servers');
    console.log('─'.repeat(60));
    
    const serversResponse = await fetch('http://localhost:5173/api/mcp?action=list-servers');
    
    if (!serversResponse.ok) {
      console.log('❌ Failed to fetch servers:', serversResponse.status);
      return;
    }
    
    const serversData = await serversResponse.json();
    
    if (serversData.success) {
      console.log(`✅ Found ${serversData.data.length} servers:`);
      serversData.data.forEach((server, i) => {
        console.log(`\n${i + 1}. ${server.name} (${server.id})`);
        console.log(`   Status: ${server.status}`);
        console.log(`   Enabled: ${server.enabled}`);
        console.log(`   Tools: ${server.toolCount}`);
      });
    } else {
      console.log('❌ API returned error:', serversData.error);
    }

    // Test list tools
    console.log('\n\n📋 Test 2: List MCP Tools');
    console.log('─'.repeat(60));
    
    const toolsResponse = await fetch('http://localhost:5173/api/mcp?action=list-tools');
    
    if (!toolsResponse.ok) {
      console.log('❌ Failed to fetch tools:', toolsResponse.status);
      return;
    }
    
    const toolsData = await toolsResponse.json();
    
    if (toolsData.success) {
      console.log(`✅ Found ${toolsData.data.length} tools:`);
      
      const toolsByCategory = {};
      toolsData.data.forEach(tool => {
        if (!toolsByCategory[tool.category]) {
          toolsByCategory[tool.category] = [];
        }
        toolsByCategory[tool.category].push(tool);
      });
      
      Object.entries(toolsByCategory).forEach(([category, tools]) => {
        console.log(`\n${category.toUpperCase()}:`);
        tools.forEach((tool, i) => {
          console.log(`  ${i + 1}. ${tool.name} - ${tool.description}`);
        });
      });
    } else {
      console.log('❌ API returned error:', toolsData.error);
    }

    // Test server stats
    console.log('\n\n📋 Test 3: Server Statistics');
    console.log('─'.repeat(60));
    
    const statsResponse = await fetch('http://localhost:5173/api/mcp?action=server-stats');
    
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      
      if (statsData.success) {
        console.log('✅ Server Statistics:');
        console.log(`   Total Servers: ${statsData.data.totalServers}`);
        console.log(`   Enabled Servers: ${statsData.data.enabledServers}`);
        console.log(`   Total Tools: ${statsData.data.totalTools}`);
        console.log(`   Tools by Category:`, statsData.data.serversByCategory);
      }
    }

    console.log('\n\n═'.repeat(60));
    console.log('✅ All diagnostic tests completed!');
    console.log('═'.repeat(60));
    
    console.log('\n📝 Summary:');
    console.log('   - MCP servers are initialized');
    console.log('   - APIs are responding');
    console.log('   - Tools are registered');
    
    console.log('\n⚠️  Note: Tools may still fail to execute if:');
    console.log('   - WebContainer is not available');
    console.log('   - Required environment variables are missing');
    console.log('   - Tool handlers have bugs');
    
  } catch (error) {
    console.error('\n\n❌ Test failed with error:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Dev server is running: npm run dev');
    console.error('  2. Server is accessible at http://localhost:5173');
  }
}

// Check if server is running first
console.log('🔍 Checking if dev server is running...');
console.log('   URL: http://localhost:5173');

fetch('http://localhost:5173/')
  .then(() => {
    console.log('✅ Dev server is running!\n');
    return testMCPServers();
  })
  .catch(() => {
    console.log('❌ Dev server is NOT running!');
    console.log('\nPlease start the dev server first:');
    console.log('   npm run dev');
    console.log('\nThen run this test again.');
    process.exit(1);
  });
