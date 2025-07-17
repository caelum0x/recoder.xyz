/**
 * Command setup and registration
 */

import { Command } from 'commander';
import { setupAuthCommands } from './auth';
import { setupAgentCommands } from './agent';
import { setupProjectCommands } from './project';
import { setupChatCommands } from './chat';
import { setupTemplateCommands } from './templates';

export function setupCommands(program: Command): void {
  // Authentication commands
  setupAuthCommands(program);
  
  // Agent management commands
  setupAgentCommands(program);
  
  // Project commands
  setupProjectCommands(program);
  
  // Chat commands
  setupChatCommands(program);
  
  // Template commands
  setupTemplateCommands(program);
}

export * from './auth';
export * from './agent';
export * from './project';
export * from './chat';
export * from './templates';