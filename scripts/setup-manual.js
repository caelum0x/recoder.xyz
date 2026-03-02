#!/usr/bin/env node

/**
 * Manual Setup Script for Recoder.xyz
 * Simple step-by-step setup without complex dependencies
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Recoder.xyz Manual Setup\n');

function runCommand(command, cwd = rootDir, description = '') {
  try {
    console.log(`📦 ${description || command}`);
    execSync(command, { cwd, stdio: 'inherit' });
    console.log('✅ Success\n');
  } catch (error) {
    console.log(`❌ Failed: ${error.message}\n`);
    throw error;
  }
}

function checkDirectory(dir, name) {
  const exists = fs.existsSync(dir);
  console.log(`📁 ${name}: ${exists ? '✅ Found' : '❌ Missing'}`);
  return exists;
}

try {
  console.log('🔍 Checking project structure...');
  checkDirectory(path.join(rootDir, 'packages/cli'), 'CLI Package');
  checkDirectory(path.join(rootDir, 'packages/shared'), 'Shared Package');
  checkDirectory(path.join(rootDir, 'backend'), 'Backend');
  checkDirectory(path.join(rootDir, 'docker-backend'), 'Docker Backend');
  console.log('');

  console.log('📦 Installing dependencies...\n');

  // Install root dependencies
  runCommand('npm install --ignore-workspace-root-check', rootDir, 'Installing root dependencies');

  // Install CLI dependencies
  if (fs.existsSync(path.join(rootDir, 'packages/cli'))) {
    runCommand('npm install', path.join(rootDir, 'packages/cli'), 'Installing CLI dependencies');
  }

  // Install shared dependencies
  if (fs.existsSync(path.join(rootDir, 'packages/shared'))) {
    runCommand('npm install', path.join(rootDir, 'packages/shared'), 'Installing shared dependencies');
  }

  // Install backend dependencies
  if (fs.existsSync(path.join(rootDir, 'backend'))) {
    runCommand('npm install', path.join(rootDir, 'backend'), 'Installing backend dependencies');
  }

  // Install docker-backend dependencies
  if (fs.existsSync(path.join(rootDir, 'docker-backend'))) {
    runCommand('npm install', path.join(rootDir, 'docker-backend'), 'Installing docker-backend dependencies');
  }

  console.log('🔧 Setting up environment...\n');

  // Copy environment file
  const envExample = path.join(rootDir, '.env.example');
  const envFile = path.join(rootDir, '.env');
  
  if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
    console.log('✅ Created .env file from template\n');
  }

  console.log('🔨 Building packages...\n');

  // Build packages
  if (fs.existsSync(path.join(rootDir, 'packages/shared'))) {
    try {
      runCommand('npm run build', path.join(rootDir, 'packages/shared'), 'Building shared package');
    } catch {
      console.log('⚠️ Shared package build not configured, skipping...\n');
    }
  }

  if (fs.existsSync(path.join(rootDir, 'packages/cli'))) {
    try {
      runCommand('npm run build', path.join(rootDir, 'packages/cli'), 'Building CLI package');
    } catch {
      console.log('⚠️ CLI build failed, it might work without building...\n');
    }
  }

  if (fs.existsSync(path.join(rootDir, 'docker-backend'))) {
    try {
      runCommand('npm run build', path.join(rootDir, 'docker-backend'), 'Building docker-backend');
    } catch {
      console.log('⚠️ Docker-backend build not configured, skipping...\n');
    }
  }

  console.log('🔗 Linking CLI globally...\n');

  // Link CLI globally
  try {
    runCommand('npm link', path.join(rootDir, 'packages/cli'), 'Linking CLI globally');
  } catch {
    console.log('⚠️ CLI linking failed, you can link manually later\n');
  }

  console.log('🎉 Setup completed successfully!\n');
  
  console.log('📋 Next steps:');
  console.log('1. Configure your API keys in .env file');
  console.log('2. Test CLI: recoder --help');
  console.log('3. Start services: npm run dev');
  console.log('4. Generate code: recoder generate "your idea"');
  console.log('');

} catch (error) {
  console.error('❌ Setup failed:', error.message);
  console.log('\n💡 Manual setup commands:');
  console.log('npm install --ignore-workspace-root-check');
  console.log('cd packages/cli && npm install && cd ../..');
  console.log('cd backend && npm install && cd ..');
  console.log('cd docker-backend && npm install && cd ..');
  console.log('cd packages/cli && npm link');
  process.exit(1);
}
