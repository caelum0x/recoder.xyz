#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

console.log('🔧 Fixing cost calculation function calls and imports...');

// Find all TypeScript files
const files = glob.sync('**/*.ts', {
  ignore: ['node_modules/**', '**/*.d.ts', 'dist/**']
});

let totalFixed = 0;

files.forEach((filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Fix import statements
    if (content.includes('from "../../lib/shared/cost"') || 
        content.includes('from "../shared/cost"') ||
        content.includes('from "./shared/cost"')) {
      content = content.replace(
        /import\s*{\s*calculateApiCostOpenAI\s*}\s*from\s*["'][^"']*\/shared\/cost["']/g,
        'import { calculateApiCostOpenAI } from "../../lib/shared"'
      );
      content = content.replace(
        /import\s*{\s*calculateApiCostOpenAI\s*}\s*from\s*["'][^"']*shared\/cost["']/g,
        'import { calculateApiCostOpenAI } from "../shared"'
      );
      modified = true;
    }

    // Fix function calls with 5 parameters
    const oldPattern = /calculateApiCostOpenAI\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g;
    const matches = [...content.matchAll(oldPattern)];
    
    if (matches.length > 0) {
      matches.forEach((match) => {
        const [fullMatch, modelInfo, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens] = match;
        // Replace with new 2-parameter signature
        const replacement = `calculateApiCostOpenAI(${inputTokens} + ${outputTokens}, ${modelInfo}?.description || 'unknown')`;
        content = content.replace(fullMatch, replacement);
      });
      modified = true;
    }

    // Fix function calls with 4 parameters
    const oldPattern4 = /calculateApiCostOpenAI\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g;
    const matches4 = [...content.matchAll(oldPattern4)];
    
    if (matches4.length > 0) {
      matches4.forEach((match) => {
        const [fullMatch, modelInfo, inputTokens, outputTokens, cacheTokens] = match;
        // Replace with new 2-parameter signature
        const replacement = `calculateApiCostOpenAI(${inputTokens} + ${outputTokens}, ${modelInfo}?.description || 'unknown')`;
        content = content.replace(fullMatch, replacement);
      });
      modified = true;
    }

    // Fix function calls with 3 parameters (modelInfo, inputTokens, outputTokens)
    const oldPattern3 = /calculateApiCostOpenAI\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g;
    const matches3 = [...content.matchAll(oldPattern3)];
    
    if (matches3.length > 0) {
      matches3.forEach((match) => {
        const [fullMatch, modelInfo, inputTokens, outputTokens] = match;
        // Check if first parameter looks like modelInfo (contains dot notation)
        if (modelInfo.includes('.') || modelInfo.includes('info') || modelInfo.includes('model')) {
          const replacement = `calculateApiCostOpenAI(${inputTokens} + ${outputTokens}, ${modelInfo}?.id || ${modelInfo}?.description || 'unknown')`;
          content = content.replace(fullMatch, replacement);
          modified = true;
        }
      });
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
      totalFixed++;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
});

console.log(`🎉 Fixed ${totalFixed} files with cost calculation issues!`);