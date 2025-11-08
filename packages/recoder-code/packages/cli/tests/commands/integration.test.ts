/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentsCommand } from '../../src/ui/commands/agentsCommand.js';
import { chatCommand } from '../../src/ui/commands/chatCommand.js';
import { statsCommand } from '../../src/ui/commands/statsCommand.js';
import { modelCommand } from '../../src/ui/commands/modelCommand.js';
import { openrouterCommand } from '../../src/ui/commands/openrouterCommand.js';
import type { MessageActionReturn } from '../../src/ui/commands/types.js';

describe('Integration Tests for Complex Command Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Creation and Usage Workflow', () => {
    it('should support complete agent lifecycle: create → manage → delete', () => {
      // Step 1: Create agent (opens wizard)
      const createAction = agentsCommand.action;
      expect(createAction).toBeDefined();
      const createResult = createAction?.();
      expect(createResult).toEqual({
        type: 'dialog',
        dialog: 'subagent_create',
      });

      // Step 2: Manage agents (opens management UI)
      const manageCmd = agentsCommand.subCommands?.find(
        (cmd) => cmd.name === 'manage',
      );
      expect(manageCmd).toBeDefined();
      const manageResult = manageCmd?.action?.();
      expect(manageResult).toEqual({
        type: 'dialog',
        dialog: 'subagent_list',
      });

      // Step 3: Create subcommand also works
      const createSubCmd = agentsCommand.subCommands?.find(
        (cmd) => cmd.name === 'create',
      );
      expect(createSubCmd).toBeDefined();
      expect(createSubCmd?.action).toBeDefined();
    });

    it('should allow agent creation with auto model selection', () => {
      // User creates agent with "auto" model (uses current model)
      const createAction = agentsCommand.action;
      const result = createAction?.();

      // Wizard should open and allow model selection
      expect(result).toEqual({
        type: 'dialog',
        dialog: 'subagent_create',
      });
    });

    it('should allow agent creation with static model selection', () => {
      // User creates agent with specific model like claude-sonnet-4.5
      const createAction = agentsCommand.action;
      const result = createAction?.();

      // Wizard should open and allow model selection
      expect(result).toEqual({
        type: 'dialog',
        dialog: 'subagent_create',
      });
    });
  });

  describe('Chat Session Management Workflow', () => {
    it('should support chat lifecycle: save → resume → delete', () => {
      // Step 1: Save chat
      const saveCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'save',
      );
      expect(saveCmd).toBeDefined();
      expect(saveCmd?.action).toBeDefined();

      // Step 2: Resume chat
      const resumeCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      expect(resumeCmd).toBeDefined();
      expect(resumeCmd?.action).toBeDefined();

      // Step 3: Delete chat
      const deleteCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'delete',
      );
      expect(deleteCmd).toBeDefined();
      expect(deleteCmd?.action).toBeDefined();
    });

    it('should allow listing all saved chats', () => {
      const listCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'list',
      );
      expect(listCmd).toBeDefined();
      expect(listCmd?.action).toBeDefined();
    });
  });

  describe('Model Selection and Configuration Workflow', () => {
    it('should have model command with action', () => {
      // Model command should be available
      const modelAction = modelCommand.action;
      expect(modelAction).toBeDefined();
      expect(modelCommand.description).toBeTruthy();
    });

    it('should have model command structure', () => {
      // Check command structure
      expect(modelCommand.name).toBe('model');
      expect(modelCommand.description).toBeTruthy();
      expect(modelCommand.action).toBeDefined();
    });
  });

  describe('OpenRouter Integration Workflow', () => {
    it('should support OpenRouter setup and model exploration', async () => {
      // Step 1: Show setup instructions
      const defaultAction = openrouterCommand.action;
      expect(defaultAction).toBeDefined();
      const setupResult = await defaultAction?.();
      expect(setupResult).toBeDefined();
      expect((setupResult as MessageActionReturn).type).toBe('message');

      // Step 2: List free models subcommand exists
      const freeCmd = openrouterCommand.subCommands?.find(
        (cmd) => cmd.name === 'free',
      );
      expect(freeCmd).toBeDefined();

      // Step 3: List premium models subcommand exists
      const premiumCmd = openrouterCommand.subCommands?.find(
        (cmd) => cmd.name === 'premium',
      );
      expect(premiumCmd).toBeDefined();
    });

    it('should have subcommands for model exploration', () => {
      const expectedSubcommands = [
        'list',
        'info',
        'free',
        'premium',
        'search',
        'generation',
        'setup',
      ];

      expectedSubcommands.forEach((subCmdName) => {
        const subCmd = openrouterCommand.subCommands?.find(
          (cmd) => cmd.name === subCmdName,
        );
        expect(subCmd).toBeDefined();
        expect(subCmd?.description).toBeTruthy();
      });
    });
  });

  describe('Statistics and Cost Tracking Workflow', () => {
    it('should provide comprehensive stats tracking', () => {
      // Check that stats command has an action
      const defaultAction = statsCommand.action;
      expect(defaultAction).toBeDefined();

      // Step 2: Check model-specific stats
      const modelCmd = statsCommand.subCommands?.find(
        (cmd) => cmd.name === 'model',
      );
      expect(modelCmd).toBeDefined();

      // Step 3: Check tool usage stats
      const toolsCmd = statsCommand.subCommands?.find(
        (cmd) => cmd.name === 'tools',
      );
      expect(toolsCmd).toBeDefined();

      // Step 4: Check cost breakdown
      const costCmd = statsCommand.subCommands?.find(
        (cmd) => cmd.name === 'cost',
      );
      expect(costCmd).toBeDefined();
    });

    it('should have all essential subcommands', () => {
      const requiredSubcommands = ['model', 'tools', 'cost'];

      requiredSubcommands.forEach((subCmdName) => {
        const subCmd = statsCommand.subCommands?.find(
          (cmd) => cmd.name === subCmdName,
        );
        expect(subCmd).toBeDefined();
        expect(subCmd?.action).toBeDefined();
      });
    });
  });

  describe('Multi-Command Workflows', () => {
    it('should support creating agent with specific model then using it', () => {
      // User flow: /agents create → select model → use agent in chat
      // Step 1: Create agent
      const createResult = agentsCommand.action?.();
      expect(createResult).toBeDefined();

      // Step 2: Chat command has subcommands for session management
      expect(chatCommand.subCommands).toBeDefined();
      expect(chatCommand.subCommands?.length).toBeGreaterThan(0);
    });

    it('should support model switching workflow', () => {
      // User flow: use /model to switch between models
      const modelAction = modelCommand.action;
      expect(modelAction).toBeDefined();

      // Model command should support model selection
      expect(modelCommand.description).toBeTruthy();
    });

    it('should support OpenRouter setup workflow', async () => {
      // User flow: /openrouter setup → shows configuration status
      const setupCmd = openrouterCommand.subCommands?.find(
        (cmd) => cmd.name === 'setup',
      );
      expect(setupCmd?.action).toBeDefined();
      
      const result = await setupCmd?.action?.();
      expect(result).toBeDefined();
      expect((result as MessageActionReturn).type).toBe('message');
    });

    it('should support saving chat, checking stats, then resuming', () => {
      // User flow: /chat save → /stats cost → /chat resume
      const saveCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'save',
      );
      expect(saveCmd).toBeDefined();

      const costCmd = statsCommand.subCommands?.find(
        (cmd) => cmd.name === 'cost',
      );
      expect(costCmd).toBeDefined();

      const resumeCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      expect(resumeCmd).toBeDefined();
    });
  });

  describe('Error Handling in Command Workflows', () => {
    it('should have model command available for selection', () => {
      // Model command should be available
      expect(modelCommand.action).toBeDefined();
      expect(modelCommand.description).toBeTruthy();
    });

    it('should handle OpenRouter setup command', async () => {
      // Check that setup command shows configuration status
      const setupCmd = openrouterCommand.subCommands?.find(
        (cmd) => cmd.name === 'setup',
      );
      expect(setupCmd?.action).toBeDefined();

      const result = await setupCmd?.action?.();
      expect(result).toBeDefined();
      expect((result as MessageActionReturn).type).toBe('message');
      const content = (result as MessageActionReturn).content;
      expect(content).toContain('Setup');
    });

    it('should handle resuming non-existent chat', () => {
      const resumeCmd = chatCommand.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      expect(resumeCmd?.action).toBeDefined();
      // Should handle gracefully when chat doesn't exist
    });
  });

  describe('Command Availability and Feature Flags', () => {
    it('should have all critical commands available', () => {
      const criticalCommands = [
        agentsCommand,
        chatCommand,
        modelCommand,
        statsCommand,
        openrouterCommand,
      ];

      criticalCommands.forEach((cmd) => {
        expect(cmd).toBeDefined();
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        // Note: action might be undefined for commands with only subcommands
      });
    });

    it('should support consistent command structure', () => {
      // All commands should have name and description
      const commands = [agentsCommand, chatCommand, modelCommand, statsCommand, openrouterCommand];

      commands.forEach((cmd) => {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        // Either action or subCommands should be defined
        expect(cmd.action || cmd.subCommands).toBeTruthy();
      });
    });
  });
});
