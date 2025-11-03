/**
 * Test GitHub Cloning Functionality
 * Tests the public repo cloning to verify complete file structure
 */

import { clonePublicRepo, isRepoPublic } from './app/lib/.server/github/public-clone';

async function testGitHubClone() {
  console.log('🧪 Testing GitHub Clone Functionality\n');
  console.log('='.repeat(60));

  // Test repository
  const testRepo = 'https://github.com/google-gemini/gemini-cli.git';
  
  console.log(`\n📦 Test Repository: ${testRepo}`);
  console.log('-'.repeat(60));

  try {
    // Step 1: Check if repo is public
    console.log('\n1️⃣ Checking if repository is public...');
    const isPublic = await isRepoPublic(testRepo);
    console.log(`   Result: ${isPublic ? '✅ Public' : '❌ Private/Not Found'}`);

    if (!isPublic) {
      console.error('   ❌ Repository is not accessible. Cannot continue test.');
      process.exit(1);
    }

    // Step 2: Clone the repository
    console.log('\n2️⃣ Cloning repository...');
    const startTime = Date.now();
    const files = await clonePublicRepo(testRepo);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Clone completed in ${duration}s`);
    console.log('-'.repeat(60));

    // Step 3: Analyze the cloned files
    console.log('\n3️⃣ Analyzing cloned files...');
    const fileCount = Object.keys(files).length;
    console.log(`   📁 Total files cloned: ${fileCount}`);

    // Group files by extension
    const extensions: Record<string, number> = {};
    const directories = new Set<string>();
    
    Object.keys(files).forEach(path => {
      const ext = path.split('.').pop() || 'no-extension';
      extensions[ext] = (extensions[ext] || 0) + 1;
      
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) directories.add(dir);
    });

    console.log(`   📂 Unique directories: ${directories.size}`);
    console.log('\n   📊 Files by extension:');
    Object.entries(extensions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([ext, count]) => {
        console.log(`      .${ext}: ${count} files`);
      });

    // Step 4: Check for common files
    console.log('\n4️⃣ Checking for common project files...');
    const commonFiles = [
      'package.json',
      'README.md',
      'LICENSE',
      '.gitignore',
      'tsconfig.json',
    ];

    commonFiles.forEach(file => {
      const exists = files[file] !== undefined;
      console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    });

    // Step 5: Sample file contents
    console.log('\n5️⃣ Sample file contents...');
    const sampleFiles = Object.keys(files).slice(0, 3);
    sampleFiles.forEach(filePath => {
      const content = files[filePath];
      const preview = content.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   📄 ${filePath}`);
      console.log(`      Size: ${content.length} bytes`);
      console.log(`      Preview: ${preview}...`);
    });

    // Step 6: Validate completeness
    console.log('\n6️⃣ Validating completeness...');
    
    let validationPassed = true;
    const issues: string[] = [];

    // Check if we have source files
    const hasSourceFiles = Object.keys(files).some(f => 
      f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')
    );
    if (!hasSourceFiles) {
      issues.push('No source files found');
      validationPassed = false;
    }

    // Check if we have package.json
    if (!files['package.json']) {
      issues.push('package.json missing');
      validationPassed = false;
    }

    // Check if files are not empty
    const emptyFiles = Object.entries(files).filter(([_, content]) => !content || content.trim().length === 0);
    if (emptyFiles.length > 0) {
      issues.push(`${emptyFiles.length} empty files found`);
      validationPassed = false;
    }

    if (validationPassed) {
      console.log('   ✅ All validation checks passed!');
    } else {
      console.log('   ⚠️  Validation issues found:');
      issues.forEach(issue => console.log(`      - ${issue}`));
    }

    // Step 7: Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLONE TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Repository: ${testRepo}`);
    console.log(`Files Cloned: ${fileCount}`);
    console.log(`Directories: ${directories.size}`);
    console.log(`Duration: ${duration}s`);
    console.log(`Status: ${validationPassed ? '✅ SUCCESS' : '⚠️  ISSUES FOUND'}`);
    console.log('='.repeat(60));

    // Exit with appropriate code
    process.exit(validationPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testGitHubClone();
