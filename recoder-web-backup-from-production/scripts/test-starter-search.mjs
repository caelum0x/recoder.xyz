#!/usr/bin/env node
/**
 * Test Starter Search Engine
 * Comprehensive test of the search and matching system
 */

import { searchStarters, findBestStarter, buildSearchIndex, clearSearchIndex } from '../app/lib/.server/llm/starter-search';

console.log('🧪 Testing Starter Search Engine\n');
console.log('═'.repeat(60));

async function testSearchEngine() {
  // Build index first
  console.log('\n📋 Building search index...');
  console.log('─'.repeat(60));
  const index = buildSearchIndex();
  console.log(`✅ Index built with ${index.templates.length} templates\n`);

  // Test cases with expected results
  const testCases = [
    {
      query: 'Create a blog',
      expectedKeywords: ['blog', 'nextjs', 'mdx'],
      minScore: 0.3,
    },
    {
      query: 'Build an e-commerce store with stripe',
      expectedKeywords: ['ecommerce', 'stripe', 'nextjs'],
      minScore: 0.3,
    },
    {
      query: 'React Native mobile app',
      expectedKeywords: ['expo', 'mobile', 'react'],
      minScore: 0.3,
    },
    {
      query: 'Express API with authentication',
      expectedKeywords: ['express', 'auth', 'typescript'],
      minScore: 0.3,
    },
    {
      query: 'Next.js app with shadcn UI',
      expectedKeywords: ['nextjs', 'shadcn'],
      minScore: 0.3,
    },
    {
      query: 'Angular application',
      expectedKeywords: ['angular'],
      minScore: 0.4,
    },
    {
      query: 'Vue.js project',
      expectedKeywords: ['vue'],
      minScore: 0.3,
    },
    {
      query: 'SvelteKit website',
      expectedKeywords: ['svelte'],
      minScore: 0.3,
    },
    {
      query: 'MongoDB backend API',
      expectedKeywords: ['mongodb', 'express'],
      minScore: 0.2,
    },
    {
      query: 'Static HTML site with Bootstrap',
      expectedKeywords: ['bootstrap', 'static'],
      minScore: 0.2,
    },
    {
      query: 'GSAP animation with React',
      expectedKeywords: ['gsap', 'react'],
      minScore: 0.2,
    },
    {
      query: '3D graphics with Three.js',
      expectedKeywords: ['tres', 'three'],
      minScore: 0.2,
    },
    {
      query: 'Hono edge server',
      expectedKeywords: ['hono'],
      minScore: 0.3,
    },
    {
      query: 'Astro static site',
      expectedKeywords: ['astro'],
      minScore: 0.3,
    },
    {
      query: 'Qwik resumable framework',
      expectedKeywords: ['qwik'],
      minScore: 0.3,
    },
  ];

  console.log('📋 Running test cases...');
  console.log('─'.repeat(60));
  console.log('');

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`🔍 Query: "${testCase.query}"`);
    
    const result = findBestStarter(testCase.query);
    
    if (!result) {
      console.log('   ❌ No match found\n');
      failedTests++;
      continue;
    }

    const { template, score, reasoning } = result;
    const passed = score >= testCase.minScore;
    
    // Check if any expected keywords are in the result
    const templateText = `${template.id} ${template.name} ${template.keywords.join(' ')}`.toLowerCase();
    const hasExpectedKeyword = testCase.expectedKeywords.some(kw => 
      templateText.includes(kw.toLowerCase())
    );

    if (passed && hasExpectedKeyword) {
      console.log(`   ✅ Match: ${template.id}`);
      console.log(`   📊 Score: ${score.toFixed(3)}`);
      console.log(`   💡 ${reasoning}`);
      console.log(`   🎯 Keywords: ${template.keywords.slice(0, 5).join(', ')}`);
      passedTests++;
    } else if (!hasExpectedKeyword) {
      console.log(`   ⚠️  Unexpected match: ${template.id}`);
      console.log(`   📊 Score: ${score.toFixed(3)}`);
      console.log(`   ⚠️  Expected one of: ${testCase.expectedKeywords.join(', ')}`);
      failedTests++;
    } else {
      console.log(`   ❌ Score too low: ${score.toFixed(3)} < ${testCase.minScore}`);
      failedTests++;
    }
    
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log(`📊 Test Results:`);
  console.log(`   ✅ Passed: ${passedTests}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failedTests}/${testCases.length}`);
  console.log(`   📈 Success Rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);
  console.log('═'.repeat(60));
}

async function testMultipleResults() {
  console.log('\n\n📋 Testing multiple results...');
  console.log('─'.repeat(60));

  const query = 'react app';
  console.log(`🔍 Query: "${query}"\n`);

  const results = searchStarters(query, 5, 0.1);

  console.log(`Found ${results.length} matches:\n`);

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.template.id}`);
    console.log(`   Score: ${result.score.toFixed(3)}`);
    console.log(`   Framework: ${result.template.framework}`);
    console.log(`   ${result.reasoning}`);
    console.log('');
  });
}

async function testFuzzyMatching() {
  console.log('\n📋 Testing fuzzy matching...');
  console.log('─'.repeat(60));

  const fuzzyQueries = [
    'nextjs',        // Should match Next.js starters
    'expresss',      // Typo - should still match Express
    'reactnative',   // No space - should match React Native
    'mongoDB',       // Different case - should match MongoDB
    'typescrpt',     // Typo - should match TypeScript projects
  ];

  console.log('');

  for (const query of fuzzyQueries) {
    console.log(`🔍 Query: "${query}"`);
    const result = findBestStarter(query);
    
    if (result) {
      console.log(`   ✅ ${result.template.id} (score: ${result.score.toFixed(3)})`);
    } else {
      console.log(`   ❌ No match`);
    }
    console.log('');
  }
}

async function testSearchPerformance() {
  console.log('\n📋 Testing search performance...');
  console.log('─'.repeat(60));

  const iterations = 100;
  const queries = [
    'blog',
    'e-commerce',
    'mobile app',
    'express api',
    'react app',
  ];

  console.log(`Running ${iterations * queries.length} searches...\n`);

  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    for (const query of queries) {
      findBestStarter(query);
    }
  }

  const endTime = Date.now();
  const totalTime = endTime - startTime;
  const avgTime = totalTime / (iterations * queries.length);

  console.log(`✅ Performance Results:`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Avg per search: ${avgTime.toFixed(2)}ms`);
  console.log(`   Searches/sec: ${(1000 / avgTime).toFixed(0)}`);
  console.log('');
}

async function runAllTests() {
  try {
    await testSearchEngine();
    await testMultipleResults();
    await testFuzzyMatching();
    await testSearchPerformance();
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ All search engine tests completed!');
    console.log('═'.repeat(60));
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

runAllTests();
