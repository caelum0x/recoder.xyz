import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Canonical A2A conformance gate.
 *
 * Reads the vendored upstream `a2a.proto` (schemas/canonical/a2a.proto) and
 * asserts that the canonical AgentCard / AgentSkill field sets exactly match a
 * declared mapping onto Recoder's a2a-sdk types. When upstream A2A adds, removes,
 * or renames a field, this test fails until the mapping below is consciously
 * updated — interop-contract drift can never land silently.
 *
 * `recoderField: null` means the canonical field is intentionally NOT modelled in
 * Recoder's domain AgentCard (documented gap), not an oversight.
 */

const protoPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas', 'canonical', 'a2a.proto');
const proto = readFileSync(protoPath, 'utf-8');

/** Extract the field names declared inside a top-level `message <Name> { ... }` block. */
function protoMessageFields(source: string, messageName: string): string[] {
  const start = source.indexOf(`message ${messageName} {`);
  if (start === -1) {
    throw new Error(`canonical message not found in proto: ${messageName}`);
  }
  // Walk braces from the opening brace to find the matching close.
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(open + 1, end);
  const fields: string[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('reserved') || /^option\s/.test(line)) {
      continue;
    }
    // matches: [repeated|optional] <type incl. map<...>> <field_name> = <number>;
    const match = line.match(/^(?:repeated\s+|optional\s+)?(?:[\w.]+|map<[^>]+>)\s+(\w+)\s*=\s*\d+/);
    if (match) {
      fields.push(match[1]);
    }
  }
  return fields;
}

// Declared mapping: canonical proto field -> Recoder a2a-sdk AgentCard field (or null = intentional gap).
const AGENT_CARD_MAPPING: Record<string, string | null> = {
  name: 'name',
  description: 'description',
  version: 'version',
  capabilities: 'capabilities',
  security_schemes: 'securitySchemes',
  skills: 'skills',
  // Recoder uses a single `url` instead of the canonical interface list.
  supported_interfaces: null,
  provider: null,
  documentation_url: null,
  security_requirements: null,
  default_input_modes: null,
  default_output_modes: null,
  signatures: null,
  icon_url: null,
};

const AGENT_SKILL_MAPPING: Record<string, string | null> = {
  id: 'id',
  name: 'name',
  description: 'description',
  tags: 'tags',
  examples: null,
  input_modes: null,
  output_modes: null,
  security_requirements: null,
};

// Recoder a2a-sdk field names (kept in sync with src/schemas/agent-card.ts).
const RECODER_AGENT_CARD_FIELDS = new Set([
  'id', 'name', 'platform', 'description', 'url', 'version', 'capabilities', 'skills', 'securitySchemes', 'metadata',
]);
const RECODER_AGENT_SKILL_FIELDS = new Set(['id', 'name', 'description', 'tags']);

describe('canonical A2A conformance', () => {
  it('AgentCard canonical fields exactly match the declared Recoder mapping', () => {
    const canonical = new Set(protoMessageFields(proto, 'AgentCard'));
    const mapped = new Set(Object.keys(AGENT_CARD_MAPPING));
    // Drift detection: every canonical field is accounted for and no stale keys remain.
    expect([...canonical].sort()).toEqual([...mapped].sort());
  });

  it('AgentSkill canonical fields exactly match the declared Recoder mapping', () => {
    const canonical = new Set(protoMessageFields(proto, 'AgentSkill'));
    const mapped = new Set(Object.keys(AGENT_SKILL_MAPPING));
    expect([...canonical].sort()).toEqual([...mapped].sort());
  });

  it('every mapped Recoder AgentCard field exists in the Recoder schema', () => {
    for (const target of Object.values(AGENT_CARD_MAPPING)) {
      if (target !== null) {
        expect(RECODER_AGENT_CARD_FIELDS.has(target)).toBe(true);
      }
    }
  });

  it('every mapped Recoder AgentSkill field exists in the Recoder schema', () => {
    for (const target of Object.values(AGENT_SKILL_MAPPING)) {
      if (target !== null) {
        expect(RECODER_AGENT_SKILL_FIELDS.has(target)).toBe(true);
      }
    }
  });

  it('proto parser finds known core messages (sanity)', () => {
    expect(protoMessageFields(proto, 'Task').length).toBeGreaterThan(0);
    expect(protoMessageFields(proto, 'Message')).toContain('role');
  });
});
