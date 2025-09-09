// Automated Testing API - Professional testing infrastructure with real test execution
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

// Rate limiting for test execution
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

const createTestSuiteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  projectId: z.string().uuid(),
  framework: z.enum(['jest', 'cypress', 'playwright', 'vitest', 'mocha']),
  testType: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']),
  configuration: z.object({
    timeout: z.number().min(1000).max(300000).default(30000),
    retries: z.number().min(0).max(5).default(1),
    parallel: z.boolean().default(false),
    coverage: z.boolean().default(true),
    browser: z.enum(['chrome', 'firefox', 'safari', 'edge']).optional(),
    viewport: z.object({
      width: z.number().default(1920),
      height: z.number().default(1080)
    }).optional(),
    environment: z.record(z.string()).default({})
  }),
  testFiles: z.array(z.object({
    path: z.string(),
    content: z.string().max(50000) // 50KB limit per test file
  })).min(1).max(50)
});

const executeTestSchema = z.object({
  suiteId: z.string().uuid(),
  environment: z.enum(['local', 'staging', 'production']).default('local'),
  filters: z.object({
    tags: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    testNames: z.array(z.string()).optional()
  }).optional(),
  options: z.object({
    headless: z.boolean().default(true),
    video: z.boolean().default(false),
    screenshots: z.boolean().default(false),
    debug: z.boolean().default(false)
  }).optional()
});

