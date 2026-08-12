/**
 * Typed param validation for a skill action — the capability-typed input gate
 * that REPLACES free-argv. An invocation's params are checked against the
 * action's closed {@link SkillActionParamsSchema}:
 *
 *  - a key NOT declared in the schema is REFUSED (no free-form/extra argv);
 *  - a missing `required` param is REFUSED;
 *  - a present param whose runtime type / enum membership does not match is REFUSED.
 *
 * On success the caller receives a fresh, typed copy of the params (never the
 * caller's mutable object), so what flows to policy + the executor is exactly the
 * validated set — nothing more.
 */
import type { SkillActionParamsSchema, SkillParamSpec } from './skill.types.js';

/** The result of validating raw params against a typed action schema. */
export type SkillParamValidation =
  | { readonly ok: true; readonly value: Readonly<Record<string, string | number | boolean>> }
  | { readonly ok: false; readonly reason: string };

/** Coerce untrusted raw params into a plain record without trusting the shape. */
function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Validate ONE declared param's present value against its spec. */
function checkValue(
  name: string,
  spec: SkillParamSpec,
  value: unknown,
): { readonly ok: true; readonly value: string | number | boolean } | { readonly ok: false; readonly reason: string } {
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string') {
        return { ok: false, reason: `param '${name}' must be a string` };
      }
      if (spec.enum && !spec.enum.includes(value)) {
        return { ok: false, reason: `param '${name}' must be one of: ${spec.enum.join(', ')}` };
      }
      return { ok: true, value };
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: `param '${name}' must be a finite number` };
      }
      return { ok: true, value };
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return { ok: false, reason: `param '${name}' must be a boolean` };
      }
      return { ok: true, value };
    }
    default:
      return { ok: false, reason: `param '${name}' has an unsupported type` };
  }
}

/**
 * Validate raw invocation params against an action's typed schema. Fail-fast: the
 * FIRST violation (unknown key, missing required, type/enum mismatch) is returned
 * as a truthful refusal reason; on success a typed copy of the params is returned.
 */
export function validateSkillParams(
  schema: SkillActionParamsSchema,
  rawParams: unknown,
): SkillParamValidation {
  const raw = asRecord(rawParams);

  // No free-argv: reject any key the action did not declare.
  for (const key of Object.keys(raw)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) {
      return { ok: false, reason: `unknown parameter '${key}' (not declared by this action)` };
    }
  }

  const out: Record<string, string | number | boolean> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(raw, name);
    if (!present) {
      if (spec.required) {
        return { ok: false, reason: `missing required parameter '${name}'` };
      }
      continue;
    }
    const checked = checkValue(name, spec, raw[name]);
    if (!checked.ok) return checked;
    out[name] = checked.value;
  }

  return { ok: true, value: out };
}
