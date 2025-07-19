/**
 * Command setup and registration
 */

import { Command } from 'commander';
import { setupAuthCommands } from './auth';
import { setupAgentCommands } from './agent';
import { setupProjectCommands } from './project';
import { setupChatCommands } from './chat';
import { setupTemplateCommands } from './templates';
import { setupValidateCommands } from './validate';
import { setupModelCommands } from './models';
import { createPlanCommand } from './plan';
import { createStructureCommand } from './structure';

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
  
  // Validation commands
  setupValidateCommands(program);
  
  // AI Model commands
  setupModelCommands(program);
  
  // Plan commands
  program.addCommand(createPlanCommand());
  
  // Structure commands
  program.addCommand(createStructureCommand());
}

export * from './auth';
export * from './agent';
export * from './project';
export * from './chat';
export * from './templates';
export * from './validate';
export * from './models';
export * from './plan';
export * from './structure';