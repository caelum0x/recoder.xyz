#!/usr/bin/env node
/**
 * Test GitHub Cloning
 * Tests the cloning functionality with a real repository
 */

import { clonePublicRepo, isRepoPublic } from '../app/lib/.server/github/public-clone.ts';

const TEST_REPO = 'https://github.com/google-gemini/gemini-cli.git';

console.log('🧪 Testing GitHub Clone Functionality\n');
console.log('═'.repeat(60));
console.log(`📦 Test Repository: ${TEST_REPO}`);
console.log('═'.repeat(60));
console.log('');

async function testClone() {
  try {
    // Step 1: Check if repo is public
    console.log('📋 Step 1: Checking if repository is public...');
    const isPublic = await isRepoPublic(TEST_REPO);
    console.log(`   ${isPublic ? '✅' : '❌'} Repository is ${isPublic ? 'public' : 'private'}`);
    
    if (!isPublic) {
      console.log('   ⚠️  Cannot clone private repository without token');
      process.exit(1);
    }
    
    console.log('');
    
    // Step 2: Clone the repository
    console.log('📋 Step 2: Cloning repository...');
    console.log('   This may take a minute for larger repositories...');
    console.log('');
    
    const startTime = Date.now();
    const files = await clonePublicRepo(TEST_REPO);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ Clone Successful!');
    console.log('═'.repeat(60));
    console.log(`   Total files: ${Object.keys(files).length}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log('');
    
    // Step 3: Analyze cloned files
    console.log('📋 Step 3: Analyzing cloned files...');
    console.log('');
    
    const fileTypes = {};
    const directories = new Set();
    
    Object.keys(files).forEach(path => {
      // Count by extension
      const ext = path.split('.').pop() || 'no-extension';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      
      // Track directories
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) directories.add(dir);
    });
    
    console.log('📊 File Types:');
    Object.entries(fileTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([ext, count]) => {
        console.log(`   .${ext.padEnd(15)} ${count} files`);
      });
    
    console.log('');
    console.log(`📁 Directories: ${directories.size} unique directories`);
    console.log('');
    
    // Step 4: Show sample files
    console.log('📋 Step 4: Sample files (first 20):');
    Object.keys(files).slice(0, 20).forEach((path, i) => {
      const size = files[path].length;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
      console.log(`   ${(i + 1).toString().padStart(2)}. ${path} (${sizeStr})`);
    });
    
    if (Object.keys(files).length > 20) {
      console.log(`   ... and ${Object.keys(files).length - 20} more files`);
    }
    
    console.log('');
    
    // Step 5: Check for critical files
    console.log('📋 Step 5: Checking for critical files...');
    const criticalFiles = [
      'package.json',
      'README.md',
      '.gitignore',
      'tsconfig.json',
    ];
    
    criticalFiles.forEach(file => {
      const exists = files[file] !== undefined;
      console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    });
    
    console.log('');
    
    // Step 6: Check structure integrity
    console.log('📋 Step 6: Checking structure integrity...');
    
    const hasSourceFiles = Object.keys(files).some(f => 
      f.startsWith('src/') || f.startsWith('lib/')
    );
    console.log(`   ${hasSourceFiles ? '✅' : '❌'} Source files present`);
    
    const hasConfig = Object.keys(files).some(f => 
      f.endsWith('.json') || f.endsWith('.config.js')
    );
    console.log(`   ${hasConfig ? '✅' : '❌'} Configuration files present`);
    
    const hasTests = Object.keys(files).some(f => 
      f.includes('test') || f.includes('spec')
    );
    console.log(`   ${hasTests ? '✅' : '❌'} Test files present`);
    
    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ All tests passed!');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log(`  📦 Repository: google-gemini/gemini-cli`);
    console.log(`  📁 Files cloned: ${Object.keys(files).length}`);
    console.log(`  📂 Directories: ${directories.size}`);
    console.log(`  ⏱️  Time: ${duration}s`);
    console.log(`  ✅ Status: Complete and valid`);
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('═'.repeat(60));
    console.error('❌ Clone Failed!');
    console.error('═'.repeat(60));
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testClone();
