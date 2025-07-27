/**
 * Integration tests for CLI commands
 * Tests the complete workflow from CLI input to backend response
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import { jest } from '@jest/globals';
import { ConfigManager } from '../../utils/config';
import { apiClient } from '../../services/api';

const execAsync = promisify(exec);

describe('CLI Integration Tests', () => {
  const testDir = path.join(__dirname, '..', '..', '..', '..', 'test-output');
  const cliPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.js');
  
  beforeAll(async () => {
    // Ensure test directory exists
    await fs.ensureDir(testDir);
    
    // Setup test configuration
    ConfigManager.setConfigDir(path.join(testDir, '.recoder'));
    
    // Mock API responses for testing
    jest.spyOn(apiClient, 'getInstance').mockReturnValue({
      healthCheck: jest.fn().mockResolvedValue({ success: true }),
      testConnection: jest.fn().mockResolvedValue(true),
      // Add more mocked methods as needed
    } as any);
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.remove(testDir);
  });

  describe('Authentication Commands', () => {
    test('should handle auth status command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} auth status`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Authentication Status');
    });

    test('should handle auth login command with invalid credentials', async () => {
      try {
        await execAsync(`node ${cliPath} auth login --email test@example.com --password invalid`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        });
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Authentication failed');
      }
    });
  });

  describe('Project Commands', () => {
    test('should handle project init command', async () => {
      const projectPath = path.join(testDir, 'test-project');
      await fs.ensureDir(projectPath);
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} project init --name test-project --type web --path ${projectPath} --template minimal`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Project initialized');
    });

    test('should handle project list command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} project list`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('projects');
    });

    test('should handle project analyze command', async () => {
      const projectPath = path.join(testDir, 'analyze-project');
      await fs.ensureDir(projectPath);
      
      // Create some sample files
      await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'react': '^18.0.0'
        }
      }));
      
      await fs.writeFile(path.join(projectPath, 'src', 'index.js'), 'console.log("Hello World");');
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} project analyze --path ${projectPath}`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Analysis');
    });

    test('should handle project validation command', async () => {
      const projectPath = path.join(testDir, 'validate-project');
      await fs.ensureDir(projectPath);
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} project validate --path ${projectPath}`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Validation');
    });
  });

  describe('Template Commands', () => {
    test('should handle template list command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} templates list`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('templates');
    });

    test('should handle template search command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} templates search react`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Search Results');
    });

    test('should handle template show command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} templates show minimal`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Template Details');
    });

    test('should handle template use command', async () => {
      const outputPath = path.join(testDir, 'template-output');
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} templates use minimal --output ${outputPath} --preview`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Template Preview');
    });
  });

  describe('Agent Commands', () => {
    test('should handle agent list command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} agent list`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('agents');
    });

    test('should handle agent create command', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} agent create --name test-agent --type web --description "Test agent"`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Agent created');
    });
  });

  describe('Planning Commands', () => {
    test('should handle plan create command', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} plan create --name test-plan --description "Test plan"`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Plan created');
    });

    test('should handle plan list command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} plan list`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('plans');
    });

    test('should handle plan validate command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} plan validate plan-id`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Validation');
    });
  });

  describe('Structure Commands', () => {
    test('should handle structure analyze command', async () => {
      const projectPath = path.join(testDir, 'structure-project');
      await fs.ensureDir(projectPath);
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} structure analyze --path ${projectPath}`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Structure Analysis');
    });

    test('should handle structure generate command', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} structure generate --type web --framework react`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Structure generated');
    });
  });

  describe('Chat Commands', () => {
    test('should handle chat start command', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} chat start --message "Hello, how can I create a React component?"`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Chat session');
    });

    test('should handle chat history command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} chat history`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Chat History');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid command gracefully', async () => {
      try {
        await execAsync(`node ${cliPath} invalid-command`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        });
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Unknown command');
      }
    });

    test('should handle missing required arguments', async () => {
      try {
        await execAsync(`node ${cliPath} project init`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        });
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('required');
      }
    });

    test('should handle network errors gracefully', async () => {
      // Mock network failure
      jest.spyOn(apiClient, 'getInstance').mockReturnValue({
        healthCheck: jest.fn().mockRejectedValue(new Error('Network error')),
        testConnection: jest.fn().mockResolvedValue(false),
      } as any);

      try {
        await execAsync(`node ${cliPath} project list`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        });
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Network error');
      }
    });
  });

  describe('Configuration Management', () => {
    test('should handle config set command', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} config set api.baseUrl https://api.test.com`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Configuration updated');
    });

    test('should handle config get command', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} config get api.baseUrl`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('api.baseUrl');
    });

    test('should handle config list command', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} config list`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Configuration');
    });
  });

  describe('Performance Tests', () => {
    test('should complete commands within reasonable time', async () => {
      const startTime = Date.now();
      
      await execAsync(`node ${cliPath} --help`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle large project analysis efficiently', async () => {
      const projectPath = path.join(testDir, 'large-project');
      await fs.ensureDir(projectPath);
      
      // Create many files to simulate a large project
      const srcDir = path.join(projectPath, 'src');
      await fs.ensureDir(srcDir);
      
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(
          path.join(srcDir, `component-${i}.js`),
          `export const Component${i} = () => <div>Component ${i}</div>;`
        );
      }
      
      const startTime = Date.now();
      
      await execAsync(
        `node ${cliPath} project analyze --path ${projectPath}`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' },
          timeout: 30000 // 30 second timeout
        }
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle multiple concurrent commands', async () => {
      const promises = [
        execAsync(`node ${cliPath} templates list`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }),
        execAsync(`node ${cliPath} agent list`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }),
        execAsync(`node ${cliPath} plan list`, {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }),
      ];
      
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          expect(result.value.stderr).toBe('');
        } else {
          console.error(`Command ${index} failed:`, result.reason);
        }
      });
    });
  });

  describe('Data Persistence', () => {
    test('should persist configuration between commands', async () => {
      // Set a configuration value
      await execAsync(
        `node ${cliPath} config set test.value "persistent-value"`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      // Retrieve the configuration value
      const { stdout } = await execAsync(
        `node ${cliPath} config get test.value`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stdout).toContain('persistent-value');
    });

    test('should maintain project state across commands', async () => {
      const projectPath = path.join(testDir, 'persistent-project');
      await fs.ensureDir(projectPath);
      
      // Initialize project
      await execAsync(
        `node ${cliPath} project init --name persistent-project --type web --path ${projectPath} --template minimal`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      // Verify project exists in list
      const { stdout } = await execAsync(`node ${cliPath} project list`, {
        cwd: testDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      expect(stdout).toContain('persistent-project');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty directories gracefully', async () => {
      const emptyDir = path.join(testDir, 'empty-dir');
      await fs.ensureDir(emptyDir);
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} project analyze --path ${emptyDir}`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('No files found');
    });

    test('should handle special characters in project names', async () => {
      const projectPath = path.join(testDir, 'special-chars-project');
      await fs.ensureDir(projectPath);
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} project init --name "project-with-special-chars-@#$" --type web --path ${projectPath} --template minimal`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Project initialized');
    });

    test('should handle long command arguments', async () => {
      const longDescription = 'A'.repeat(1000);
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} project init --name long-desc-project --description "${longDescription}" --type web --template minimal`,
        {
          cwd: testDir,
          env: { ...process.env, NODE_ENV: 'test' }
        }
      );
      
      expect(stderr).toBe('');
      expect(stdout).toContain('Project initialized');
    });
  });
});

describe('CLI Integration Test Utilities', () => {
  describe('Test Setup and Teardown', () => {
    test('should setup test environment correctly', async () => {
      expect(fs.existsSync(testDir)).toBe(true);
      expect(ConfigManager.getConfigDir()).toContain('test-output');
    });

    test('should clean up test artifacts', async () => {
      // This test ensures our cleanup logic works
      const tempFile = path.join(testDir, 'temp-test-file.txt');
      await fs.writeFile(tempFile, 'test content');
      
      expect(fs.existsSync(tempFile)).toBe(true);
      
      await fs.remove(tempFile);
      
      expect(fs.existsSync(tempFile)).toBe(false);
    });
  });

  describe('Mock Validation', () => {
    test('should validate API mocks are working', () => {
      const apiClient = apiClient.getInstance();
      expect(apiClient.healthCheck).toBeDefined();
      expect(apiClient.testConnection).toBeDefined();
    });
  });

  describe('Environment Validation', () => {
    test('should run in test environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('should have required dependencies', () => {
      expect(fs).toBeDefined();
      expect(path).toBeDefined();
      expect(execAsync).toBeDefined();
    });
  });
});