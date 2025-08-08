#!/usr/bin/env node

/**
 * Script to fix @recoder/shared imports in Web Platform
 * Replaces @recoder/shared imports with local shared package imports
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TypeScript files in lib and api directories
const files = [
  ...glob.sync('lib/**/*.ts', { cwd: __dirname }),
  ...glob.sync('api/**/*.ts', { cwd: __dirname }),
  ...glob.sync('app/**/*.ts', { cwd: __dirname }),
  ...glob.sync('app/**/*.tsx', { cwd: __dirname }),
  ...glob.sync('components/**/*.ts', { cwd: __dirname }),
  ...glob.sync('components/**/*.tsx', { cwd: __dirname })
];

console.log(`Found ${files.length} TypeScript files to process...`);

files.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Replace @recoder/shared imports with relative imports to local shared package
  const fromFilePath = path.relative(path.dirname(fullPath), path.join(__dirname, 'lib/shared'));
  const relativeImport = fromFilePath.startsWith('../') ? fromFilePath : './' + fromFilePath;

  // Pattern to match @recoder/shared imports (including subpaths like /api, /cost)
  const sharedPath = path.relative(path.dirname(fullPath), path.join(__dirname, 'lib/shared'));
  const relativeSharedImport = sharedPath.startsWith('../') ? sharedPath : './' + sharedPath;

  const patterns = [
    // Handle specific subpath imports
    {
      regex: /from ["']@recoder\/shared\/cost["']/g,
      replacement: `from "${relativeSharedImport}/cost"`
    },
    {
      regex: /from ["']@recoder\/shared\/api["']/g,
      replacement: `from "${relativeSharedImport}"`
    },
    {
      regex: /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']@recoder\/shared\/cost["']/g,
      replacement: `import { $1 } from "${relativeSharedImport}/cost"`
    },
    {
      regex: /import\s*type\s*\{\s*([^}]+)\s*\}\s*from\s*["']@recoder\/shared\/api["']/g,
      replacement: `import type { $1 } from "${relativeSharedImport}"`
    },
    {
      regex: /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']@recoder\/shared\/api["']/g,
      replacement: `import { $1 } from "${relativeSharedImport}"`
    },
    // Handle general @recoder/shared imports
    {
      regex: /from ["']@recoder\/shared["']/g,
      replacement: `from "${relativeImport}"`
    },
    {
      regex: /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']@recoder\/shared["']/g,
      replacement: `import { $1 } from "${relativeImport}"`
    },
    {
      regex: /require\s*\(\s*["']@recoder\/shared["']\s*\)/g,
      replacement: `require("${relativeImport}")`
    },
    // Handle @roo-code/shared patterns too
    {
      regex: /from ["']@roo-code\/shared["']/g,
      replacement: `from "${relativeImport}"`
    },
    {
      regex: /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']@roo-code\/shared["']/g,
      replacement: `import { $1 } from "${relativeImport}"`
    },
    // Handle relative utils imports - api directory
    {
      regex: /from ["']\.\.\/\.\.\/utils\/logging["']/g,
      replacement: `from "../../lib/utils/logging"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/utils\/logging["']/g,
      replacement: `from "../../../lib/utils/logging"`
    },
    // Handle relative utils imports - lib directory (needs different path)
    {
      regex: /from ["']\.\.\/\.\.\/lib\/utils\/logging["']/g,
      replacement: `from "../../utils/logging"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/lib\/utils\/logging["']/g,
      replacement: `from "../../../utils/logging"`
    },
    // Handle all shared/* subpath imports
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/shared\/api["']/g,
      replacement: `from "../../../lib/shared"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/shared\/api["']/g,
      replacement: `from "../../lib/shared"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/shared\/cost["']/g,
      replacement: `from "../../../lib/shared/cost"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/shared\/cost["']/g,
      replacement: `from "../../lib/shared/cost"`
    },
    // Handle utils/* imports
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/utils\/safeWriteJson["']/g,
      replacement: `from "../../../lib/utils/safeWriteJson"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/utils\/safeWriteJson["']/g,
      replacement: `from "../../lib/utils/safeWriteJson"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/utils\/storage["']/g,
      replacement: `from "../../../lib/utils/storage"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/utils\/storage["']/g,
      replacement: `from "../../lib/utils/storage"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/utils\/fs["']/g,
      replacement: `from "../../../lib/utils/fs"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/utils\/fs["']/g,
      replacement: `from "../../lib/utils/fs"`
    },
    // Handle core/* imports
    {
      regex: /from ["']\.\.\/\.\.\/\.\.\/core\/config\/ContextProxy["']/g,
      replacement: `from "../../../lib/core/config/ContextProxy"`
    },
    {
      regex: /from ["']\.\.\/\.\.\/core\/config\/ContextProxy["']/g,
      replacement: `from "../../lib/core/config/ContextProxy"`
    }
  ];

  patterns.forEach(({ regex, replacement }) => {
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Fixed imports in: ${filePath}`);
  }
});

console.log('✅ Import fix completed!');