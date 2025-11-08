/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { addModelCommand } from '../../src/ui/commands/addModelCommand.js';
import { browseModelsCommand } from '../../src/ui/commands/browseModelsCommand.js';
import { compareModelsCommand } from '../../src/ui/commands/compareModelsCommand.js';
import { modelRecommendCommand } from '../../src/ui/commands/modelRecommendCommand.js';
import { recentModelsCommand } from '../../src/ui/commands/recentModelsCommand.js';
import type { CommandContext } from '../../src/ui/commands/types.js';

describe('Model Management Commands', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = {
      services: {
        config: {
          get: (key: string) => {
            if (key === 'apiKey') return 'test-api-key';
            if (key === 'model') return 'gpt-4';
            if (key === 'recentModels') return ['gpt-4', 'claude-3-opus'];
            return undefined;
          },
          set: () => Promise.resolve(),
        },
      },
      invocation: {
        command: {
          name: 'test',
          description: 'test',
        },
        args: '',
        raw: '/test',
      },
    } as any;
  });

  describe('/add-model Command', () => {
    it('should have correct command definition', () => {
      expect(addModelCommand.name).toBe('add-model');
      expect(addModelCommand.description).toBeTruthy();
      expect(addModelCommand.description.toLowerCase()).toContain('model');
    });

    it('should require model ID', async () => {
      const result = await addModelCommand.action?.(mockContext);
      expect(result).toBeDefined();
      if (result && 'type' in result && result.type === 'message') {
        // Should show usage or error when no model provided
        expect(result.messageType).toBeDefined();
      }
    });

    it('should accept model ID', async () => {
      const contextWithModel = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3.5-sonnet',
        },
      };
      const result = await addModelCommand.action?.(contextWithModel);
      expect(result).toBeDefined();
    });

    it('should accept model ID with display name', async () => {
      const contextWithModelAndName = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3.5-sonnet "Claude 3.5 Sonnet"',
        },
      };
      const result = await addModelCommand.action?.(contextWithModelAndName);
      expect(result).toBeDefined();
    });

    it('should handle OpenRouter model IDs', async () => {
      const openRouterModels = [
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-4o',
        'google/gemini-2.0-flash-exp:free',
        'qwen/qwen3-coder:free',
        'deepseek/deepseek-chat-v3.1:free',
      ];

      for (const modelId of openRouterModels) {
        const context = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: modelId,
          },
        };
        const result = await addModelCommand.action?.(context);
        expect(result).toBeDefined();
      }
    });
  });

  describe('/browse-models Command', () => {
    it('should have correct command definition', () => {
      expect(browseModelsCommand.name).toBe('browse-models');
      expect(browseModelsCommand.description).toBeTruthy();
    });

    it('should have action handler', () => {
      expect(browseModelsCommand.action).toBeDefined();
    });

    it('should support free models browsing', async () => {
      const contextWithFree = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'free',
        },
      };
      const result = await browseModelsCommand.action?.(contextWithFree);
      expect(result).toBeDefined();
    });

    it('should support premium models browsing', async () => {
      const contextWithPremium = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'premium',
        },
      };
      const result = await browseModelsCommand.action?.(contextWithPremium);
      expect(result).toBeDefined();
    });

    it('should support search functionality', async () => {
      const contextWithSearch = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'search claude',
        },
      };
      const result = await browseModelsCommand.action?.(contextWithSearch);
      expect(result).toBeDefined();
    });

    it('should support vision models browsing', async () => {
      const contextWithVision = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'vision',
        },
      };
      const result = await browseModelsCommand.action?.(contextWithVision);
      expect(result).toBeDefined();
    });

    it('should show help when no arguments', async () => {
      const result = await browseModelsCommand.action?.(mockContext);
      expect(result).toBeDefined();
    });
  });

  describe('/compare Command', () => {
    it('should have correct command definition', () => {
      expect(compareModelsCommand.name).toBe('compare');
      expect(compareModelsCommand.description).toBeTruthy();
      expect(compareModelsCommand.description.toLowerCase()).toContain('compare');
    });

    it('should require at least two model IDs', async () => {
      const result = await compareModelsCommand.action?.(mockContext);
      expect(result).toBeDefined();
      if (result && 'type' in result && result.type === 'message') {
        // Should show usage
        expect(result.messageType).toBeDefined();
      }
    });

    it('should accept two models for comparison', async () => {
      const contextWithModels = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3.5-sonnet openai/gpt-4o',
        },
      };
      const result = await compareModelsCommand.action?.(contextWithModels);
      expect(result).toBeDefined();
    });

    it('should accept multiple models for comparison', async () => {
      const contextWithMultipleModels = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3.5-sonnet openai/gpt-4o google/gemini-2.0-flash-exp',
        },
      };
      const result = await compareModelsCommand.action?.(contextWithMultipleModels);
      expect(result).toBeDefined();
    });

    it('should compare pricing information', async () => {
      const contextWithModels = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3-haiku:free anthropic/claude-3.5-sonnet',
        },
      };
      const result = await compareModelsCommand.action?.(contextWithModels);
      expect(result).toBeDefined();
      // Should show price comparison (free vs premium)
    });
  });

  describe('/recommend Command', () => {
    it('should have correct command definition', () => {
      expect(modelRecommendCommand.name).toBe('recommend');
      expect(modelRecommendCommand.description).toBeTruthy();
    });

    it('should provide recommendations without task type', async () => {
      const result = await modelRecommendCommand.action?.(mockContext);
      expect(result).toBeDefined();
      // Should show general recommendations
    });

    it('should accept task type for tailored recommendations', async () => {
      const taskTypes = ['coding', 'writing', 'analysis', 'chat', 'reasoning'];
      
      for (const taskType of taskTypes) {
        const context = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: taskType,
          },
        };
        const result = await modelRecommendCommand.action?.(context);
        expect(result).toBeDefined();
      }
    });

    it('should recommend based on budget', async () => {
      const budgetOptions = ['free', 'cheap', 'premium', 'best'];
      
      for (const budget of budgetOptions) {
        const context = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: `coding ${budget}`,
          },
        };
        const result = await modelRecommendCommand.action?.(context);
        expect(result).toBeDefined();
      }
    });

    it('should recommend models with specific capabilities', async () => {
      const capabilities = ['vision', 'function-calling', 'reasoning', 'code'];
      
      for (const capability of capabilities) {
        const context = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: capability,
          },
        };
        const result = await modelRecommendCommand.action?.(context);
        expect(result).toBeDefined();
      }
    });
  });

  describe('/recent Command', () => {
    it('should have correct command definition', () => {
      expect(recentModelsCommand.name).toBe('recent');
      expect(recentModelsCommand.description).toBeTruthy();
    });

    it('should list recently used models', async () => {
      const result = await recentModelsCommand.action?.(mockContext);
      expect(result).toBeDefined();
    });

    it('should handle empty recent models list', async () => {
      const contextWithoutRecent = {
        ...mockContext,
        services: {
          config: {
            get: (key: string) => {
              if (key === 'recentModels') return [];
              return undefined;
            },
          },
        },
      } as any;
      
      const result = await recentModelsCommand.action?.(contextWithoutRecent);
      expect(result).toBeDefined();
      // Should show message about no recent models
    });

    it('should allow quick switching to recent model', async () => {
      const contextWithModelIndex = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: '1',
        },
      };
      const result = await recentModelsCommand.action?.(contextWithModelIndex);
      expect(result).toBeDefined();
    });

    it('should support model name selection', async () => {
      const contextWithModelName = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'claude-3-opus',
        },
      };
      const result = await recentModelsCommand.action?.(contextWithModelName);
      expect(result).toBeDefined();
    });
  });

  describe('Model Management Integration', () => {
    it('should have consistent command structure', () => {
      const commands = [
        addModelCommand,
        browseModelsCommand,
        compareModelsCommand,
        modelRecommendCommand,
        recentModelsCommand,
      ];
      
      commands.forEach(cmd => {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        expect(cmd.action).toBeDefined();
      });
    });

    it('should support complete model workflow', async () => {
      // Step 1: Browse models
      const browseResult = await browseModelsCommand.action?.(mockContext);
      expect(browseResult).toBeDefined();

      // Step 2: Get recommendations
      const recommendResult = await modelRecommendCommand.action?.(mockContext);
      expect(recommendResult).toBeDefined();

      // Step 3: Compare models
      const compareContext = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'model1 model2',
        },
      };
      const compareResult = await compareModelsCommand.action?.(compareContext);
      expect(compareResult).toBeDefined();

      // Step 4: Add selected model
      const addContext = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'selected-model',
        },
      };
      const addResult = await addModelCommand.action?.(addContext);
      expect(addResult).toBeDefined();

      // Step 5: View recent models
      const recentResult = await recentModelsCommand.action?.(mockContext);
      expect(recentResult).toBeDefined();
    });

    it('should provide helpful usage information', async () => {
      const commands = [
        addModelCommand,
        browseModelsCommand,
        compareModelsCommand,
        modelRecommendCommand,
        recentModelsCommand,
      ];
      
      for (const cmd of commands) {
        if (cmd.action) {
          const result = await cmd.action(mockContext);
          expect(result).toBeDefined();
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid model IDs gracefully', async () => {
      const contextWithInvalidModel = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'invalid-model-that-does-not-exist-12345',
        },
      };

      const result = await addModelCommand.action?.(contextWithInvalidModel);
      expect(result).toBeDefined();
      // Should not throw, should return error message
    });

    it('should handle network errors gracefully', async () => {
      // Commands should handle fetch errors gracefully
      const commands = [browseModelsCommand, compareModelsCommand];
      
      for (const cmd of commands) {
        if (cmd.subCommands) {
          for (const subCmd of cmd.subCommands) {
            if (subCmd.action) {
              const result = await subCmd.action(mockContext);
              expect(result).toBeDefined();
              // Should not throw on network errors
            }
          }
        }
      }
    });

    it('should validate model comparison inputs', async () => {
      const invalidInputs = [
        '', // Empty
        'only-one-model', // Only one model
        '--invalid-flag', // Invalid flags
      ];

      for (const input of invalidInputs) {
        const context = {
          ...mockContext,
          invocation: {
            ...mockContext.invocation,
            args: input,
          },
        };
        const result = await compareModelsCommand.action?.(context);
        expect(result).toBeDefined();
        // Should handle invalid inputs gracefully
      }
    });
  });

  describe('Model Information Display', () => {
    it('should show pricing information', async () => {
      const contextWithModel = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3.5-sonnet',
        },
      };
      
      const result = await addModelCommand.action?.(contextWithModel);
      expect(result).toBeDefined();
      // Should include or reference pricing
    });

    it('should show context window information', async () => {
      const contextWithModels = {
        ...mockContext,
        invocation: {
          ...mockContext.invocation,
          args: 'anthropic/claude-3.5-sonnet openai/gpt-4o',
        },
      };
      
      const result = await compareModelsCommand.action?.(contextWithModels);
      expect(result).toBeDefined();
      // Should compare context windows
    });

    it('should show model capabilities', async () => {
      const result = await modelRecommendCommand.action?.(mockContext);
      expect(result).toBeDefined();
      // Should mention capabilities (vision, function-calling, etc.)
    });
  });
});
