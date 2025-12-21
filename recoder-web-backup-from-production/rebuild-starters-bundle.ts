/**
 * Rebuild Starters Bundle
 * Generates a complete bundle of all starters for fast loading
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, relative } from 'path';

const STARTERS_DIR = join(process.cwd(), 'starters');
const OUTPUT_FILE = join(process.cwd(), 'app/lib/.server/llm/starters-bundle.json');

interface StarterBundle {
  [starterId: string]: {
    files: Record<string, string>;
    packageJson: any;
    metadata: {
      fileCount: number;
      totalSize: number;
      lastBuilt: string;
    };
  };
}

async function shouldIgnore(path: string): Promise<boolean> {
  const ignorePatterns = [
    /^\.git/,
    /node_modules/,
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
  ];

  return ignorePatterns.some(pattern => pattern.test(path));
}

async function getAllFiles(dir: string, baseDir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(baseDir, fullPath);
    
    if (await shouldIgnore(relativePath)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      Object.assign(files, subFiles);
    } else {
      try {
        const content = await readFile(fullPath, 'utf-8');
        files[relativePath] = content;
      } catch (error) {
        // Skip binary files
        console.log(`  ⚠️  Skipped ${relativePath} (binary or unreadable)`);
      }
    }
  }
  
  return files;
}

async function buildStartersBundle() {
  console.log('🔨 Building Starters Bundle...\n');
  console.log('='.repeat(60));
  
  const bundle: StarterBundle = {};
  const startTime = Date.now();
  
  // Get all starter directories
  const entries = await readdir(STARTERS_DIR, { withFileTypes: true });
  const starterDirs = entries.filter(e => 
    e.isDirectory() && 
    !e.name.startsWith('.') && 
    !e.name.startsWith('_')
  );
  
  console.log(`\n📦 Found ${starterDirs.length} starters to bundle:\n`);
  
  let totalFiles = 0;
  let totalSize = 0;
  
  for (const dir of starterDirs) {
    const starterId = dir.name;
    const starterPath = join(STARTERS_DIR, starterId);
    
    console.log(`📁 Processing ${starterId}...`);
    
    try {
      // Load all files
      const files = await getAllFiles(starterPath, starterPath);
      const fileCount = Object.keys(files).length;
      
      // Calculate total size
      const size = Object.values(files).reduce((sum, content) => sum + content.length, 0);
      
      // Load package.json if exists
      let packageJson = null;
      if (files['package.json']) {
        try {
          packageJson = JSON.parse(files['package.json']);
        } catch (e) {
          console.log(`   ⚠️  Invalid package.json in ${starterId}`);
        }
      }
      
      bundle[starterId] = {
        files,
        packageJson,
        metadata: {
          fileCount,
          totalSize: size,
          lastBuilt: new Date().toISOString(),
        },
      };
      
      totalFiles += fileCount;
      totalSize += size;
      
      console.log(`   ✅ ${fileCount} files (${(size / 1024).toFixed(2)} KB)`);
    } catch (error) {
      console.error(`   ❌ Error processing ${starterId}:`, error);
    }
  }
  
  // Write bundle to file
  console.log(`\n💾 Writing bundle to ${OUTPUT_FILE}...`);
  const bundleJson = JSON.stringify(bundle, null, 2);
  await writeFile(OUTPUT_FILE, bundleJson);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const bundleSize = (bundleJson.length / 1024 / 1024).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Bundle Build Complete!');
  console.log('='.repeat(60));
  console.log(`Starters: ${starterDirs.length}`);
  console.log(`Total Files: ${totalFiles}`);
  console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Bundle Size: ${bundleSize} MB`);
  console.log(`Build Time: ${duration}s`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('='.repeat(60));
}

buildStartersBundle().catch(console.error);
