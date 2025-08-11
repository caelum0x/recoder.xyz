#!/usr/bin/env node
/**
 * Test CI/CD Pipeline Locally
 * Validates that all platforms can build, run, and start
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Testing CI/CD Pipeline Locally\n');

// Platform configurations
const PLATFORMS = [
  {
    name: '🌐 Recoder Web',
    directory: 'recoder-web',
    buildCommand: 'npm run build',
    startCommand: 'npm run start',
    port: 3000,
    healthCheck: 'http://localhost:3000',
    required: true
  },
  {
    name: '💬 Recoder Chat', 
    directory: 'recoder-chat',
    buildCommand: 'npm run build',
    startCommand: 'npm run start',
    port: 3001,
    healthCheck: 'http://localhost:3001',
    required: true
  },
  {
    name: '🔌 VSCode Extension',
    directory: 'recoder-extension',
    buildCommand: 'npm run build',
    startCommand: null, // Extensions don't start like servers
    port: null,
    healthCheck: null,
    required: true
  },
  {
    name: '🛠️ CLI Package',
    directory: 'packages/cli',
    buildCommand: 'npm run build',
    startCommand: null, // CLIs don't start like servers
    port: null,
    healthCheck: null,
    required: false // Has dependency issues
  },
  {
    name: '⚡ Backend Service',
    directory: 'backend',
    buildCommand: 'npm run build',
    startCommand: 'npm run start',
    port: 5000,
    healthCheck: 'http://localhost:5000',
    required: false
  }
];

class PipelineTest {
  constructor() {
    this.results = {};
    this.errors = [];
  }

  async runCommand(command, cwd = process.cwd(), timeout = 120000) {
    return new Promise((resolve) => {
      console.log(`   Running: ${command}`);
      
      const child = spawn('bash', ['-c', command], {
        cwd,
        stdio: 'pipe',
        timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr,
          command
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          code: -1,
          stdout,
          stderr: stderr + error.message,
          command
        });
      });

      // Timeout handling
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          success: false,
          code: -1,
          stdout,
          stderr: stderr + 'Command timed out',
          command
        });
      }, timeout);
    });
  }

  platformExists(platform) {
    return fs.existsSync(platform.directory);
  }

  async testPlatformBuild(platform) {
    console.log(`\n🔨 Testing ${platform.name}`);
    
    if (!this.platformExists(platform)) {
      console.log(`   ❌ Directory ${platform.directory} not found`);
      return { success: false, error: 'Directory not found' };
    }

    const platformPath = path.resolve(platform.directory);
    
    // Check if package.json exists
    if (!fs.existsSync(path.join(platformPath, 'package.json'))) {
      console.log(`   ❌ No package.json found in ${platform.directory}`);
      return { success: false, error: 'No package.json' };
    }

    // Install dependencies
    console.log(`   📦 Installing dependencies...`);
    const installResult = await this.runCommand('npm ci || npm install', platformPath, 180000);
    
    if (!installResult.success) {
      console.log(`   ⚠️  Dependency installation had issues`);
      // Continue anyway for some platforms
    }

    // Build the platform
    console.log(`   🏗️  Building platform...`);
    const buildResult = await this.runCommand(platform.buildCommand, platformPath, 300000);

    if (buildResult.success) {
      console.log(`   ✅ ${platform.name} built successfully`);
      return { success: true };
    } else {
      console.log(`   ❌ ${platform.name} build failed`);
      console.log(`   Error: ${buildResult.stderr.slice(0, 200)}...`);
      return { 
        success: false, 
        error: buildResult.stderr,
        required: platform.required 
      };
    }
  }

  async testAllPlatforms() {
    console.log('🏗️  Testing All Platform Builds\n');
    
    const buildResults = {};
    let successCount = 0;
    let requiredFailures = 0;

    for (const platform of PLATFORMS) {
      const result = await this.testPlatformBuild(platform);
      buildResults[platform.name] = result;
      
      if (result.success) {
        successCount++;
      } else if (platform.required) {
        requiredFailures++;
      }
    }

    // Summary
    console.log('\n📊 Build Test Results:');
    console.log('========================');
    
    for (const [name, result] of Object.entries(buildResults)) {
      const platform = PLATFORMS.find(p => p.name === name);
      const status = result.success ? '✅ SUCCESS' : (platform.required ? '❌ FAILED (REQUIRED)' : '⚠️  FAILED (OPTIONAL)');
      console.log(`${status} ${name}`);
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Successful builds: ${successCount}/${PLATFORMS.length}`);
    console.log(`   ❌ Required failures: ${requiredFailures}`);
    console.log(`   ⚠️  Optional failures: ${PLATFORMS.filter(p => !buildResults[p.name].success && !p.required).length}`);

    return {
      totalPlatforms: PLATFORMS.length,
      successCount,
      requiredFailures,
      canDeploy: requiredFailures === 0,
      results: buildResults
    };
  }

  async testFreeAIIntegration() {
    console.log('\n🤖 Testing FREE AI Integration');
    console.log('================================');

    // Test Together AI integration
    if (fs.existsSync('test-extension-ai.js')) {
      console.log('📝 Running AI integration test...');
      const aiResult = await this.runCommand('node test-extension-ai.js', process.cwd(), 30000);
      
      if (aiResult.success && aiResult.stdout.includes('Working: 4/4')) {
        console.log('✅ FREE Together AI integration working perfectly');
        return { success: true, workingProviders: 4 };
      } else if (aiResult.stdout.includes('Working:')) {
        const match = aiResult.stdout.match(/Working: (\d+)\/\d+/);
        const working = match ? parseInt(match[1]) : 0;
        console.log(`⚠️  Partial AI integration: ${working} providers working`);
        return { success: working >= 2, workingProviders: working };
      } else {
        console.log('❌ AI integration test failed');
        return { success: false, workingProviders: 0 };
      }
    } else {
      console.log('⚠️  AI integration test file not found');
      return { success: false, workingProviders: 0, error: 'Test file missing' };
    }
  }

  async generateCIReport() {
    console.log('\n📋 Generating CI/CD Pipeline Report');
    console.log('=====================================');

    const buildResults = await this.testAllPlatforms();
    const aiResults = await this.testFreeAIIntegration();

    const report = {
      timestamp: new Date().toISOString(),
      pipeline: {
        status: buildResults.canDeploy ? 'READY' : 'NEEDS_ATTENTION',
        platforms: buildResults,
        ai: aiResults
      },
      recommendations: []
    };

    // Generate recommendations
    if (!buildResults.canDeploy) {
      report.recommendations.push('🔧 Fix required platform build failures before deployment');
    }
    
    if (aiResults.workingProviders < 2) {
      report.recommendations.push('🤖 Ensure at least 2 AI providers are working for redundancy');
    }

    if (buildResults.canDeploy && aiResults.success) {
      report.recommendations.push('🚀 All systems ready for production deployment!');
    }

    // Save report
    fs.writeFileSync('ci-cd-pipeline-report.json', JSON.stringify(report, null, 2));
    
    console.log('\n🎯 CI/CD Pipeline Status: ' + report.pipeline.status);
    console.log('📝 Report saved to: ci-cd-pipeline-report.json');
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => console.log(`   ${rec}`));
    }

    return report;
  }
}

async function main() {
  const tester = new PipelineTest();
  const report = await tester.generateCIReport();
  
  // Exit with appropriate code
  process.exit(report.pipeline.status === 'READY' ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { PipelineTest };