// POST - Create automated test suite
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'test-suite-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const validatedData = createTestSuiteSchema.parse(body);
      
      // Check if user has access to the project
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
      }

      // Create test suite
      const testSuite = await prisma.testSuite.create({
        data: {
          id: uuidv4(),
          name: validatedData.name,
          description: validatedData.description,
          projectId: validatedData.projectId,
          framework: validatedData.framework,
          testType: validatedData.testType,
          configuration: validatedData.configuration,
          createdBy: session.user.id,
          metadata: {
            testFiles: validatedData.testFiles,
            createdAt: new Date().toISOString()
          }
        }
      });

      // Set up test environment
      const testEnvironment = await setupTestEnvironment(testSuite.id, validatedData);

      // Log test suite creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'test_suite_create',
          platform: 'testing',
          success: true,
          metadata: {
            testSuiteId: testSuite.id,
            framework: validatedData.framework,
            testType: validatedData.testType,
            fileCount: validatedData.testFiles.length
          }
        }
      });

      return NextResponse.json({
        testSuite: {
          ...testSuite,
          environment: testEnvironment
        },
        message: 'Test suite created successfully'
      }, { status: 201 });

    } else if (action === 'execute') {
      const validatedData = executeTestSchema.parse(body);
      
      const testSuite = await prisma.testSuite.findUnique({
        where: { id: validatedData.suiteId },
        include: { project: true }
      });

      if (!testSuite) {
        return NextResponse.json({ error: 'Test suite not found' }, { status: 404 });
      }

      // Check user access
      const hasAccess = await prisma.project.findFirst({
        where: {
          id: testSuite.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor', 'viewer'] }
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Execute tests
      const executionResult = await executeTestSuite(testSuite, validatedData, session.user.id);

      return NextResponse.json({
        execution: executionResult,
        message: 'Test execution started'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Automated testing error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// GET - Get test suites and execution results
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const suiteId = searchParams.get('suiteId');
    const executionId = searchParams.get('executionId');

    if (executionId) {
      // Get specific test execution results
      const execution = await prisma.testExecution.findUnique({
        where: { id: executionId },
        include: {
          testSuite: {
            include: { project: true }
          }
        }
      });

      if (!execution) {
        return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
      }

      // Check user access
      const hasAccess = await prisma.project.findFirst({
        where: {
          id: execution.testSuite.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({ execution });

    } else if (suiteId) {
      // Get test suite with recent executions
      const testSuite = await prisma.testSuite.findUnique({
        where: { id: suiteId },
        include: {
          project: true,
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!testSuite) {
        return NextResponse.json({ error: 'Test suite not found' }, { status: 404 });
      }

      return NextResponse.json({ testSuite });

    } else if (projectId) {
      // Get all test suites for a project
      const testSuites = await prisma.testSuite.findMany({
        where: {
          projectId,
          project: {
            OR: [
              { userId: session.user.id },
              { 
                collaborators: {
                  some: {
                    userId: session.user.id
                  }
                }
              }
            ]
          }
        },
        include: {
          _count: {
            select: {
              executions: true
            }
          },
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ testSuites });

    } else {
      // Get all test suites for user
      const testSuites = await prisma.testSuite.findMany({
        where: {
          project: {
            OR: [
              { userId: session.user.id },
              { 
                collaborators: {
                  some: {
                    userId: session.user.id
                  }
                }
              }
            ]
          }
        },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              executions: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ testSuites });
    }

  } catch (error) {
    console.error('Get testing data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch testing data' },
      { status: 500 }
    );
  }
}

async function setupTestEnvironment(testSuiteId: string, config: any) {
  const testDir = path.join('/tmp/test-environments', testSuiteId);
  
  try {
    // Create test directory
    await fs.ensureDir(testDir);

    // Write test files
    for (const testFile of config.testFiles) {
      const filePath = path.join(testDir, testFile.path);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, testFile.content);
    }

    // Create framework-specific configuration
    const configFile = await createFrameworkConfig(testDir, config);

    // Install dependencies
    if (config.framework === 'jest' || config.framework === 'vitest') {
      const packageJson = {
        name: `test-suite-${testSuiteId}`,
        version: '1.0.0',
        private: true,
        scripts: {
          test: config.framework === 'jest' ? 'jest' : 'vitest run',
          'test:watch': config.framework === 'jest' ? 'jest --watch' : 'vitest',
          'test:coverage': config.framework === 'jest' ? 'jest --coverage' : 'vitest --coverage'
        },
        devDependencies: getFrameworkDependencies(config.framework)
      };

      await fs.writeJson(path.join(testDir, 'package.json'), packageJson, { spaces: 2 });
      
      // Install npm dependencies
      await execAsync('npm install', { cwd: testDir });
    }

    return {
      directory: testDir,
      configFile,
      framework: config.framework,
      ready: true
    };

  } catch (error) {
    console.error('Test environment setup error:', error);
    return {
      directory: testDir,
      error: error instanceof Error ? error.message : 'Setup failed',
      ready: false
    };
  }
}

async function createFrameworkConfig(testDir: string, config: any) {
  switch (config.framework) {
    case 'jest':
      const jestConfig = {
        testEnvironment: 'node',
        collectCoverage: config.configuration.coverage,
        testTimeout: config.configuration.timeout,
        maxWorkers: config.configuration.parallel ? '50%' : 1,
        coverageDirectory: 'coverage',
        coverageReporters: ['text', 'html', 'json-summary']
      };
      
      const jestConfigPath = path.join(testDir, 'jest.config.js');
      await fs.writeFile(jestConfigPath, `module.exports = ${JSON.stringify(jestConfig, null, 2)};`);
      return jestConfigPath;

    case 'cypress':
      const cypressConfig = {
        e2e: {
          baseUrl: 'http://localhost:3000',
          viewportWidth: config.configuration.viewport?.width || 1920,
          viewportHeight: config.configuration.viewport?.height || 1080,
          defaultCommandTimeout: config.configuration.timeout,
          video: false,
          screenshot: false
        }
      };
      
      const cypressConfigPath = path.join(testDir, 'cypress.config.js');
      await fs.writeFile(cypressConfigPath, `module.exports = ${JSON.stringify(cypressConfig, null, 2)};`);
      return cypressConfigPath;

    case 'playwright':
      const playwrightConfig = {
        timeout: config.configuration.timeout,
        retries: config.configuration.retries,
        use: {
          viewport: config.configuration.viewport || { width: 1920, height: 1080 },
          ignoreHTTPSErrors: true,
          video: 'off',
          screenshot: 'only-on-failure'
        },
        projects: [
          { name: 'chrome', use: { ...require('@playwright/test').devices['Desktop Chrome'] } }
        ]
      };
      
      const playwrightConfigPath = path.join(testDir, 'playwright.config.js');
      await fs.writeFile(playwrightConfigPath, `module.exports = ${JSON.stringify(playwrightConfig, null, 2)};`);
      return playwrightConfigPath;

    default:
      return null;
  }
}

function getFrameworkDependencies(framework: string) {
  switch (framework) {
    case 'jest':
      return {
        'jest': '^29.7.0',
        '@types/jest': '^29.5.5',
        'ts-jest': '^29.1.1'
      };
    case 'vitest':
      return {
        'vitest': '^0.34.6',
        '@vitest/ui': '^0.34.6'
      };
    case 'cypress':
      return {
        'cypress': '^13.3.0'
      };
    case 'playwright':
      return {
        '@playwright/test': '^1.39.0'
      };
    default:
      return {};
  }
}

async function executeTestSuite(testSuite: any, options: any, userId: string) {
  const executionId = uuidv4();
  const startTime = Date.now();

  try {
    // Create execution record
    const execution = await prisma.testExecution.create({
      data: {
        id: executionId,
        testSuiteId: testSuite.id,
        status: 'running',
        environment: options.environment,
        configuration: {
          filters: options.filters,
          options: options.options
        },
        triggeredBy: userId,
        metadata: {
          startTime: new Date().toISOString()
        }
      }
    });

    // Execute tests in background
    executeTestsInBackground(testSuite, executionId, options).catch(console.error);

    return {
      executionId,
      status: 'running',
      startedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Test execution setup error:', error);
    throw error;
  }
}

async function executeTestsInBackground(testSuite: any, executionId: string, options: any) {
  const testDir = path.join('/tmp/test-environments', testSuite.id);
  const startTime = Date.now();
  
  try {
    let command = '';
    let args = [];

    switch (testSuite.framework) {
      case 'jest':
        command = 'npm';
        args = ['test'];
        if (testSuite.configuration.coverage) {
          args = ['run', 'test:coverage'];
        }
        break;
      
      case 'vitest':
        command = 'npm';
        args = ['test'];
        break;
        
      case 'cypress':
        command = 'npx';
        args = ['cypress', 'run'];
        if (!options.options?.headless) {
          args.push('--headed');
        }
        break;
        
      case 'playwright':
        command = 'npx';
        args = ['playwright', 'test'];
        if (!options.options?.headless) {
          args.push('--headed');
        }
        break;
    }

    // Execute the test command
    const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, {
      cwd: testDir,
      timeout: testSuite.configuration.timeout * 2, // Double the timeout for execution
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    // Parse test results
    const results = parseTestResults(stdout, stderr, testSuite.framework);
    
    // Update execution record with results
    await prisma.testExecution.update({
      where: { id: executionId },
      data: {
        status: results.success ? 'passed' : 'failed',
        results: {
          ...results,
          executionTime: Date.now() - startTime,
          stdout,
          stderr: stderr || undefined
        },
        completedAt: new Date()
      }
    });

    // Log successful execution
    await prisma.auditLog.create({
      data: {
        userId: testSuite.createdBy,
        action: 'test_execution_complete',
        platform: 'testing',
        success: results.success,
        metadata: {
          executionId,
          testSuiteId: testSuite.id,
          framework: testSuite.framework,
          testsRun: results.testsRun,
          testsPassed: results.testsPassed,
          testsFailed: results.testsFailed,
          executionTime: Date.now() - startTime
        }
      }
    });

  } catch (error) {
    console.error('Test execution error:', error);

    // Update execution record with error
    await prisma.testExecution.update({
      where: { id: executionId },
      data: {
        status: 'error',
        results: {
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed',
          executionTime: Date.now() - startTime
        },
        completedAt: new Date()
      }
    });
  }
}

function parseTestResults(stdout: string, stderr: string, framework: string) {
  // Basic result parsing - would be more sophisticated in production
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let success = false;

  try {
    switch (framework) {
      case 'jest':
      case 'vitest':
        const jestMatch = stdout.match(/Tests:\s+(\d+)\s+failed.*?(\d+)\s+passed.*?(\d+)\s+total/);
        if (jestMatch) {
          testsFailed = parseInt(jestMatch[1]);
          testsPassed = parseInt(jestMatch[2]);
          testsRun = parseInt(jestMatch[3]);
          success = testsFailed === 0;
        }
        break;
        
      case 'cypress':
        const cypressMatch = stdout.match(/(\d+)\s+passing.*?(\d+)\s+failing/);
        if (cypressMatch) {
          testsPassed = parseInt(cypressMatch[1]);
          testsFailed = parseInt(cypressMatch[2]);
          testsRun = testsPassed + testsFailed;
          success = testsFailed === 0;
        }
        break;
        
      case 'playwright':
        const playwrightMatch = stdout.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
        if (playwrightMatch) {
          testsPassed = parseInt(playwrightMatch[1]);
          testsFailed = parseInt(playwrightMatch[2]);
          testsRun = testsPassed + testsFailed;
          success = testsFailed === 0;
        }
        break;
    }
  } catch (parseError) {
    console.error('Result parsing error:', parseError);
  }

  return {
    success,
    testsRun,
    testsPassed,
    testsFailed,
    framework,
    summary: `${testsPassed}/${testsRun} tests passed`
  };
}