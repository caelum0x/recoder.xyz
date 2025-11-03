/**
 * TEST 4: PROJECT CREATION & FILE STORAGE
 *
 * Tests:
 * - Save complete file system snapshots
 * - Store multiple file types (tsx, json, css, html, md)
 * - Handle nested directory structures
 * - Verify file integrity
 * - Test large files
 * - Test many files (100+)
 * - Load and restore workspace
 */

import { ChatHistoryDB } from '../../app/lib/.server/db/chat-history-db';
import { readFileSync } from 'fs';
import { join } from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function success(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function error(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function info(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function section(title: string) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

function loadEnv(): string {
  const envPath = join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const databaseUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];
  if (!databaseUrl) throw new Error('DATABASE_URL not found');
  return databaseUrl;
}

async function testProjectFileStorage() {
  section('TEST 4: PROJECT CREATION & FILE STORAGE');

  let testsPassed = 0;
  let testsFailed = 0;
  const anonymousId = `test-anon-${Date.now()}`;
  const sessionIds: string[] = [];

  const db = new ChatHistoryDB(loadEnv());

  try {
    // Test 4.1: Save basic project with multiple file types
    console.log('\n📋 Test 4.1: Saving project with multiple file types...');
    const urlId1 = `test-project-${Date.now()}`;
    const basicFiles = {
      'package.json': JSON.stringify({
        name: 'test-react-app',
        version: '1.0.0',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
      }, null, 2),
      'src/App.tsx': `import React from 'react';\n\nexport default function App() {\n  return <div>Hello World</div>;\n}`,
      'src/index.css': `body {\n  margin: 0;\n  font-family: sans-serif;\n}`,
      'index.html': `<!DOCTYPE html>\n<html>\n  <head><title>Test App</title></head>\n  <body><div id="root"></div></body>\n</html>`,
      'README.md': `# Test React App\n\nA simple test application.`,
    };

    await db.saveChat({
      anonymousId,
      urlId: urlId1,
      title: 'Basic React Project',
      description: 'Testing file storage',
      messages: [],
      fileSnapshot: basicFiles,
    });

    const session1 = await db.getSessionByUrlId(urlId1);
    if (!session1) throw new Error('Session not created');
    sessionIds.push(session1.id);

    const fileCount = Object.keys(basicFiles).length;
    const totalSize = Object.values(basicFiles).reduce((sum, content) => sum + content.length, 0);

    info(`Files saved: ${fileCount}`);
    info(`Total size: ${(totalSize / 1024).toFixed(2)} KB`);
    info(`File types: .json, .tsx, .css, .html, .md`);
    success('Basic project saved');
    testsPassed++;

    // Test 4.2: Load and verify file integrity
    console.log('\n📋 Test 4.2: Loading project and verifying files...');
    const loaded = await db.loadChat(urlId1);

    if (!loaded) throw new Error('Project not found');
    if (!loaded.fileSnapshot) throw new Error('File snapshot not found');

    const loadedFiles = Object.keys(loaded.fileSnapshot);
    const originalFiles = Object.keys(basicFiles);

    if (loadedFiles.length !== originalFiles.length) {
      throw new Error(`File count mismatch: ${loadedFiles.length} vs ${originalFiles.length}`);
    }

    // Verify each file byte-for-byte
    let mismatchCount = 0;
    for (const filename of originalFiles) {
      if (loaded.fileSnapshot[filename] !== basicFiles[filename]) {
        error(`File content mismatch: ${filename}`);
        mismatchCount++;
      }
    }

    if (mismatchCount > 0) {
      throw new Error(`${mismatchCount} file(s) had content mismatches`);
    }

    info(`All ${loadedFiles.length} files verified`);
    info('File integrity: 100%');
    success('File integrity verified');
    testsPassed++;

    // Test 4.3: Nested directory structure
    console.log('\n📋 Test 4.3: Testing nested directory structure...');
    const urlId2 = `test-nested-${Date.now()}`;
    const nestedFiles = {
      'src/App.tsx': 'export default function App() {}',
      'src/components/Header.tsx': 'export function Header() {}',
      'src/components/Footer.tsx': 'export function Footer() {}',
      'src/components/ui/Button.tsx': 'export function Button() {}',
      'src/components/ui/Input.tsx': 'export function Input() {}',
      'src/utils/helpers.ts': 'export function helper() {}',
      'src/utils/constants.ts': 'export const CONSTANTS = {}',
      'src/hooks/useAuth.ts': 'export function useAuth() {}',
      'public/assets/logo.svg': '<svg>...</svg>',
      'public/assets/icon.png': '[binary data]',
    };

    await db.saveChat({
      anonymousId,
      urlId: urlId2,
      messages: [],
      fileSnapshot: nestedFiles,
    });

    const session2 = await db.getSessionByUrlId(urlId2);
    if (!session2) throw new Error('Session not created');
    sessionIds.push(session2.id);

    const loadedNested = await db.loadChat(urlId2);
    if (!loadedNested?.fileSnapshot) throw new Error('Nested files not saved');

    const nestedPaths = Object.keys(loadedNested.fileSnapshot);
    const maxDepth = Math.max(...nestedPaths.map(p => p.split('/').length));

    info(`Files with nested paths: ${nestedPaths.length}`);
    info(`Maximum directory depth: ${maxDepth}`);
    info(`Unique directories: ${new Set(nestedPaths.map(p => p.split('/').slice(0, -1).join('/'))).size}`);
    success('Nested directories handled');
    testsPassed++;

    // Test 4.4: Large file storage
    console.log('\n📋 Test 4.4: Testing large file storage...');
    const urlId3 = `test-large-${Date.now()}`;
    const largeData = Array(1000).fill({
      id: 1,
      name: 'Item',
      description: 'Test item description',
      metadata: { key: 'value' },
    });
    const largeFile = `import React from 'react';\n\nconst data = ${JSON.stringify(largeData, null, 2)};\n\nexport default function LargeComponent() {\n  return <div>{data.map(d => <p key={d.id}>{d.name}</p>)}</div>;\n}`;

    await db.saveChat({
      anonymousId,
      urlId: urlId3,
      messages: [],
      fileSnapshot: {
        'src/LargeComponent.tsx': largeFile,
      },
    });

    const session3 = await db.getSessionByUrlId(urlId3);
    if (!session3) throw new Error('Session not created');
    sessionIds.push(session3.id);

    const loadedLarge = await db.loadChat(urlId3);
    if (!loadedLarge?.fileSnapshot) throw new Error('Large file not saved');
    if (loadedLarge.fileSnapshot['src/LargeComponent.tsx'] !== largeFile) {
      throw new Error('Large file content mismatch');
    }

    info(`File size: ${(largeFile.length / 1024).toFixed(2)} KB`);
    info(`Data items: ${largeData.length}`);
    success('Large file stored and verified');
    testsPassed++;

    // Test 4.5: Many files (100 files)
    console.log('\n📋 Test 4.5: Testing storage of many files (100 files)...');
    const urlId4 = `test-many-${Date.now()}`;
    const manyFiles: Record<string, string> = {};

    for (let i = 0; i < 100; i++) {
      manyFiles[`src/components/Component${i}.tsx`] =
        `export function Component${i}() { return <div>Component ${i}</div>; }`;
    }

    const startTime = Date.now();
    await db.saveChat({
      anonymousId,
      urlId: urlId4,
      messages: [],
      fileSnapshot: manyFiles,
    });
    const saveDuration = Date.now() - startTime;

    const session4 = await db.getSessionByUrlId(urlId4);
    if (!session4) throw new Error('Session not created');
    sessionIds.push(session4.id);

    const loadStart = Date.now();
    const loadedMany = await db.loadChat(urlId4);
    const loadDuration = Date.now() - loadStart;

    if (!loadedMany?.fileSnapshot) throw new Error('Many files not saved');
    if (Object.keys(loadedMany.fileSnapshot).length !== 100) {
      throw new Error('Not all files saved');
    }

    info(`Files saved: 100`);
    info(`Save time: ${saveDuration}ms (${(saveDuration / 100).toFixed(2)}ms per file)`);
    info(`Load time: ${loadDuration}ms`);
    success('Many files handled efficiently');
    testsPassed++;

    // Test 4.6: File statistics by extension
    console.log('\n📋 Test 4.6: Calculating file statistics...');
    const allFiles = { ...basicFiles, ...nestedFiles };
    const byExtension: Record<string, { count: number; size: number }> = {};

    for (const [path, content] of Object.entries(allFiles)) {
      const ext = path.split('.').pop() || 'unknown';
      if (!byExtension[ext]) {
        byExtension[ext] = { count: 0, size: 0 };
      }
      byExtension[ext].count++;
      byExtension[ext].size += content.length;
    }

    info('File breakdown by extension:');
    for (const [ext, stats] of Object.entries(byExtension).sort((a, b) => b[1].count - a[1].count)) {
      info(`  .${ext}: ${stats.count} file(s), ${(stats.size / 1024).toFixed(2)} KB`);
    }
    success('File statistics calculated');
    testsPassed++;

    // Test 4.7: Update files in existing project
    console.log('\n📋 Test 4.7: Updating files in existing project...');
    const updatedFiles = {
      ...basicFiles,
      'src/App.tsx': `import React from 'react';\n\nexport default function App() {\n  return <div>Updated Hello World!</div>;\n}`,
      'src/NewComponent.tsx': `export function NewComponent() {}`,
    };

    await db.saveChat({
      anonymousId,
      urlId: urlId1,
      messages: [],
      fileSnapshot: updatedFiles,
    });

    const loadedUpdated = await db.loadChat(urlId1);
    if (!loadedUpdated?.fileSnapshot) throw new Error('Updated project not found');

    const hasNewFile = 'src/NewComponent.tsx' in loadedUpdated.fileSnapshot;
    const hasUpdatedContent = loadedUpdated.fileSnapshot['src/App.tsx'].includes('Updated');

    if (!hasNewFile) throw new Error('New file not added');
    if (!hasUpdatedContent) throw new Error('File not updated');

    info(`Original files: ${Object.keys(basicFiles).length}`);
    info(`Updated files: ${Object.keys(updatedFiles).length}`);
    info('New file added: src/NewComponent.tsx');
    info('Existing file updated: src/App.tsx');
    success('File updates working');
    testsPassed++;

    // Test 4.8: Empty project (no files)
    console.log('\n📋 Test 4.8: Testing empty project...');
    const urlId5 = `test-empty-${Date.now()}`;
    await db.saveChat({
      anonymousId,
      urlId: urlId5,
      messages: [],
      fileSnapshot: {},
    });

    const session5 = await db.getSessionByUrlId(urlId5);
    if (!session5) throw new Error('Empty session not created');
    sessionIds.push(session5.id);

    const loadedEmpty = await db.loadChat(urlId5);
    if (!loadedEmpty) throw new Error('Empty project not found');

    info('Empty project created');
    info(`Files: ${Object.keys(loadedEmpty.fileSnapshot || {}).length}`);
    success('Empty project handled');
    testsPassed++;

    // Cleanup
    console.log('\n📋 Cleanup: Deleting test sessions...');
    for (const sid of sessionIds) {
      await db.deleteSession(sid);
    }
    info(`Deleted ${sessionIds.length} test sessions`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}TEST SUMMARY${colors.reset}`);
    console.log('='.repeat(80));
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);

    if (testsFailed === 0) {
      console.log(`${colors.bright}${colors.green}🎉 All project file storage tests passed!${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.bright}${colors.red}❌ Some tests failed${colors.reset}\n`);
      process.exit(1);
    }

  } catch (err) {
    error(`Test failed: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
    console.log(`\n${colors.red}Failed: ${testsFailed}${colors.reset}`);
    console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}\n`);

    // Cleanup on failure
    for (const sid of sessionIds) {
      try {
        await db.deleteSession(sid);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Run tests
testProjectFileStorage();
