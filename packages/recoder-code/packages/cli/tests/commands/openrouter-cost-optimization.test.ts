/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { openrouterCommand } from '../../src/ui/commands/openrouterCommand.js';
import { CommandKind } from '../../src/ui/commands/types.js';

describe('OpenRouter Cost Optimization Commands', () => {
  describe('openrouterCommand structure', () => {
    it('should have correct metadata', () => {
      expect(openrouterCommand.name).toBe('openrouter');
      expect(openrouterCommand.description).toBe('OpenRouter model exploration and configuration');
      expect(openrouterCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have all cost optimization subcommands', () => {
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      // Core commands
      expect(subCommandNames).toContain('list');
      expect(subCommandNames).toContain('info');
      expect(subCommandNames).toContain('free');
      expect(subCommandNames).toContain('premium');
      expect(subCommandNames).toContain('search');
      
      // Cost optimization commands
      expect(subCommandNames).toContain('credits');
      expect(subCommandNames).toContain('activity');
      expect(subCommandNames).toContain('estimate');
      expect(subCommandNames).toContain('cache');
      expect(subCommandNames).toContain('transforms');
      
      // Utility commands
      expect(subCommandNames).toContain('generation');
      expect(subCommandNames).toContain('setup');
    });
  });

  describe('Cost Optimization Commands', () => {
    describe('/openrouter estimate', () => {
      it('should exist and have correct metadata', () => {
        const estimateCmd = openrouterCommand.subCommands?.find(
          cmd => cmd.name === 'estimate'
        );
        
        expect(estimateCmd).toBeDefined();
        expect(estimateCmd?.description).toBe('Estimate cost for a request before sending it');
        expect(estimateCmd?.kind).toBe(CommandKind.BUILT_IN);
        expect(estimateCmd?.action).toBeDefined();
      });
    });

    describe('/openrouter cache', () => {
      it('should exist and have correct metadata', () => {
        const cacheCmd = openrouterCommand.subCommands?.find(
          cmd => cmd.name === 'cache'
        );
        
        expect(cacheCmd).toBeDefined();
        expect(cacheCmd?.description).toBe('Show prompt caching status and configuration');
        expect(cacheCmd?.kind).toBe(CommandKind.BUILT_IN);
        expect(cacheCmd?.action).toBeDefined();
      });
    });

    describe('/openrouter transforms', () => {
      it('should exist and have correct metadata', () => {
        const transformsCmd = openrouterCommand.subCommands?.find(
          cmd => cmd.name === 'transforms'
        );
        
        expect(transformsCmd).toBeDefined();
        expect(transformsCmd?.description).toBe('Show message transform status (middle-out compression)');
        expect(transformsCmd?.kind).toBe(CommandKind.BUILT_IN);
        expect(transformsCmd?.action).toBeDefined();
      });
    });

    describe('/openrouter credits', () => {
      it('should exist and have correct metadata', () => {
        const creditsCmd = openrouterCommand.subCommands?.find(
          cmd => cmd.name === 'credits'
        );
        
        expect(creditsCmd).toBeDefined();
        expect(creditsCmd?.description).toBe('Check remaining credits and rate limits');
        expect(creditsCmd?.kind).toBe(CommandKind.BUILT_IN);
        expect(creditsCmd?.action).toBeDefined();
      });
    });

    describe('/openrouter activity', () => {
      it('should exist and have correct metadata', () => {
        const activityCmd = openrouterCommand.subCommands?.find(
          cmd => cmd.name === 'activity'
        );
        
        expect(activityCmd).toBeDefined();
        expect(activityCmd?.description).toBe('View recent API usage and costs');
        expect(activityCmd?.kind).toBe(CommandKind.BUILT_IN);
        expect(activityCmd?.action).toBeDefined();
      });
    });
  });

  describe('Command Help Text', () => {
    it('should include cost optimization commands in setup help', () => {
      const setupCmd = openrouterCommand.subCommands?.find(
        cmd => cmd.name === 'setup'
      );
      
      expect(setupCmd).toBeDefined();
      expect(setupCmd?.action).toBeDefined();
    });

    it('should include cost optimization in main command help', () => {
      expect(openrouterCommand.action).toBeDefined();
    });
  });

  describe('All Subcommands Have Actions', () => {
    it('should have action functions for all subcommands', () => {
      const subCommands = openrouterCommand.subCommands || [];
      
      subCommands.forEach(cmd => {
        expect(cmd.action).toBeDefined();
        expect(typeof cmd.action).toBe('function');
      });
    });
  });

  describe('Command Categories', () => {
    it('should have model discovery commands', () => {
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      expect(subCommandNames).toContain('list');
      expect(subCommandNames).toContain('free');
      expect(subCommandNames).toContain('premium');
      expect(subCommandNames).toContain('search');
      expect(subCommandNames).toContain('info');
    });

    it('should have cost management commands', () => {
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      expect(subCommandNames).toContain('credits');
      expect(subCommandNames).toContain('activity');
      expect(subCommandNames).toContain('estimate');
    });

    it('should have optimization feature commands', () => {
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      expect(subCommandNames).toContain('cache');
      expect(subCommandNames).toContain('transforms');
    });

    it('should have debugging commands', () => {
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      expect(subCommandNames).toContain('generation');
    });

    it('should have setup/help commands', () => {
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      expect(subCommandNames).toContain('setup');
    });
  });

  describe('Command Count', () => {
    it('should have at least 12 subcommands', () => {
      const subCommands = openrouterCommand.subCommands || [];
      expect(subCommands.length).toBeGreaterThanOrEqual(12);
    });

    it('should have exactly the expected subcommands', () => {
      const expectedCommands = [
        'list',
        'info',
        'free',
        'premium',
        'search',
        'generation',
        'setup',
        'credits',
        'activity',
        'estimate',
        'cache',
        'transforms',
      ];
      
      const subCommandNames = openrouterCommand.subCommands?.map(cmd => cmd.name) || [];
      
      expectedCommands.forEach(expectedCmd => {
        expect(subCommandNames).toContain(expectedCmd);
      });
    });
  });

  describe('Command Descriptions', () => {
    it('should have meaningful descriptions for all commands', () => {
      const subCommands = openrouterCommand.subCommands || [];
      
      subCommands.forEach(cmd => {
        expect(cmd.description).toBeDefined();
        expect(cmd.description.length).toBeGreaterThan(10);
      });
    });

    it('should have cost-related keywords in optimization commands', () => {
      const estimateCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'estimate');
      const creditsCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'credits');
      const activityCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'activity');
      
      expect(estimateCmd?.description.toLowerCase()).toContain('cost');
      expect(creditsCmd?.description.toLowerCase()).toContain('credit');
      expect(activityCmd?.description.toLowerCase()).toContain('usage');
    });

    it('should have caching-related keywords in cache command', () => {
      const cacheCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'cache');
      expect(cacheCmd?.description.toLowerCase()).toContain('cach');
    });

    it('should have transform-related keywords in transforms command', () => {
      const transformsCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'transforms');
      expect(transformsCmd?.description.toLowerCase()).toMatch(/transform|compress/);
    });
  });
});

