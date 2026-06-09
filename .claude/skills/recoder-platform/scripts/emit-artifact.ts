#!/usr/bin/env -S node --import tsx

const [kind, pathOrRef] = process.argv.slice(2);

if (!kind || !pathOrRef) {
  console.error('Usage: emit-artifact.ts <kind> <path-or-ref>');
  process.exit(1);
}

console.log(JSON.stringify({
  kind,
  pathOrRef,
  source: 'claude-skill',
  note: 'Attach this artifact through Recoder MCP/A2A when the bridge is connected.',
  createdAt: new Date().toISOString(),
}, null, 2));
