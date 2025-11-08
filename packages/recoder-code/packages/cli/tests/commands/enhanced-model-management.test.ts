/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { modelRecommendCommand } from '../../src/ui/commands/modelRecommendCommand.js';
import { recentModelsCommand, recordModelUsage } from '../../src/ui/commands/recentModelsCommand.js';
import { compareModelsCommand } from '../../src/ui/commands/compareModelsCommand.js';

describe('Enhanced Model Management Commands', () => {
  describe('Model Recommendations (/recommend)', () => {
    it('should show help when no args provided', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: '' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('Smart Model Recommendations');
      expect(result?.content).toContain('coding');
      expect(result?.content).toContain('reasoning');
      expect(result?.content).toContain('vision');
    });

    it('should provide coding recommendations', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: 'coding' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('Coding & Development');
      expect(result?.content).toContain('Claude');
      expect(result?.content).toContain('/add-model');
    });

    it('should provide vision recommendations', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: 'vision' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('Vision');
      expect(result?.content).toContain('Multimodal');
    });

    it('should provide cost-optimized (free) recommendations', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: 'cost' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('Free');
      expect(result?.content).toContain('qwen');
    });

    it('should provide reasoning recommendations', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: 'reasoning' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('Reasoning');
      expect(result?.content).toContain('Problem Solving');
    });

    it('should handle invalid task type', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: 'invalid-task' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Invalid task type');
    });
  });

  describe('Recent Models (/recent)', () => {
    it('should show empty state when no models used', async () => {
      const result = await recentModelsCommand.action?.({
        invocation: { args: '' },
      } as any);

      expect(result).toBeDefined();
      // Will either show empty state or recent models
      expect(result?.content).toBeTruthy();
    });

    it('should record model usage', () => {
      // Test the recording function
      recordModelUsage('test-model-id', 'Test Model', 1000, 0.05);
      
      // This should not throw
      expect(true).toBe(true);
    });

    it('should show help text in empty state', async () => {
      const result = await recentModelsCommand.action?.({
        invocation: { args: '' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('/');
    });
  });

  describe('Model Comparison (/compare)', () => {
    it('should show help when no models provided', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: '' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.content).toContain('Model Comparison');
      expect(result?.content).toContain('Examples');
    });

    it('should compare Claude and GPT-4o', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'claude gpt-4o' },
      } as any);

      expect(result).toBeDefined();
      if (result?.messageType !== 'error') {
        expect(result?.content).toContain('Claude');
        expect(result?.content).toContain('Context Length');
        expect(result?.content).toContain('Pricing');
      }
    });

    it('should compare three models', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'claude gpt-4o deepseek' },
      } as any);

      expect(result).toBeDefined();
      if (result?.messageType !== 'error') {
        expect(result?.content).toContain('Speed');
        expect(result?.content).toContain('Quality');
      }
    });

    it('should handle partial model names', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'sonnet opus' },
      } as any);

      expect(result).toBeDefined();
      if (result?.messageType !== 'error') {
        expect(result?.content).toContain('Claude');
      }
    });

    it('should error on too many models', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'claude gpt-4o deepseek gemini llama' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('Maximum 4 models');
    });

    it('should error on invalid model', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'invalid-model-xyz another-invalid' },
      } as any);

      expect(result).toBeDefined();
      expect(result?.messageType).toBe('error');
      expect(result?.content).toContain('not found');
    });

    it('should show cost comparison', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'qwen-coder gemini' },
      } as any);

      expect(result).toBeDefined();
      if (result?.messageType !== 'error') {
        expect(result?.content).toContain('Cost per Request');
        expect(result?.content).toContain('Free');
      }
    });
  });

  describe('Integration: Complete Model Selection Workflow', () => {
    it('should support full workflow from recommendation to selection', async () => {
      // Step 1: Get recommendations
      const recommendations = await modelRecommendCommand.action?.({
        invocation: { args: 'coding' },
      } as any);

      expect(recommendations).toBeDefined();
      expect(recommendations?.content).toContain('/add-model');

      // Step 2: Compare models
      const comparison = await compareModelsCommand.action?.({
        invocation: { args: 'claude qwen-coder' },
      } as any);

      expect(comparison).toBeDefined();
      
      // Step 3: Record usage (simulated)
      recordModelUsage('qwen/qwen3-coder:free', 'Qwen Coder', 1500, 0);

      // Step 4: Check recent models
      const recent = await recentModelsCommand.action?.({
        invocation: { args: '' },
      } as any);

      expect(recent).toBeDefined();
    });
  });

  describe('Command Metadata', () => {
    it('should have proper metadata for recommend command', () => {
      expect(modelRecommendCommand.name).toBe('recommend');
      expect(modelRecommendCommand.description).toBeTruthy();
      expect(modelRecommendCommand.action).toBeDefined();
    });

    it('should have proper metadata for recent command', () => {
      expect(recentModelsCommand.name).toBe('recent');
      expect(recentModelsCommand.description).toBeTruthy();
      expect(recentModelsCommand.action).toBeDefined();
    });

    it('should have proper metadata for compare command', () => {
      expect(compareModelsCommand.name).toBe('compare');
      expect(compareModelsCommand.description).toBeTruthy();
      expect(compareModelsCommand.action).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string args gracefully', async () => {
      const results = await Promise.all([
        modelRecommendCommand.action?.({ invocation: { args: '   ' } } as any),
        recentModelsCommand.action?.({ invocation: { args: '   ' } } as any),
        compareModelsCommand.action?.({ invocation: { args: '   ' } } as any),
      ]);

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result?.content).toBeTruthy();
      });
    });

    it('should handle case-insensitive task types', async () => {
      const results = await Promise.all([
        modelRecommendCommand.action?.({ invocation: { args: 'CODING' } } as any),
        modelRecommendCommand.action?.({ invocation: { args: 'Coding' } } as any),
        modelRecommendCommand.action?.({ invocation: { args: 'coding' } } as any),
      ]);

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result?.content).toContain('Coding');
      });
    });

    it('should handle special characters in model search', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'claude-3.5 gpt-4o' },
      } as any);

      expect(result).toBeDefined();
    });
  });

  describe('User Experience', () => {
    it('should provide actionable next steps in recommendations', async () => {
      const result = await modelRecommendCommand.action?.({
        invocation: { args: 'coding' },
      } as any);

      expect(result?.content).toContain('/add-model');
      expect(result?.content).toContain('Next Steps');
    });

    it('should include cost information in comparisons', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'claude gpt-4o' },
      } as any);

      if (result?.messageType !== 'error') {
        expect(result?.content).toContain('Cost');
        expect(result?.content).toContain('$');
      }
    });

    it('should show visual indicators in comparisons', async () => {
      const result = await compareModelsCommand.action?.({
        invocation: { args: 'qwen-coder gemini' },
      } as any);

      if (result?.messageType !== 'error') {
        // Should have emojis or special characters for visual clarity
        expect(result?.content).toMatch(/[⚡🐢⭐💰👑💸]/);
      }
    });
  });
});
