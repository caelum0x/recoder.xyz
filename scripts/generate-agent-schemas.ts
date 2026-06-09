import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'docs', 'agent-os', 'schemas');
mkdirSync(outDir, { recursive: true });

const schemas = {
  'agent-profile.schema.json': {
    title: 'AgentProfile',
    type: 'object',
    required: ['agentId', 'displayName', 'vendorSurface', 'connectorId', 'runtimeKind', 'capabilities', 'health'],
    additionalProperties: true,
  },
  'task-spec.schema.json': {
    title: 'TaskSpec',
    type: 'object',
    required: ['taskId', 'spaceId', 'title', 'intent', 'goal', 'acceptanceCriteria', 'verification'],
    additionalProperties: true,
  },
  'instruction-bundle.schema.json': {
    title: 'InstructionBundle',
    type: 'object',
    required: ['bundleId', 'taskId', 'agentId', 'runtime', 'sharedGoal', 'renderedPrompt', 'compilerVersion', 'compiledAt'],
    additionalProperties: true,
  },
};

for (const [fileName, schema] of Object.entries(schemas)) {
  writeFileSync(path.join(outDir, fileName), `${JSON.stringify(schema, null, 2)}\n`);
}

console.log(`wrote ${Object.keys(schemas).length} Agent OS schema stubs to ${outDir}`);
