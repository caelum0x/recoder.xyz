// Quick test of the router integration
const { routerCommand } = require('./packages/cli/src/commands/router.ts');

console.log('✅ Router command imported successfully');
console.log('✅ Router has register method:', typeof routerCommand.register === 'function');

// Test creating a simple command program
const { Command } = require('commander');
const program = new Command();

try {
  routerCommand.register(program);
  console.log('✅ Router commands registered successfully');
  
  // Show available router commands
  const routerCmd = program.commands.find(cmd => cmd.name() === 'router');
  if (routerCmd) {
    console.log('✅ Router command found with subcommands:');
    routerCmd.commands.forEach(cmd => {
      console.log(`  - ${cmd.name()}: ${cmd.description()}`);
    });
  }
} catch (error) {
  console.error('❌ Router registration failed:', error.message);
}