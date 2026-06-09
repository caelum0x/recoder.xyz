#!/usr/bin/env -S node --import tsx

const taskId = process.argv[2] ?? process.env.RECODER_TASK_ID;

if (!taskId) {
  console.error('Usage: load-task.ts <task-id>');
  process.exit(1);
}

console.log(JSON.stringify({
  taskId,
  source: 'recoder-agent-os',
  guidance: 'Load the Recoder TaskSpec through MCP/A2A when connected; this script is the local skill boundary.',
}, null, 2));
