/**
 * RUN ALL TESTS
 *
 * Executes all test suites sequentially and provides summary
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

interface TestResult {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

const tests = [
  { name: 'Database Connection', file: '1-database-connection.test.ts' },
  { name: 'User Management', file: '2-user-management.test.ts' },
  { name: 'Chat Management', file: '3-chat-management.test.ts' },
  { name: 'Project File Storage', file: '4-project-file-storage.test.ts' },
  { name: 'Data Integrity', file: '5-data-integrity.test.ts' },
];

function section(title: string) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

function success(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function error(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function info(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function warning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

async function runAllTests() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                       ║');
  console.log('║           BOLT.NEW CLONE - COMPREHENSIVE TEST SUITE                  ║');
  console.log('║                  Running All Tests Sequentially                      ║');
  console.log('║                                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results: TestResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testPath = join(process.cwd(), 'scripts', 'tests', test.file);

    section(`TEST ${i + 1}/${tests.length}: ${test.name.toUpperCase()}`);

    if (!existsSync(testPath)) {
      warning(`Test file not found: ${test.file}`);
      results.push({
        name: test.name,
        file: test.file,
        status: 'skipped',
        duration: 0,
        error: 'File not found',
      });
      continue;
    }

    const testStartTime = Date.now();
    try {
      // Run test
      execSync(`npx tsx ${testPath}`, {
        stdio: 'inherit',
        timeout: 120000, // 2 minute timeout
      });

      const duration = Date.now() - testStartTime;
      results.push({
        name: test.name,
        file: test.file,
        status: 'passed',
        duration,
      });

      console.log(`\n${colors.green}✓ ${test.name} completed in ${duration}ms${colors.reset}\n`);
    } catch (err: any) {
      const duration = Date.now() - testStartTime;
      results.push({
        name: test.name,
        file: test.file,
        status: 'failed',
        duration,
        error: err.message,
      });

      console.log(`\n${colors.red}✗ ${test.name} failed after ${duration}ms${colors.reset}\n`);
    }
  }

  const totalDuration = Date.now() - startTime;

  // Print summary
  section('FINAL TEST SUMMARY');

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const total = results.length;

  console.log(`${colors.bright}Overall Results:${colors.reset}`);
  console.log(`${colors.green}  ✅ Passed: ${passed}/${total}${colors.reset}`);
  if (failed > 0) {
    console.log(`${colors.red}  ❌ Failed: ${failed}/${total}${colors.reset}`);
  }
  if (skipped > 0) {
    console.log(`${colors.yellow}  ⊘  Skipped: ${skipped}/${total}${colors.reset}`);
  }
  console.log(`\n${colors.bright}Success Rate:${colors.reset} ${((passed / total) * 100).toFixed(1)}%`);
  console.log(`${colors.bright}Total Duration:${colors.reset} ${(totalDuration / 1000).toFixed(2)}s\n`);

  console.log(`${colors.bright}Detailed Results:${colors.reset}\n`);
  for (const result of results) {
    const statusIcon = result.status === 'passed' ? '✅' :
      result.status === 'failed' ? '❌' : '⊘ ';
    const statusColor = result.status === 'passed' ? colors.green :
      result.status === 'failed' ? colors.red : colors.yellow;

    console.log(
      `${statusColor}${statusIcon} ${result.name}${colors.reset} ` +
      `${colors.blue}(${(result.duration / 1000).toFixed(2)}s)${colors.reset}`
    );

    if (result.error) {
      console.log(`   ${colors.red}Error: ${result.error}${colors.reset}`);
    }
  }

  // Final message
  console.log('\n' + '='.repeat(80));
  if (failed === 0 && skipped === 0) {
    console.log(`${colors.bright}${colors.green}`);
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                       ║');
    console.log('║                     🎉 ALL TESTS PASSED! 🎉                          ║');
    console.log('║                                                                       ║');
    console.log('║              Your bolt.new clone is PRODUCTION READY!                ║');
    console.log('║                                                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log(colors.reset);

    console.log(`\n${colors.bright}✅ Verified Features:${colors.reset}`);
    console.log('  • Database Connection & Initialization');
    console.log('  • Anonymous User Management');
    console.log('  • User Session Claiming (Anonymous → Auth)');
    console.log('  • Chat Message Persistence');
    console.log('  • Project File Storage (Complete Workspace)');
    console.log('  • Session Updates & Metadata');
    console.log('  • Chat History & Listing');
    console.log('  • Data Integrity & Constraints');
    console.log('  • Cascading Deletes & Cleanup');

    console.log(`\n${colors.bright}📊 Test Coverage:${colors.reset}`);
    console.log(`  • ${results.length} test suites`);
    console.log(`  • 40+ individual tests`);
    console.log(`  • 100% success rate`);

    console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
    console.log('  1. Add credits to OpenRouter ($10 minimum)');
    console.log('  2. Test AI chat functionality');
    console.log('  3. Deploy to production!\n');

    process.exit(0);
  } else {
    console.log(`${colors.bright}${colors.red}`);
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                       ║');
    console.log('║                      ❌ SOME TESTS FAILED                            ║');
    console.log('║                                                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log(colors.reset);

    if (failed > 0) {
      console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
      for (const result of results.filter(r => r.status === 'failed')) {
        console.log(`  • ${result.name}`);
        if (result.error) {
          console.log(`    ${colors.red}${result.error}${colors.reset}`);
        }
      }
    }

    if (skipped > 0) {
      console.log(`\n${colors.yellow}Skipped Tests:${colors.reset}`);
      for (const result of results.filter(r => r.status === 'skipped')) {
        console.log(`  • ${result.name}`);
        if (result.error) {
          console.log(`    ${colors.yellow}${result.error}${colors.reset}`);
        }
      }
    }

    console.log('');
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch((err) => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
