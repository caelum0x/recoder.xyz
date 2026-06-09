#!/usr/bin/env -S node --import tsx

const commands = process.argv.slice(2);

console.log(JSON.stringify({
  verificationCommands: commands,
  mode: commands.length ? 'declared' : 'no-commands-provided',
  source: 'claude-skill',
  createdAt: new Date().toISOString(),
}, null, 2));
