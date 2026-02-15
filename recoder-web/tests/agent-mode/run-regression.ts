/**
 * Agent Mode Regression Test Runner
 *
 * Runs each test case from regression-dataset.json against the agent API,
 * scores the results, and outputs a report.
 *
 * Usage: npx tsx tests/agent-mode/run-regression.ts [--case agent-001]
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  name: string;
  difficulty: string;
  prompt: string;
  starter_template: string;
  expected_outcomes: {
    files_created?: string[];
    files_modified?: string[];
    files_created_or_modified?: string[];
    must_contain_patterns?: Record<string, string[]>;
    build_must_pass: boolean;
    shell_commands_expected?: string[];
    functionality_checks?: string[];
    expected_fix_iterations?: number;
  };
  scoring_rubric: Record<string, string>;
}

interface TestResult {
  id: string;
  name: string;
  scores: {
    files_correct: number;
    build_passes: number;
    functionality_correct: number;
    no_regressions: number;
    code_quality: number;
  };
  weighted_score: number;
  passed: boolean;
  duration_ms: number;
  errors: string[];
  agent_events: unknown[];
}

interface RegressionDataset {
  version: string;
  scoring: {
    pass_threshold: number;
    weights: Record<string, number>;
  };
  test_cases: TestCase[];
}

const AGENT_API_URL = process.env.AGENT_API_URL || 'http://localhost:5173/api/agent';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

async function runTestCase(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const agentEvents: unknown[] = [];

  console.log(`\n  Running: ${testCase.id} - ${testCase.name} (${testCase.difficulty})`);
  console.log(`  Prompt: "${testCase.prompt.slice(0, 80)}..."`);

  try {
    // Call agent API
    const response = await fetch(AGENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN ? { Cookie: `recoder.session_token=${AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        prompt: testCase.prompt,
        projectId: `regression-${testCase.id}-${Date.now()}`,
        maxFixIterations: 5,
      }),
    });

    if (!response.ok) {
      errors.push(`HTTP ${response.status}: ${await response.text()}`);
    } else if (response.body) {
      // Consume SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              agentEvents.push(event);

              if (event.type === 'error') {
                errors.push(event.data.message);
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      }
    }
  } catch (e: any) {
    errors.push(`Connection error: ${e.message}`);
  }

  const duration = Date.now() - startTime;

  // Score the results
  const scores = scoreTestCase(testCase, agentEvents, errors);
  const weights = { files_correct: 0.3, build_passes: 0.25, functionality_correct: 0.25, no_regressions: 0.1, code_quality: 0.1 };
  const weighted = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (scores[key as keyof typeof scores] || 0) * weight;
  }, 0);

  const result: TestResult = {
    id: testCase.id,
    name: testCase.name,
    scores,
    weighted_score: Math.round(weighted * 100) / 100,
    passed: weighted >= 0.7 && (scores.build_passes === 1 || !testCase.expected_outcomes.build_must_pass),
    duration_ms: duration,
    errors,
    agent_events: agentEvents,
  };

  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`  Result: ${status} (score: ${result.weighted_score}, ${duration}ms)`);

  if (errors.length > 0) {
    console.log(`  Errors: ${errors.slice(0, 3).join('; ')}`);
  }

  return result;
}

function scoreTestCase(
  testCase: TestCase,
  events: unknown[],
  errors: string[],
): TestResult['scores'] {
  // Extract file changes and completion event from agent events
  const fileChangeEvents = (events as any[]).filter((e) => e.type === 'file_change');
  const completeEvent = (events as any[]).find((e) => e.type === 'complete');
  const verifyEvents = (events as any[]).filter((e) => e.type === 'verify_result');

  // Files correct (0-1)
  let filesScore = 0;
  if (testCase.expected_outcomes.files_created || testCase.expected_outcomes.files_modified) {
    const expectedPaths = [
      ...(testCase.expected_outcomes.files_created || []),
      ...(testCase.expected_outcomes.files_modified || []),
      ...(testCase.expected_outcomes.files_created_or_modified || []),
    ];
    const actualPaths = fileChangeEvents.map((e: any) => e.data?.path).filter(Boolean);

    if (expectedPaths.length > 0) {
      const matched = expectedPaths.filter((expected) =>
        actualPaths.some((actual: string) => actual.includes(expected) || expected.includes(actual)),
      ).length;
      filesScore = matched / expectedPaths.length;
    }
  } else {
    filesScore = fileChangeEvents.length > 0 ? 0.5 : 0;
  }

  // Build passes (0 or 1)
  let buildScore = 0;
  if (verifyEvents.length > 0) {
    const lastVerify = verifyEvents[verifyEvents.length - 1];
    buildScore = lastVerify.data?.success ? 1 : 0;
  } else if (completeEvent?.data?.success) {
    buildScore = 1;
  }

  // Functionality (estimated from completion + no errors)
  let funcScore = 0;
  if (completeEvent) {
    funcScore = completeEvent.data?.success ? 0.8 : 0.3;
  }
  if (errors.length === 0 && fileChangeEvents.length > 0) {
    funcScore = Math.max(funcScore, 0.6);
  }

  // No regressions (estimated)
  const noRegressionsScore = errors.length === 0 ? 1 : 0.5;

  // Code quality (estimated from patterns)
  let qualityScore = 0.5; // Base score
  if (testCase.expected_outcomes.must_contain_patterns) {
    let patternMatches = 0;
    let totalPatterns = 0;

    for (const [filePath, patterns] of Object.entries(testCase.expected_outcomes.must_contain_patterns)) {
      const fileEvent = fileChangeEvents.find((e: any) =>
        e.data?.path?.includes(filePath),
      );
      if (fileEvent) {
        for (const pattern of patterns) {
          totalPatterns++;
          const content = (fileEvent as any).data?.newContent || '';
          const regex = new RegExp(pattern, 'i');
          if (regex.test(content)) {
            patternMatches++;
          }
        }
      } else {
        totalPatterns += patterns.length;
      }
    }

    if (totalPatterns > 0) {
      qualityScore = patternMatches / totalPatterns;
    }
  }

  return {
    files_correct: Math.round(filesScore * 100) / 100,
    build_passes: buildScore,
    functionality_correct: Math.round(funcScore * 100) / 100,
    no_regressions: noRegressionsScore,
    code_quality: Math.round(qualityScore * 100) / 100,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const caseFilter = args.find((a) => a.startsWith('--case='))?.split('=')[1];

  const datasetPath = path.join(__dirname, 'regression-dataset.json');
  const dataset: RegressionDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

  console.log(`Agent Mode Regression Tests v${dataset.version}`);
  console.log(`Pass threshold: ${dataset.scoring.pass_threshold}`);

  let testCases = dataset.test_cases;
  if (caseFilter) {
    testCases = testCases.filter((tc) => tc.id === caseFilter);
    if (testCases.length === 0) {
      console.error(`No test case found with id: ${caseFilter}`);
      process.exit(1);
    }
  }

  console.log(`Running ${testCases.length} test case(s)...\n`);

  const results: TestResult[] = [];

  for (const testCase of testCases) {
    const result = await runTestCase(testCase);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('REGRESSION TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalScore = results.reduce((s, r) => s + r.weighted_score, 0) / results.length;

  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Avg Score: ${Math.round(totalScore * 100) / 100}`);
  console.log('');

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${result.id}: ${result.name} (${result.weighted_score})`);
  }

  // Write results to file
  const outputPath = path.join(__dirname, 'regression-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  // Exit with failure code if any test failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
