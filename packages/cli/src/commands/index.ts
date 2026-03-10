/**
 * Command setup and registration
 */

import { Command } from 'commander';
import setupAuthCommands from './auth';
import { createAgentCommand } from './agent';
import { setupProjectCommands } from './project';
import { setupChatCommands } from './chat';
import { setupTemplateCommands } from './templates';
import { setupValidateCommands } from './validate';
import { setupModelCommands } from './models';
import { generateCommand } from './generate';
import { createPlanCommand } from './plan';
import { createStructureCommand } from './structure';
import { routerCommand } from './router';
import { ollamaCommand } from './ai/ollama-command';

export function setupCommands(program: Command): void {
  // Authentication commands
  setupAuthCommands();
  
  // Agent management commands
  program.addCommand(createAgentCommand());
  
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
  
  // Code Generation commands
  program.addCommand(generateCommand);
  
  // Plan commands
  program.addCommand(createPlanCommand());
  
  // Structure commands
  program.addCommand(createStructureCommand());
  
  // AI Router commands
  routerCommand.register(program);
  
  // Ollama AI commands  
  ollamaCommand.register(program);
}

export * from './auth';
export * from './agent';
export * from './project';
export * from './chat';
export * from './templates';
export * from './validate';
export * from './models';
export * from './generate';
export * from './plan';
export * from './structure';
export * from './router';
export * from './ai/ollama-command';