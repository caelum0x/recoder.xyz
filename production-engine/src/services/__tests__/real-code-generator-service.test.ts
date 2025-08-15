/**
 * Tests for Real Code Generator Service
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RealCodeGeneratorService } from '../real-code-generator-service';
import type { CodeGenerationRequest } from '../real-code-generator-service';

describe('RealCodeGeneratorService', () => {
  let service: RealCodeGeneratorService;

  beforeEach(() => {
    service = new RealCodeGeneratorService();
  });

  describe('initialization', () => {
    it('should create an instance', () => {
      expect(service).toBeInstanceOf(RealCodeGeneratorService);
    });

    it('should have required methods', () => {
      expect(typeof service.generateCode).toBe('function');
      expect(typeof service.getAvailableProviders).toBe('function');
      expect(typeof service.scanProjectCompliance).toBe('function');
    });
  });

  describe('generateCode', () => {
    it('should generate code for web application', async () => {
      const request: CodeGenerationRequest = {
        description: 'Create a simple React todo app',
        type: 'web',
        framework: 'react',
        features: ['add-todo', 'remove-todo', 'mark-complete'],
        outputPath: '/tmp/test-output',
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.instructions).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.provider).toBeDefined();
      expect(result.metadata.model).toBeDefined();
    });

    it('should generate code for blockchain application', async () => {
      const request: CodeGenerationRequest = {
        description: 'Create a Solana token swap smart contract',
        type: 'blockchain',
        framework: 'solana',
        features: ['token-swap', 'liquidity-pool'],
        outputPath: '/tmp/test-blockchain',
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.some(f => f.type === 'code')).toBe(true);
    });

    it('should generate code for backend API', async () => {
      const request: CodeGenerationRequest = {
        description: 'Create a REST API for user management',
        type: 'backend',
        framework: 'express',
        features: ['authentication', 'user-crud', 'jwt'],
        outputPath: '/tmp/test-backend',
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.securityValidation).toBeDefined();
      expect(result.securityValidation?.securityScore).toBeGreaterThanOrEqual(0);
    });

    it('should include security validation results', async () => {
      const request: CodeGenerationRequest = {
        description: 'Create a secure payment processing API',
        type: 'backend',
        outputPath: '/tmp/test-secure',
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.securityValidation).toBeDefined();
      expect(result.securityValidation?.vulnerabilities).toBeDefined();
      expect(result.securityValidation?.secrets).toBeDefined();
      expect(result.securityValidation?.recommendations).toBeDefined();
    });

    it('should include compliance validation when enabled', async () => {
      const request: CodeGenerationRequest = {
        description: 'Create a HIPAA compliant healthcare API',
        type: 'backend',
        outputPath: '/tmp/test-compliance',
        userId: 'test-user',
        compliance: {
          enabled: true,
          enforceBlocking: false,
          autoRemediation: true
        }
      };

      const result = await service.generateCode(request);

      expect(result.complianceValidation).toBeDefined();
      expect(result.blockedByCompliance).toBe(false);
    });

    it('should block generation when compliance violations are critical', async () => {
      // Mock compliance service to return critical violations
      const mockComplianceService = {
        validateSingleFile: jest.fn().mockResolvedValue({
          passed: false,
          report: {
            summary: {
              overallScore: 30,
              criticalViolations: 3,
              highViolations: 5
            },
            violations: [
              { severity: 'critical', description: 'Critical security issue' }
            ]
          },
          blockedByCompliance: true,
          recommendations: ['Fix critical issues before deployment']
        })
      };

      // Override the compliance service for this test
      (service as any).complianceService = mockComplianceService;

      const request: CodeGenerationRequest = {
        description: 'Create insecure code',
        type: 'backend',
        outputPath: '/tmp/test-blocked',
        userId: 'test-user',
        compliance: {
          enabled: true,
          enforceBlocking: true
        }
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(false);
      expect(result.blockedByCompliance).toBe(true);
      expect(result.error).toContain('compliance');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return available AI providers', async () => {
      const providers = await service.getAvailableProviders();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });
  });

  describe('compliance management', () => {
    it('should scan project for compliance', async () => {
      const projectPath = '/tmp/test-project';
      
      const result = await service.scanProjectCompliance(projectPath);

      expect(result).toBeDefined();
      expect(result instanceof Map).toBe(true);
    });

    it('should generate compliance dashboard', async () => {
      const projectPath = '/tmp/test-project';
      
      const dashboard = await service.generateComplianceDashboard(projectPath);

      expect(typeof dashboard).toBe('string');
      expect(dashboard.length).toBeGreaterThan(0);
    });

    it('should update compliance configuration', () => {
      const newConfig = {
        enabled: false,
        enforceBlocking: true
      };

      expect(() => {
        service.updateComplianceConfiguration(newConfig);
      }).not.toThrow();
    });

    it('should get current compliance configuration', () => {
      const config = service.getComplianceConfiguration();

      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
    });
  });

  describe('error handling', () => {
    it('should handle invalid output paths', async () => {
      const request: CodeGenerationRequest = {
        description: 'Create a React app',
        type: 'web',
        outputPath: '', // Invalid empty path
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing description', async () => {
      const request: CodeGenerationRequest = {
        description: '', // Empty description
        type: 'web',
        outputPath: '/tmp/test',
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle AI provider failures gracefully', async () => {
      // Mock AI hub to throw an error
      const mockAIHub = {
        generateWithBestModel: jest.fn().mockRejectedValue(new Error('AI provider error'))
      };

      (service as any).aiHub = mockAIHub;

      const request: CodeGenerationRequest = {
        description: 'Create a React app',
        type: 'web',
        outputPath: '/tmp/test',
        userId: 'test-user'
      };

      const result = await service.generateCode(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI provider error');
    });
  });
});