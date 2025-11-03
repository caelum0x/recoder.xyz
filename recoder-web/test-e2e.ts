/**
 * End-to-End Test Suite for Bolt.new
 * Tests all critical functionality
 */

import { searchStarters, findBestStarter, buildSearchIndex } from './app/lib/.server/llm/starter-search';
import { detectAndPrepareStarter } from './app/lib/.server/llm/starter-injector';
import { loadStarterFiles } from './app/lib/.server/llm/starter-loader';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  console.log(`\n🧪 ${name}...`);
  
  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    console.log(`   ✅ PASSED (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`   ❌ FAILED: ${errorMsg}`);
  }
}

async function testSearchEngine() {
  console.log('   Building search index...');
  const index = buildSearchIndex();
  
  if (!index.templates || index.templates.length === 0) {
    throw new Error('Search index is empty');
  }
  
  console.log(`   Index has ${index.templates.length} templates`);
  
  // Test various search queries
  const testQueries = [
    { query: 'react blog app', expectedKeywords: ['react', 'blog'] },
    { query: 'nextjs with shadcn', expectedKeywords: ['nextjs', 'shadcn'] },
    { query: 'express typescript api', expectedKeywords: ['express', 'typescript'] },
    { query: 'vue app', expectedKeywords: ['vue'] },
  ];
  
  for (const { query, expectedKeywords } of testQueries) {
    console.log(`   Testing query: "${query}"`);
    const results = searchStarters(query, 3);
    
    if (results.length === 0) {
      throw new Error(`No results for query: "${query}"`);
    }
    
    console.log(`      Found ${results.length} matches`);
    results.slice(0, 2).forEach(r => {
      console.log(`      - ${r.template.id} (score: ${r.score.toFixed(3)})`);
    });
  }
}

async function testStarterDetection() {
  const testCases = [
    { input: 'create a blog app with react', shouldMatch: true },
    { input: 'build a nextjs dashboard with shadcn', shouldMatch: true },
    { input: 'make an express api', shouldMatch: true },
    { input: 'hello world', shouldMatch: false },
  ];
  
  for (const { input, shouldMatch } of testCases) {
    console.log(`   Testing: "${input}"`);
    const result = findBestStarter(input);
    
    if (shouldMatch && !result) {
      throw new Error(`Expected match for "${input}" but got none`);
    }
    
    if (!shouldMatch && result) {
      throw new Error(`Did not expect match for "${input}" but got ${result.template.id}`);
    }
    
    if (result) {
      console.log(`      ✓ Matched: ${result.template.id} (${result.score.toFixed(3)})`);
    } else {
      console.log(`      ✓ No match (as expected)`);
    }
  }
}

async function testStarterInjection() {
  const query = 'create a react blog app';
  console.log(`   Query: "${query}"`);
  
  const injection = await detectAndPrepareStarter(query);
  
  if (!injection.shouldInject) {
    throw new Error('Expected starter injection for blog app query');
  }
  
  console.log(`   ✓ Starter: ${injection.starterId}`);
  console.log(`   ✓ Confidence: ${injection.confidence?.toFixed(3)}`);
  console.log(`   ✓ Files: ${injection.loadedFiles?.fileCount}`);
  
  if (!injection.preGeneratedArtifact) {
    throw new Error('No pre-generated artifact');
  }
  
  console.log(`   ✓ Artifact size: ${injection.preGeneratedArtifact.length} bytes`);
  
  // Verify artifact structure
  if (!injection.preGeneratedArtifact.includes('<boltArtifact')) {
    throw new Error('Artifact missing boltArtifact tag');
  }
  
  if (!injection.preGeneratedArtifact.includes('<boltAction type="file"')) {
    throw new Error('Artifact missing file actions');
  }
}

async function testStarterLoading() {
  // Test loading a known starter
  const starterId = 'react-ts';
  console.log(`   Loading starter: ${starterId}`);
  
  const loaded = await loadStarterFiles(starterId);
  
  if (!loaded.files || Object.keys(loaded.files).length === 0) {
    throw new Error('No files loaded');
  }
  
  console.log(`   ✓ Loaded ${loaded.fileCount} files`);
  
  // Verify package.json
  if (!loaded.packageJson) {
    throw new Error('No package.json found');
  }
  
  console.log(`   ✓ Package: ${loaded.packageJson.name || 'unnamed'}`);
  
  // Verify file structure
  const hasSourceFiles = Object.keys(loaded.files).some(f => 
    f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
  );
  
  if (!hasSourceFiles) {
    throw new Error('No source files found');
  }
  
  console.log(`   ✓ Has source files`);
}

async function testMultipleStarterLoads() {
  const startersToTest = [
    'nextjs-shadcn',
    'bolt-vite-react-ts',
    'express-typescript',
    'vue',
  ];
  
  for (const starterId of startersToTest) {
    console.log(`   Testing ${starterId}...`);
    
    try {
      const loaded = await loadStarterFiles(starterId);
      console.log(`      ✓ ${loaded.fileCount} files`);
    } catch (error) {
      throw new Error(`Failed to load ${starterId}: ${error}`);
    }
  }
}

async function testSearchPerformance() {
  const queries = [
    'react app',
    'nextjs blog',
    'express api',
    'vue dashboard',
    'angular app',
  ];
  
  const iterations = 10;
  const timings: number[] = [];
  
  for (const query of queries) {
    const start = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      searchStarters(query, 5);
    }
    
    const duration = Date.now() - start;
    const avgTime = duration / iterations;
    timings.push(avgTime);
    
    console.log(`   ${query}: ${avgTime.toFixed(2)}ms avg (${iterations} iterations)`);
  }
  
  const avgOverall = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`   Overall average: ${avgOverall.toFixed(2)}ms`);
  
  if (avgOverall > 50) {
    throw new Error(`Search is too slow: ${avgOverall.toFixed(2)}ms avg (target: <50ms)`);
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         BOLT.NEW END-TO-END TEST SUITE                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  await runTest('Search Engine Functionality', testSearchEngine);
  await runTest('Starter Detection Logic', testStarterDetection);
  await runTest('Starter Injection System', testStarterInjection);
  await runTest('Starter File Loading', testStarterLoading);
  await runTest('Multiple Starter Loads', testMultipleStarterLoads);
  await runTest('Search Performance', testSearchPerformance);
  
  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`Total Time: ${totalTime}ms`);
  console.log('═'.repeat(60));
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}`);
      console.log(`     Error: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED!');
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