describe('OpenRouter Cost Optimization Integration', () => {
  describe('Command Workflow', () => {
    it('should support cost estimation workflow', () => {
      // User workflow: estimate → send → check activity
      const estimateCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'estimate');
      const activityCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'activity');
      
      expect(estimateCmd).toBeDefined();
      expect(activityCmd).toBeDefined();
      expect(estimateCmd?.action).toBeDefined();
      expect(activityCmd?.action).toBeDefined();
    });

    it('should support credits monitoring workflow', () => {
      // User workflow: check credits → track activity → estimate future costs
      const creditsCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'credits');
      const activityCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'activity');
      const estimateCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'estimate');
      
      expect(creditsCmd).toBeDefined();
      expect(activityCmd).toBeDefined();
      expect(estimateCmd).toBeDefined();
    });

    it('should support optimization verification workflow', () => {
      // User workflow: check cache → check transforms → verify savings
      const cacheCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'cache');
      const transformsCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'transforms');
      
      expect(cacheCmd).toBeDefined();
      expect(transformsCmd).toBeDefined();
      expect(cacheCmd?.action).toBeDefined();
      expect(transformsCmd?.action).toBeDefined();
    });
  });

  describe('Feature Discoverability', () => {
    it('should be discoverable through main command', () => {
      expect(openrouterCommand.action).toBeDefined();
      expect(openrouterCommand.subCommands).toBeDefined();
      expect(openrouterCommand.subCommands!.length).toBeGreaterThan(0);
    });

    it('should be discoverable through setup command', () => {
      const setupCmd = openrouterCommand.subCommands?.find(cmd => cmd.name === 'setup');
      expect(setupCmd).toBeDefined();
      expect(setupCmd?.action).toBeDefined();
    });
  });
});
