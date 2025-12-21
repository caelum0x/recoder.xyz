#!/usr/bin/env node
/**
 * Test Starter Injection System
 * Run this to verify the starter loader works correctly
 */

import { loadStarterFiles, generateStarterArtifact, generateCustomizationInstructions } from '../app/lib/.server/llm/starter-loader';
import { detectAndPrepareStarter } from '../app/lib/.server/llm/starter-injector';

console.log('🧪 Testing Starter Injection System\n');

async function testStarterLoader() {
  console.log('📋 Test 1: Load nextjs-blog-mdx starter');
  console.log('─'.repeat(50));
  
  try {
    const loaded = await loadStarterFiles('nextjs-blog-mdx');
    console.log(`✅ Loaded ${loaded.fileCount} files`);
    console.log(`✅ Package name: ${loaded.packageJson?.name || 'N/A'}`);
    console.log(`✅ Sample files:`, Object.keys(loaded.files).slice(0, 5).join(', '));
    console.log('');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    console.log('');
  }
}

async function testArtifactGeneration() {
  console.log('📋 Test 2: Generate artifact from starter');
  console.log('─'.repeat(50));
  
  try {
    const loaded = await loadStarterFiles('nextjs-blog-mdx');
    const artifact = generateStarterArtifact(loaded, 'test-blog', 'Test Blog Project');
    
    console.log(`✅ Generated artifact with ${artifact.split('<boltAction').length - 1} actions`);
    console.log(`✅ Artifact size: ${(artifact.length / 1024).toFixed(2)} KB`);
    console.log(`✅ Includes package.json: ${artifact.includes('package.json') ? 'Yes' : 'No'}`);
    console.log(`✅ Includes npm install: ${artifact.includes('npm install') ? 'Yes' : 'No'}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    console.log('');
  }
}

async function testDetection() {
  console.log('📋 Test 3: Detect starter from user message');
  console.log('─'.repeat(50));
  
  const testCases = [
    'Create a blog app',
    'Make an e-commerce store',
    'Build a React Native mobile app',
    'Setup an Express TypeScript API with authentication',
    'Create a Next.js app with shadcn',
  ];
  
  for (const testCase of testCases) {
    try {
      const result = await detectAndPrepareStarter(testCase);
      if (result.shouldInject) {
        console.log(`✅ "${testCase}"`);
        console.log(`   → Matched: ${result.starterId} (${(result.confidence * 100).toFixed(0)}% confidence)`);
        console.log(`   → Files ready: ${result.loadedFiles?.fileCount || 0}`);
      } else {
        console.log(`⚠️  "${testCase}" → No match found`);
      }
    } catch (error) {
      console.error(`❌ "${testCase}" → Error: ${error.message}`);
    }
  }
  console.log('');
}

async function testCustomizationPrompt() {
  console.log('📋 Test 4: Generate customization instructions');
  console.log('─'.repeat(50));
  
  try {
    const loaded = await loadStarterFiles('nextjs-blog-mdx');
    const prompt = generateCustomizationInstructions(loaded, 'Create a blog with dark mode');
    
    console.log(`✅ Generated ${prompt.length} character prompt`);
    console.log(`✅ Includes file count: ${prompt.includes(loaded.fileCount.toString()) ? 'Yes' : 'No'}`);
    console.log(`✅ Includes user request: ${prompt.includes('dark mode') ? 'Yes' : 'No'}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    console.log('');
  }
}

async function runAllTests() {
  try {
    await testStarterLoader();
    await testArtifactGeneration();
    await testDetection();
    await testCustomizationPrompt();
    
    console.log('═'.repeat(50));
    console.log('✅ All tests completed!');
    console.log('═'.repeat(50));
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

runAllTests();
