/**
 * Global test setup
 * Runs once before all tests
 */

import path from 'path';
import fs from 'fs-extra';

export default async function globalSetup(): Promise<void> {
  console.log('🔧 Setting up global test environment...');
  
  // Create test directories
  const testDirs = [
    path.join(process.cwd(), 'test-output'),
    path.join(process.cwd(), 'temp-test-dirs'),
    path.join(process.cwd(), 'test-artifacts'),
  ];

  for (const dir of testDirs) {
    await fs.ensureDir(dir);
    console.log(`✅ Created test directory: ${dir}`);
  }

  // Setup test configuration
  const testConfigDir = path.join(process.cwd(), 'test-output', '.recoder');
  await fs.ensureDir(testConfigDir);
  
  // Create test configuration file
  const testConfig = {
    api: {
      baseUrl: 'http://test-api.localhost',
      timeout: 5000,
      retries: 0,
    },
    auth: {
      token: null,
      refreshToken: null,
    },
    preferences: {
      verboseLogging: false,
      colorOutput: false,
      autoUpdate: false,
    },
    test: {
      mode: true,
      mockApi: true,
      skipAuth: true,
    },
  };

  await fs.writeJson(
    path.join(testConfigDir, 'config.json'),
    testConfig,
    { spaces: 2 }
  );

  console.log('✅ Created test configuration');

  // Setup test database/storage if needed
  const testDbPath = path.join(process.cwd(), 'test-output', 'test.db');
  await fs.ensureFile(testDbPath);
  console.log('✅ Created test database file');

  // Setup test templates
  const testTemplatesDir = path.join(process.cwd(), 'test-output', 'templates');
  await fs.ensureDir(testTemplatesDir);
  
  // Create a minimal test template
  const minimalTemplate = {
    id: 'minimal-test',
    name: 'Minimal Test Template',
    description: 'A minimal template for testing',
    category: 'test',
    type: 'project',
    version: '1.0.0',
    author: 'Test Suite',
    tags: ['test', 'minimal'],
    public: true,
    featured: false,
    variables: [
      {
        name: 'projectName',
        type: 'string',
        description: 'Name of the project',
        required: true,
        default: 'test-project',
      },
      {
        name: 'description',
        type: 'string',
        description: 'Project description',
        required: false,
        default: 'A test project',
      },
    ],
    files: [
      {
        path: 'package.json',
        content: '{"name": "{{projectName}}", "version": "1.0.0", "description": "{{description}}"}',
        template: true,
      },
      {
        path: 'README.md',
        content: '# {{projectName}}\n\n{{description}}',
        template: true,
      },
      {
        path: 'src/index.js',
        content: 'console.log("Hello from {{projectName}}!");',
        template: true,
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await fs.writeJson(
    path.join(testTemplatesDir, 'minimal-test.json'),
    minimalTemplate,
    { spaces: 2 }
  );

  console.log('✅ Created test templates');

  // Setup test projects
  const testProjectsDir = path.join(process.cwd(), 'test-output', 'projects');
  await fs.ensureDir(testProjectsDir);
  
  // Create a sample test project
  const sampleProject = path.join(testProjectsDir, 'sample-project');
  await fs.ensureDir(sampleProject);
  
  await fs.writeJson(
    path.join(sampleProject, 'package.json'),
    {
      name: 'sample-project',
      version: '1.0.0',
      description: 'A sample project for testing',
      dependencies: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
      },
    },
    { spaces: 2 }
  );

  await fs.ensureDir(path.join(sampleProject, 'src'));
  await fs.writeFile(
    path.join(sampleProject, 'src', 'index.js'),
    'import React from "react";\nimport ReactDOM from "react-dom";\n\nReactDOM.render(<h1>Hello World!</h1>, document.getElementById("root"));'
  );

  console.log('✅ Created test projects');

  // Setup test API mock data
  const testApiDataDir = path.join(process.cwd(), 'test-output', 'api-data');
  await fs.ensureDir(testApiDataDir);
  
  const mockApiData = {
    users: [
      {
        id: 'test-user-1',
        email: 'test@example.com',
        name: 'Test User',
        created_at: new Date().toISOString(),
      },
    ],
    projects: [
      {
        id: 'test-project-1',
        name: 'Test Project',
        type: 'web',
        description: 'A test project',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
      },
    ],
    templates: [minimalTemplate],
    agents: [
      {
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'web',
        description: 'A test agent',
        capabilities: ['code-generation', 'analysis'],
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    plans: [
      {
        id: 'test-plan-1',
        name: 'Test Plan',
        description: 'A test plan',
        project_id: 'test-project-1',
        requirements: [],
        architecture: {},
        phases: [],
        timeline: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'draft',
      },
    ],
  };

  await fs.writeJson(
    path.join(testApiDataDir, 'mock-data.json'),
    mockApiData,
    { spaces: 2 }
  );

  console.log('✅ Created test API mock data');

  // Setup test logs directory
  const testLogsDir = path.join(process.cwd(), 'test-output', 'logs');
  await fs.ensureDir(testLogsDir);
  console.log('✅ Created test logs directory');

  // Create test coverage directory
  const testCoverageDir = path.join(process.cwd(), 'test-output', 'coverage');
  await fs.ensureDir(testCoverageDir);
  console.log('✅ Created test coverage directory');

  // Setup environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.RECODER_CONFIG_DIR = testConfigDir;
  process.env.RECODER_TEST_MODE = 'true';
  process.env.RECODER_LOG_LEVEL = 'error';
  process.env.RECODER_API_URL = 'http://test-api.localhost';
  
  console.log('✅ Set test environment variables');

  // Create test report directory
  const testReportsDir = path.join(process.cwd(), 'test-reports');
  await fs.ensureDir(testReportsDir);
  console.log('✅ Created test reports directory');

  console.log('🎉 Global test setup completed successfully!');
}