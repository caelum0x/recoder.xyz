#!/usr/bin/env node
/**
 * Build Script: Bundle Starters
 * Reads all starter templates and generates a bundled JSON file
 * This makes starters available at runtime without filesystem access
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const STARTERS_DIR = join(process.cwd(), 'starters');
const OUTPUT_FILE = join(process.cwd(), 'app/lib/.server/llm/starters-bundle.json');

console.log('🔨 Building starters bundle...');
console.log(`   Source: ${STARTERS_DIR}`);
console.log(`   Output: ${OUTPUT_FILE}`);

const bundle = {};

// Patterns to ignore
const IGNORE_PATTERNS = [
  /^\.git/,
  /^node_modules/,
  /^\.next/,
  /^dist/,
  /^build/,
  /^out/,
  /^\.vscode/,
  /^\.idea/,
  /\.DS_Store$/,
  /\.env$/,
  /\.env\./,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.log$/,
  /^coverage/,
  /^\.cache/,
];

const IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  '.vscode',
  '.idea',
  'coverage',
  '.cache',
];

function shouldIgnore(path, name) {
  if (IGNORE_DIRS.includes(name)) return true;
  return IGNORE_PATTERNS.some(pattern => pattern.test(path));
}

function walkDirectory(dir, basePath, files = {}) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(basePath, fullPath);

    if (shouldIgnore(relativePath, entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      walkDirectory(fullPath, basePath, files);
    } else {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        files[relativePath] = content;
        console.log(`      ✅ ${relativePath}`);
      } catch (error) {
        console.log(`      ⚠️  Skipped ${relativePath} (binary or unreadable)`);
      }
    }
  }

  return files;
}

try {
  const starterDirs = readdirSync(STARTERS_DIR).filter(name => {
    const fullPath = join(STARTERS_DIR, name);
    return statSync(fullPath).isDirectory() && !name.startsWith('.') && !name.startsWith('_');
  });

  console.log(`\n📦 Found ${starterDirs.length} starters\n`);

  for (const starterId of starterDirs) {
    console.log(`   Processing: ${starterId}`);
    const starterPath = join(STARTERS_DIR, starterId);
    
    // Load all files
    const files = walkDirectory(starterPath, starterPath);
    
    // Load package.json if exists
    let packageJson = null;
    try {
      const pkgPath = join(starterPath, 'package.json');
      packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch {
      // No package.json
    }

    // Detect framework
    let framework = 'unknown';
    if (packageJson?.dependencies) {
      const deps = Object.keys(packageJson.dependencies);
      if (deps.includes('next')) framework = 'nextjs';
      else if (deps.includes('react')) framework = 'react';
      else if (deps.includes('vue')) framework = 'vue';
      else if (deps.includes('@angular/core')) framework = 'angular';
      else if (deps.includes('svelte')) framework = 'svelte';
      else if (deps.includes('express')) framework = 'express';
      else if (deps.includes('expo')) framework = 'expo';
      else if (deps.includes('astro')) framework = 'astro';
    }

    bundle[starterId] = {
      id: starterId,
      files,
      packageJson,
      metadata: {
        name: starterId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        framework,
        fileCount: Object.keys(files).length,
      },
    };

    console.log(`      ✅ ${Object.keys(files).length} files\n`);
  }

  // Write bundle
  writeFileSync(OUTPUT_FILE, JSON.stringify(bundle, null, 2));

  // Generate stats
  const totalFiles = Object.values(bundle).reduce((sum, starter) => sum + starter.metadata.fileCount, 0);
  const bundleSize = (Buffer.byteLength(JSON.stringify(bundle)) / 1024 / 1024).toFixed(2);

  console.log('═'.repeat(60));
  console.log('✅ Bundle created successfully!');
  console.log('═'.repeat(60));
  console.log(`   Starters: ${Object.keys(bundle).length}`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Bundle size: ${bundleSize} MB`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('═'.repeat(60));

} catch (error) {
  console.error('❌ Failed to build starters bundle:', error);
  process.exit(1);
}
