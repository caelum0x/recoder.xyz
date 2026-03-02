#!/usr/bin/env node

/**
 * SFA-014: Connector contract support snapshot generator.
 *
 * Generates a JSON file describing the current state of the A2A canonical
 * schemas. This snapshot can be committed to track schema evolution over time.
 *
 * Usage:
 *   node tools/a2a-interop/js/generate-connector-snapshot.mjs [--output <path>]
 *
 * Default output: shared/src/a2a/snapshots/connector-contract.snapshot.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Parse the canonical schema sources to extract constants
//
// Since the schemas are TypeScript and we cannot import them directly in a
// plain Node.js ESM script, we parse the source files for the const values.
// This avoids needing a build step or ts-node for CI.
// ---------------------------------------------------------------------------

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

/**
 * Extract all string values from a `const Foo = { ... } as const` block.
 */
function extractConstObjectValues(source, constName) {
  // Match the block: `export const <name> = { ... } as const;`
  const blockRegex = new RegExp(
    `export\\s+const\\s+${constName}\\s*=\\s*\\{([^}]+)\\}`,
    "s"
  );
  const match = source.match(blockRegex);
  if (!match) return [];

  const body = match[1];
  // Extract string values from lines like:  Key: 'value',  or  Key: 'value' as const
  const valueRegex = /:\s*['"]([^'"]+)['"]/g;
  const values = [];
  let m;
  while ((m = valueRegex.exec(body)) !== null) {
    values.push(m[1]);
  }
  return values;
}

/**
 * Extract the version string from `export const FOO = '...' as const;`
 */
