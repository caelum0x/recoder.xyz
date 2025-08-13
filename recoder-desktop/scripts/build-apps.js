#!/usr/bin/env node

/**
 * Build script for Recoder Desktop unified app
 * Builds the extension, chat, and web apps for desktop distribution
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const desktopRoot = path.resolve(__dirname, '..');

console.log('🏗️  Building Recoder Desktop unified application...');
console.log('📁 Project root:', projectRoot);
console.log('📁 Desktop root:', desktopRoot);

// Configuration for each app
const apps = {
  'recoder-extension': {
    path: path.join(projectRoot, 'recoder-extension'),
    buildCommand: 'pnpm run build',
    outputDir: 'dist',
    targetDir: path.join(desktopRoot, 'app-bundles/extension')
  },
  'recoder-chat': {
    path: path.join(projectRoot, 'recoder-chat'),
    buildCommand: 'pnpm run build',
    outputDir: '.next',
    targetDir: path.join(desktopRoot, 'app-bundles/chat')
  },
  'recoder-web': {
    path: path.join(projectRoot, 'recoder-web'),
    buildCommand: 'pnpm run build',
    outputDir: '.next',
    targetDir: path.join(desktopRoot, 'app-bundles/web')
  }
};

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory does not exist: ${src}`);
    return;
  }

  ensureDirectory(dest);
  
  try {
    execSync(`cp -r "${src}/." "${dest}/"`, { stdio: 'inherit' });
    console.log(`✅ Copied ${src} to ${dest}`);
  } catch (error) {
    console.error(`❌ Failed to copy ${src}:`, error.message);
  }
}

function buildApp(appName, config) {
  console.log(`\n🔨 Building ${appName}...`);
  
  if (!fs.existsSync(config.path)) {
    console.warn(`⚠️  App directory does not exist: ${config.path}`);
    return false;
  }

  try {
    // Change to app directory and build
    process.chdir(config.path);
    console.log(`📂 Changed to: ${config.path}`);
    
    // Install dependencies if needed
    if (fs.existsSync('package.json') && !fs.existsSync('node_modules')) {
      console.log('📦 Installing dependencies...');
      execSync('pnpm install', { stdio: 'inherit' });
    }
    
    // Build the app
    console.log(`🔨 Running: ${config.buildCommand}`);
    execSync(config.buildCommand, { stdio: 'inherit' });
    
    // Copy build output to desktop app bundles
    const outputPath = path.join(config.path, config.outputDir);
    copyDirectory(outputPath, config.targetDir);
    
    console.log(`✅ Successfully built ${appName}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to build ${appName}:`, error.message);
    return false;
  }
}

async function buildAllApps() {
  console.log('🚀 Starting build process for all apps...');
  
  // Create app-bundles directory
  const bundlesDir = path.join(desktopRoot, 'app-bundles');
  ensureDirectory(bundlesDir);
  
  const originalCwd = process.cwd();
  let successCount = 0;
  
  try {
    for (const [appName, config] of Object.entries(apps)) {
      if (buildApp(appName, config)) {
        successCount++;
      }
      // Return to original directory
      process.chdir(originalCwd);
    }
    
    console.log(`\n🎉 Build complete! ${successCount}/${Object.keys(apps).length} apps built successfully.`);
    
    // Create app URLs configuration for desktop
    const appUrlsConfig = {
      extension: './app-bundles/extension/index.html',
      chat: './app-bundles/chat/standalone/index.html',
      web: './app-bundles/web/standalone/index.html',
      development: {
        extension: 'http://localhost:3000',
        chat: 'http://localhost:3003',
        web: 'http://localhost:3000'
      }
    };
    
    const configPath = path.join(desktopRoot, 'src/app-urls.json');
    fs.writeFileSync(configPath, JSON.stringify(appUrlsConfig, null, 2));
    console.log('📝 Created app URLs configuration');
    
    if (successCount === Object.keys(apps).length) {
      console.log('✅ All apps built successfully! Desktop app is ready to build.');
    } else {
      console.warn('⚠️  Some apps failed to build. Desktop app may not work correctly.');
    }
    
  } catch (error) {
    console.error('💥 Build process failed:', error.message);
    process.exit(1);
  } finally {
    process.chdir(originalCwd);
  }
}

// Add static file server capability for built apps
function createStaticServers() {
  const serverScript = `
const express = require('express');
const path = require('path');

// Serve built apps statically for desktop
const apps = {
  extension: { port: 3100, path: './app-bundles/extension' },
  chat: { port: 3101, path: './app-bundles/chat' },
  web: { port: 3102, path: './app-bundles/web' }
};

function startServers() {
  Object.entries(apps).forEach(([name, config]) => {
    if (require('fs').existsSync(config.path)) {
      const app = express();
      app.use(express.static(config.path));
      
      app.listen(config.port, () => {
        console.log(\`📡 \${name} server running on http://localhost:\${config.port}\`);
      });
    }
  });
}

if (require.main === module) {
  startServers();
}

module.exports = { startServers, apps };
  `;

  fs.writeFileSync(
    path.join(desktopRoot, 'src/static-servers.js'),
    serverScript.trim()
  );
  console.log('📡 Created static server configuration');
}

// Run the build process
if (require.main === module) {
  buildAllApps().then(() => {
    createStaticServers();
    console.log('\n🎯 Desktop build preparation complete!');
  });
}

module.exports = { buildAllApps, buildApp, apps };