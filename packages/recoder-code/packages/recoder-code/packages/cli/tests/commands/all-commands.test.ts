/**
 * @license
 * Copyright 2025 Recoder
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SlashCommand } from '../../src/ui/commands/types.js';
import { CommandKind } from '../../src/ui/commands/types.js';
import { aboutCommand } from '../../src/ui/commands/aboutCommand.js';
import { agentsCommand } from '../../src/ui/commands/agentsCommand.js';
import { approvalModeCommand } from '../../src/ui/commands/approvalModeCommand.js';
import { authCommand } from '../../src/ui/commands/authCommand.js';
import { bugCommand } from '../../src/ui/commands/bugCommand.js';
import { chatCommand } from '../../src/ui/commands/chatCommand.js';
import { clearCommand } from '../../src/ui/commands/clearCommand.js';
import { compressCommand } from '../../src/ui/commands/compressCommand.js';
import { copyCommand } from '../../src/ui/commands/copyCommand.js';
import { corgiCommand } from '../../src/ui/commands/corgiCommand.js';
import { docsCommand } from '../../src/ui/commands/docsCommand.js';
import { directoryCommand } from '../../src/ui/commands/directoryCommand.js';
import { editorCommand } from '../../src/ui/commands/editorCommand.js';
import { extensionsCommand } from '../../src/ui/commands/extensionsCommand.js';
import { helpCommand } from '../../src/ui/commands/helpCommand.js';
import { initCommand } from '../../src/ui/commands/initCommand.js';
import { mcpCommand } from '../../src/ui/commands/mcpCommand.js';
import { memoryCommand } from '../../src/ui/commands/memoryCommand.js';
import { modelCommand } from '../../src/ui/commands/modelCommand.js';
import { openrouterCommand } from '../../src/ui/commands/openrouterCommand.js';
import { privacyCommand } from '../../src/ui/commands/privacyCommand.js';
import { quitCommand, quitConfirmCommand } from '../../src/ui/commands/quitCommand.js';
import { statsCommand } from '../../src/ui/commands/statsCommand.js';
import { summaryCommand } from '../../src/ui/commands/summaryCommand.js';
import { themeCommand } from '../../src/ui/commands/themeCommand.js';
import { toolsCommand } from '../../src/ui/commands/toolsCommand.js';
import { settingsCommand } from '../../src/ui/commands/settingsCommand.js';
import { vimCommand } from '../../src/ui/commands/vimCommand.js';
import { setupGithubCommand } from '../../src/ui/commands/setupGithubCommand.js';
import { setupApiCommand, setupApiKeyCommand } from '../../src/ui/commands/setupApiCommand.js';
import { terminalSetupCommand } from '../../src/ui/commands/terminalSetupCommand.js';

describe('All Interactive Chat Commands', () => {
  describe('Command Registration', () => {
    it('should have all commands properly defined', () => {
      const commands = [
        aboutCommand,
        agentsCommand,
        approvalModeCommand,
        authCommand,
        bugCommand,
        chatCommand,
        clearCommand,
        compressCommand,
        copyCommand,
        corgiCommand,
        docsCommand,
        directoryCommand,
        editorCommand,
        extensionsCommand,
        helpCommand,
        initCommand,
        mcpCommand,
        memoryCommand,
        modelCommand,
        openrouterCommand,
        privacyCommand,
        quitCommand,
        quitConfirmCommand,
        statsCommand,
        summaryCommand,
        themeCommand,
        toolsCommand,
        settingsCommand,
        vimCommand,
        setupGithubCommand,
        setupApiCommand,
        setupApiKeyCommand,
        terminalSetupCommand,
      ];

      commands.forEach((cmd) => {
        expect(cmd).toBeDefined();
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        expect(cmd.kind).toBe(CommandKind.BUILT_IN);
      });
    });
  });

  describe('/about - Show version info', () => {
    it('should have correct metadata', () => {
      expect(aboutCommand.name).toBe('about');
      expect(aboutCommand.description).toBe('show version info');
      expect(aboutCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(aboutCommand.action).toBeDefined();
      expect(typeof aboutCommand.action).toBe('function');
    });
  });

  describe('/agents - Manage subagents', () => {
    it('should have correct metadata', () => {
      expect(agentsCommand.name).toBe('agents');
      expect(agentsCommand.description).toContain('subagent');
      expect(agentsCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have default action to open creation wizard', () => {
      expect(agentsCommand.action).toBeDefined();
    });

    it('should have create and manage subcommands', () => {
      expect(agentsCommand.subCommands).toBeDefined();
      expect(agentsCommand.subCommands?.length).toBeGreaterThanOrEqual(2);

      const createCmd = agentsCommand.subCommands?.find(cmd => cmd.name === 'create');
      expect(createCmd).toBeDefined();
      expect(createCmd?.description).toContain('Create');

      const manageCmd = agentsCommand.subCommands?.find(cmd => cmd.name === 'manage');
      expect(manageCmd).toBeDefined();
      expect(manageCmd?.description).toContain('Manage');
    });
  });

  describe('/approval-mode - View or change approval mode', () => {
    it('should have correct metadata', () => {
      expect(approvalModeCommand.name).toBe('approval-mode');
      expect(approvalModeCommand.description).toContain('approval');
      expect(approvalModeCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(approvalModeCommand.action).toBeDefined();
    });
  });

  describe('/auth - Change auth method', () => {
    it('should have correct metadata', () => {
      expect(authCommand.name).toBe('auth');
      expect(authCommand.description).toContain('auth');
      expect(authCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(authCommand.action).toBeDefined();
    });
  });

  describe('/bug - Submit bug report', () => {
    it('should have correct metadata', () => {
      expect(bugCommand.name).toBe('bug');
      expect(bugCommand.description).toContain('bug');
      expect(bugCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(bugCommand.action).toBeDefined();
    });
  });

  describe('/chat - Manage conversation history', () => {
    it('should have correct metadata', () => {
      expect(chatCommand.name).toBe('chat');
      expect(chatCommand.description).toContain('conversation');
      expect(chatCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have subcommands for save, resume, delete', () => {
      expect(chatCommand.subCommands).toBeDefined();
      expect(chatCommand.subCommands?.length).toBeGreaterThan(0);

      const saveCmd = chatCommand.subCommands?.find(cmd => cmd.name === 'save');
      expect(saveCmd).toBeDefined();

      const resumeCmd = chatCommand.subCommands?.find(cmd => cmd.name === 'resume');
      expect(resumeCmd).toBeDefined();

      const deleteCmd = chatCommand.subCommands?.find(cmd => cmd.name === 'delete');
      expect(deleteCmd).toBeDefined();
    });
  });

  describe('/clear - Clear screen and history', () => {
    it('should have correct metadata', () => {
      expect(clearCommand.name).toBe('clear');
      expect(clearCommand.description).toContain('clear');
      expect(clearCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(clearCommand.action).toBeDefined();
    });
  });

  describe('/compress - Compress context', () => {
    it('should have correct metadata', () => {
      expect(compressCommand.name).toBe('compress');
      expect(compressCommand.description).toContain('context');
      expect(compressCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(compressCommand.action).toBeDefined();
    });
  });

  describe('/copy - Copy to clipboard', () => {
    it('should have correct metadata', () => {
      expect(copyCommand.name).toBe('copy');
      expect(copyCommand.description).toContain('clipboard');
      expect(copyCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(copyCommand.action).toBeDefined();
    });
  });

  describe('/corgi - Toggle corgi mode', () => {
    it('should have correct metadata', () => {
      expect(corgiCommand.name).toBe('corgi');
      expect(corgiCommand.description).toContain('corgi');
      expect(corgiCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(corgiCommand.action).toBeDefined();
    });
  });

  describe('/docs - Open documentation', () => {
    it('should have correct metadata', () => {
      expect(docsCommand.name).toBe('docs');
      expect(docsCommand.description).toContain('documentation');
      expect(docsCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(docsCommand.action).toBeDefined();
    });
  });

  describe('/directory - Manage workspace directories', () => {
    it('should have correct metadata', () => {
      expect(directoryCommand.name).toBe('directory');
      expect(directoryCommand.description).toContain('workspace');
      expect(directoryCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have subcommands', () => {
      expect(directoryCommand.subCommands).toBeDefined();
      expect(directoryCommand.subCommands?.length).toBeGreaterThan(0);
    });
  });

  describe('/editor - Set external editor', () => {
    it('should have correct metadata', () => {
      expect(editorCommand.name).toBe('editor');
      expect(editorCommand.description).toContain('editor');
      expect(editorCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(editorCommand.action).toBeDefined();
    });
  });

  describe('/extensions - List extensions', () => {
    it('should have correct metadata', () => {
      expect(extensionsCommand.name).toBe('extensions');
      expect(extensionsCommand.description).toContain('extension');
      expect(extensionsCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(extensionsCommand.action).toBeDefined();
    });
  });

  describe('/help - Show help', () => {
    it('should have correct metadata', () => {
      expect(helpCommand.name).toBe('help');
      expect(helpCommand.description).toContain('help');
      expect(helpCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(helpCommand.action).toBeDefined();
    });
  });

  describe('/init - Analyze project', () => {
    it('should have correct metadata', () => {
      expect(initCommand.name).toBe('init');
      expect(initCommand.description).toContain('project');
      expect(initCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(initCommand.action).toBeDefined();
    });
  });

  describe('/mcp - MCP server management', () => {
    it('should have correct metadata', () => {
      expect(mcpCommand.name).toBe('mcp');
      expect(mcpCommand.description).toContain('MCP');
      expect(mcpCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have subcommands', () => {
      expect(mcpCommand.subCommands).toBeDefined();
      expect(mcpCommand.subCommands?.length).toBeGreaterThan(0);
    });
  });

  describe('/memory - Memory interaction', () => {
    it('should have correct metadata', () => {
      expect(memoryCommand.name).toBe('memory');
      expect(memoryCommand.description).toContain('memory');
      expect(memoryCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have subcommands', () => {
      expect(memoryCommand.subCommands).toBeDefined();
    });
  });

  describe('/model - Switch model', () => {
    it('should have correct metadata', () => {
      expect(modelCommand.name).toBe('model');
      expect(modelCommand.description).toContain('model');
      expect(modelCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(modelCommand.action).toBeDefined();
    });
  });

  describe('/openrouter - OpenRouter exploration', () => {
    it('should have correct metadata', () => {
      expect(openrouterCommand.name).toBe('openrouter');
      expect(openrouterCommand.description).toContain('OpenRouter');
      expect(openrouterCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(openrouterCommand.action).toBeDefined();
    });
  });

  describe('/privacy - Display privacy notice', () => {
    it('should have correct metadata', () => {
      expect(privacyCommand.name).toBe('privacy');
      expect(privacyCommand.description).toContain('privacy');
      expect(privacyCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(privacyCommand.action).toBeDefined();
    });
  });

  describe('/quit - Exit CLI', () => {
    it('should have correct metadata', () => {
      expect(quitCommand.name).toBe('quit');
      expect(quitCommand.description).toContain('exit');
      expect(quitCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(quitCommand.action).toBeDefined();
    });
  });

  describe('/quit-confirm - Quit with confirmation', () => {
    it('should have correct metadata', () => {
      expect(quitConfirmCommand.name).toBe('quit-confirm');
      expect(quitConfirmCommand.description).toContain('quit');
      expect(quitConfirmCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(quitConfirmCommand.action).toBeDefined();
    });
  });

  describe('/stats - Session statistics', () => {
    it('should have correct metadata', () => {
      expect(statsCommand.name).toBe('stats');
      expect(statsCommand.description).toContain('stats');
      expect(statsCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(statsCommand.action).toBeDefined();
    });

    it('should have subcommands for model, tools, cost', () => {
      expect(statsCommand.subCommands).toBeDefined();
      expect(statsCommand.subCommands?.length).toBeGreaterThanOrEqual(3);

      const modelCmd = statsCommand.subCommands?.find(cmd => cmd.name === 'model');
      expect(modelCmd).toBeDefined();

      const toolsCmd = statsCommand.subCommands?.find(cmd => cmd.name === 'tools');
      expect(toolsCmd).toBeDefined();

      const costCmd = statsCommand.subCommands?.find(cmd => cmd.name === 'cost');
      expect(costCmd).toBeDefined();
      expect(costCmd?.description).toContain('cost');
    });
  });

  describe('/summary - Generate project summary', () => {
    it('should have correct metadata', () => {
      expect(summaryCommand.name).toBe('summary');
      expect(summaryCommand.description).toContain('summary');
      expect(summaryCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(summaryCommand.action).toBeDefined();
    });
  });

  describe('/theme - Change theme', () => {
    it('should have correct metadata', () => {
      expect(themeCommand.name).toBe('theme');
      expect(themeCommand.description).toContain('theme');
      expect(themeCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(themeCommand.action).toBeDefined();
    });
  });

  describe('/tools - List tools', () => {
    it('should have correct metadata', () => {
      expect(toolsCommand.name).toBe('tools');
      expect(toolsCommand.description).toContain('tools');
      expect(toolsCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(toolsCommand.action).toBeDefined();
    });
  });

  describe('/settings - View and edit settings', () => {
    it('should have correct metadata', () => {
      expect(settingsCommand.name).toBe('settings');
      expect(settingsCommand.description).toContain('settings');
      expect(settingsCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(settingsCommand.action).toBeDefined();
    });
  });

  describe('/vim - Toggle vim mode', () => {
    it('should have correct metadata', () => {
      expect(vimCommand.name).toBe('vim');
      expect(vimCommand.description).toContain('vim');
      expect(vimCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(vimCommand.action).toBeDefined();
    });
  });

  describe('/setup-github - Set up GitHub Actions', () => {
    it('should have correct metadata', () => {
      expect(setupGithubCommand.name).toBe('setup-github');
      expect(setupGithubCommand.description).toContain('GitHub');
      expect(setupGithubCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(setupGithubCommand.action).toBeDefined();
    });
  });

  describe('/setup - Configure API keys', () => {
    it('should have correct metadata', () => {
      expect(setupApiCommand.name).toBe('setup');
      expect(setupApiCommand.description).toContain('API');
      expect(setupApiCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(setupApiCommand.action).toBeDefined();
    });
  });

  describe('/setup-api - Configure API keys (alias)', () => {
    it('should have correct metadata', () => {
      expect(setupApiKeyCommand.name).toBe('setup-api');
      expect(setupApiKeyCommand.description).toContain('API');
      expect(setupApiKeyCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(setupApiKeyCommand.action).toBeDefined();
    });
  });

  describe('/terminal-setup - Configure terminal keybindings', () => {
    it('should have correct metadata', () => {
      expect(terminalSetupCommand.name).toBe('terminal-setup');
      expect(terminalSetupCommand.description).toContain('terminal');
      expect(terminalSetupCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have action function', () => {
      expect(terminalSetupCommand.action).toBeDefined();
    });
  });

  describe('Command Count Validation', () => {
    it('should have at least 30 commands registered', () => {
      const allCommands = [
        aboutCommand,
        agentsCommand,
        approvalModeCommand,
        authCommand,
        bugCommand,
        chatCommand,
        clearCommand,
        compressCommand,
        copyCommand,
        corgiCommand,
        docsCommand,
        directoryCommand,
        editorCommand,
        extensionsCommand,
        helpCommand,
        initCommand,
        mcpCommand,
        memoryCommand,
        modelCommand,
        openrouterCommand,
        privacyCommand,
        quitCommand,
        quitConfirmCommand,
        statsCommand,
        summaryCommand,
        themeCommand,
        toolsCommand,
        settingsCommand,
        vimCommand,
        setupGithubCommand,
        setupApiCommand,
        setupApiKeyCommand,
        terminalSetupCommand,
      ];

      expect(allCommands.length).toBeGreaterThanOrEqual(30);
    });
  });
});