function extractVersionConst(source, constName) {
  const regex = new RegExp(
    `export\\s+const\\s+${constName}\\s*=\\s*['"]([^'"]+)['"]`
  );
  const match = source.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract key-value pairs (key -> string value) from a const enum-like object.
 */
function extractConstObjectKeyValues(source, constName) {
  const blockRegex = new RegExp(
    `export\\s+const\\s+${constName}\\s*=\\s*\\{([^}]+)\\}`,
    "s"
  );
  const match = source.match(blockRegex);
  if (!match) return {};

  const body = match[1];
  const kvRegex = /(\w+):\s*['"]([^'"]+)['"]/g;
  const map = {};
  let m;
  while ((m = kvRegex.exec(body)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Extract error codes and their registry metadata.
 */
function extractErrorCodeRegistry(source) {
  const codes = extractConstObjectValues(source, "A2AErrorCodeEnum");
  const categories = extractConstObjectValues(source, "A2AErrorCategoryEnum");
  const severities = extractConstObjectValues(source, "A2AErrorSeverityEnum");

  // Build a map from enum key -> string value for the error code enum
  const codeEnumKeyToValue = extractConstObjectKeyValues(source, "A2AErrorCodeEnum");

  // Extract all registry entry blocks:
  //   [A2AErrorCodeEnum.InvalidEnvelope]: { ... }
  // The registry uses enum keys, not string literals, as property accessors.
  const registryBlock = source.match(
    /export\s+const\s+A2A_ERROR_CODE_REGISTRY[^{]*\{([\s\S]*?)\}\s*;/
  );

  // Build code -> metadata from registry entries
  const codeMeta = {};
  if (registryBlock) {
    const body = registryBlock[1];
    // Match each entry: [A2AErrorCodeEnum.Xyz]: { ... }
    const entryRegex = /\[A2AErrorCodeEnum\.(\w+)\]\s*:\s*\{([^}]+)\}/g;
    let em;
    while ((em = entryRegex.exec(body)) !== null) {
      const enumKey = em[1];
      const entryBody = em[2];
      const codeValue = codeEnumKeyToValue[enumKey];
      if (!codeValue) continue;

      const categoryMatch = entryBody.match(/category:\s*A2AErrorCategoryEnum\.(\w+)/);
      const severityMatch = entryBody.match(/severity:\s*A2AErrorSeverityEnum\.(\w+)/);
      const retryableMatch = entryBody.match(/retryable:\s*(true|false)/);

      codeMeta[codeValue] = {
        category: categoryMatch
          ? resolveEnumValue(source, "A2AErrorCategoryEnum", categoryMatch[1])
          : "unknown",
        severity: severityMatch
          ? resolveEnumValue(source, "A2AErrorSeverityEnum", severityMatch[1])
          : "unknown",
        retryable: retryableMatch ? retryableMatch[1] === "true" : false,
      };
    }
  }

  const entries = codes.map((code) => ({
    code,
    category: codeMeta[code]?.category ?? "unknown",
    severity: codeMeta[code]?.severity ?? "unknown",
    retryable: codeMeta[code]?.retryable ?? false,
  }));

  return { codes, categories, severities, entries };
}

/**
 * Given an enum name and a key, resolve the string value from the source.
 */
function resolveEnumValue(source, enumName, key) {
  const blockRegex = new RegExp(
    `export\\s+const\\s+${enumName}\\s*=\\s*\\{([^}]+)\\}`,
    "s"
  );
  const match = source.match(blockRegex);
  if (!match) return key.toLowerCase();

  const body = match[1];
  const keyRegex = new RegExp(`${key}:\\s*['"]([^'"]+)['"]`);
  const keyMatch = body.match(keyRegex);
  return keyMatch ? keyMatch[1] : key.toLowerCase();
}

/**
 * Extract connector contract method names from the schema factory functions.
 */
function extractContractMethods(taskSource, auditSource, errorSource) {
  const methods = [];
  const functionRegex = /export\s+function\s+(\w+)\s*\(/g;

  for (const source of [taskSource, auditSource, errorSource]) {
    let m;
    while ((m = functionRegex.exec(source)) !== null) {
      methods.push(m[1]);
    }
  }

  return methods;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Parse CLI args
  let outputPath = resolve(
    ROOT,
    "shared/src/a2a/snapshots/connector-contract.snapshot.json"
  );
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputPath = resolve(args[i + 1]);
      i++;
    }
  }

  // Read source files
  const taskSource = readSource("shared/src/a2a/schemas/task-envelope.ts");
  const auditSource = readSource("shared/src/a2a/schemas/audit-event.ts");
  const errorSource = readSource("shared/src/a2a/schemas/error-taxonomy.ts");

  // Extract data
  const taskEnvelopeVersion = extractVersionConst(
    taskSource,
    "TASK_ENVELOPE_VERSION"
  );
  const auditEventVersion = extractVersionConst(
    auditSource,
    "AUDIT_EVENT_VERSION"
  );

  const taskStates = extractConstObjectValues(taskSource, "TaskStateEnum");
  const auditEventTypes = extractConstObjectValues(
    auditSource,
    "AuditEventTypeEnum"
  );
  const actorKinds = extractConstObjectValues(auditSource, "AuditActorKindEnum");
  const targetKinds = extractConstObjectValues(
    auditSource,
    "AuditTargetKindEnum"
  );
  const auditSeverities = extractConstObjectValues(
    auditSource,
    "AuditSeverityEnum"
  );

  const errorData = extractErrorCodeRegistry(errorSource);
  const contractMethods = extractContractMethods(
    taskSource,
    auditSource,
    errorSource
  );

  // Determine terminal states (states with empty transition arrays in the source)
  const terminalStates = [];
  const nonTerminalStates = [];
  const transitionBlock = taskSource.match(
    /export\s+const\s+ALLOWED_STATE_TRANSITIONS[^{]*\{([\s\S]*?)\}\s*;/
  );
  if (transitionBlock) {
    const body = transitionBlock[1];
    // Find each enum key and its targets
    const entries = [
      ...body.matchAll(/\[TaskStateEnum\.(\w+)\]\s*:\s*\[([^\]]*)\]/g),
    ];
    // Build a map from enum key to state value
    const enumBlock = taskSource.match(
      /export\s+const\s+TaskStateEnum\s*=\s*\{([^}]+)\}/s
    );
    const keyToValue = {};
    if (enumBlock) {
      const kvRegex = /(\w+):\s*['"]([^'"]+)['"]/g;
      let kvm;
      while ((kvm = kvRegex.exec(enumBlock[1])) !== null) {
        keyToValue[kvm[1]] = kvm[2];
      }
    }

    for (const entry of entries) {
      const enumKey = entry[1];
      const targetsStr = entry[2].trim();
      const stateValue = keyToValue[enumKey];
      if (!stateValue) continue;
      if (targetsStr === "") {
        terminalStates.push(stateValue);
      } else {
        nonTerminalStates.push(stateValue);
      }
    }
  }

  // Build snapshot
  const snapshot = {
    $schema: "connector-contract-snapshot-v1",
    generated_at: new Date().toISOString(),
    schema_versions: {
      task_envelope: taskEnvelopeVersion,
      audit_event: auditEventVersion,
    },
    task_states: {
      all: taskStates,
      terminal: terminalStates,
      non_terminal: nonTerminalStates,
    },
    error_taxonomy: {
      categories: errorData.categories,
      severities: errorData.severities,
      codes: errorData.entries,
    },
    audit_events: {
      event_types: auditEventTypes,
      actor_kinds: actorKinds,
      target_kinds: targetKinds,
      severities: auditSeverities,
    },
    connector_contract_methods: contractMethods,
  };

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");

  console.log(`Connector contract snapshot written to: ${outputPath}`);
  console.log(`  Schema versions: envelope=${taskEnvelopeVersion}, audit=${auditEventVersion}`);
  console.log(`  Task states: ${taskStates.length} (${terminalStates.length} terminal)`);
  console.log(`  Error codes: ${errorData.codes.length}`);
  console.log(`  Audit event types: ${auditEventTypes.length}`);
  console.log(`  Contract methods: ${contractMethods.length}`);
}

main();
