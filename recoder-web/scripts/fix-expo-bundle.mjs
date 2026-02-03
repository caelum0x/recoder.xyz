#!/usr/bin/env node
/**
 * Fix script: Remove binary PNG entries from the recoder-expo starter bundle
 * and ensure the bundle is up-to-date with disk files.
 *
 * Run: node scripts/fix-expo-bundle.mjs
 *
 * After running, you can delete this script.
 * Or better yet, just run: node scripts/build-starters.mjs
 * to regenerate the entire bundle from scratch.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BUNDLE_PATH = join(process.cwd(), 'app/lib/.server/llm/starters-bundle.json');

console.log('Reading bundle...');
const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf-8'));

const expo = bundle['recoder-expo'];
if (!expo) {
  console.error('recoder-expo not found in bundle!');
  process.exit(1);
}

console.log('Current recoder-expo files:', Object.keys(expo.files));

// Remove binary PNG files
delete expo.files['assets/images/favicon.png'];
delete expo.files['assets/images/icon.png'];

console.log('After cleanup:', Object.keys(expo.files));
console.log('File count:', Object.keys(expo.files).length);

// Update metadata
expo.metadata.fileCount = Object.keys(expo.files).length;

// Write back
writeFileSync(BUNDLE_PATH, JSON.stringify(bundle, null, 2));
console.log('Done! Binary PNGs removed from recoder-expo bundle entry.');
