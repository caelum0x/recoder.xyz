/**
 * The FIRST-PARTY built-in skill manifest — `recoder.workspace`, a signed,
 * capability-typed, READ-ONLY worktree-introspection skill. It is the reference
 * `recoder.skill.json` and the first skill a deployment can enable: its two actions
 * map 1:1 to the built-in read-only capability handlers
 * ({@link builtinReadOnlyWorkspaceCapabilities}).
 *
 * This module exports only the UNSIGNED body (id/version/publisherKeyId/actions).
 * The signature is stamped at DEPLOY time by the publisher's private key
 * ({@link signManifest}) and verified at load by the trusted PUBLIC key — the
 * private key never lives in the repo. `publisherKeyId` names the trust anchor a
 * deployment must resolve to a real ed25519 public key (config/env allow-list).
 */
import type { SkillManifest } from './skill.types.js';
import { CAP_WORKSPACE_READ_FILE, CAP_WORKSPACE_LIST_FILES } from './skill-capabilities.js';

/** The publisher key id the first-party manifest is signed under (trust-anchor name). */
export const RECODER_BUILTIN_PUBLISHER_KEY_ID = 'recoder-builtin';

/** The pinned id + version of the first-party workspace skill. */
export const RECODER_WORKSPACE_SKILL_ID = 'recoder.workspace';
export const RECODER_WORKSPACE_SKILL_VERSION = '1.0.0';

/**
 * The UNSIGNED first-party manifest body. Stamp a signature with the publisher's
 * private key ({@link signManifest}) before loading; the registry rejects it
 * unsigned/unpinned/unknown-publisher until then.
 */
export function recoderWorkspaceSkillBody(): Omit<SkillManifest, 'signature'> {
  return {
    id: RECODER_WORKSPACE_SKILL_ID,
    version: RECODER_WORKSPACE_SKILL_VERSION,
    publisherKeyId: RECODER_BUILTIN_PUBLISHER_KEY_ID,
    actions: [
      {
        id: 'read_file',
        title: 'Read a text file inside the workspace',
        paramsSchema: { path: { type: 'string', required: true } },
        requiredCapabilities: [CAP_WORKSPACE_READ_FILE],
      },
      {
        id: 'list_files',
        title: 'List entries under a directory inside the workspace',
        paramsSchema: { dir: { type: 'string' } },
        requiredCapabilities: [CAP_WORKSPACE_LIST_FILES],
      },
    ],
  };
}

/** The pinned {id → version} allow-list entry for the first-party skill. */
export function recoderWorkspaceSkillPin(): Readonly<Record<string, string>> {
  return { [RECODER_WORKSPACE_SKILL_ID]: RECODER_WORKSPACE_SKILL_VERSION };
}
