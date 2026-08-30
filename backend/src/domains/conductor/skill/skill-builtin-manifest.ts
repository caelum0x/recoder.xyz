/**
 * The FIRST-PARTY built-in skill manifest — `recoder.workspace`, a signed,
 * capability-typed, READ-ONLY worktree-introspection skill. It is the reference
 * `recoder.skill.json` and the first skill a deployment can enable: its four actions
 * map 1:1 to the built-in read-only capability handlers
 * ({@link builtinReadOnlyWorkspaceCapabilities}).
 *
 * This module exports only the UNSIGNED body (id/version/publisherKeyId/actions).
 * The committed signature is stamped outside the repository by the publisher's
 * private key and verified at load by the trusted PUBLIC key — the private key
 * never lives in the repo. `publisherKeyId` names the trust anchor resolved by
 * the built-in or operator-managed publisher registry.
 */
import type { SkillManifest } from './skill.types.js';
import {
  CAP_WORKSPACE_LIST_FILES,
  CAP_WORKSPACE_READ_DIFF,
  CAP_WORKSPACE_READ_FILE,
  CAP_WORKSPACE_SEARCH_TEXT,
} from './skill-capabilities.js';

/** The publisher key id the first-party manifest is signed under (trust-anchor name). */
export const RECODER_BUILTIN_PUBLISHER_KEY_ID = 'recoder-builtin';

/**
 * The FIRST-PARTY publisher PUBLIC key (raw 32-byte ed25519, hex) — the trust
 * anchor for the built-in `recoder.workspace` skill, safe to ship in the binary
 * (a public key reveals no secret). The matching PRIVATE key is held out-of-repo
 * by the publisher and used only to re-sign the manifest when it changes.
 */
export const RECODER_BUILTIN_PUBLIC_KEY_HEX =
  'ebb2c141b35d79e51be798c5910d2119c9f6bc8c6f2d84faeab0ed98c4756b52';

/**
 * The committed ed25519 signature over the first-party manifest's canonical body
 * ({@link recoderWorkspaceSkillBody}), produced by the publisher private key. It
 * verifies against {@link RECODER_BUILTIN_PUBLIC_KEY_HEX}; a locked test proves it.
 */
export const RECODER_WORKSPACE_SIGNATURE =
  'e9a944bdcaf0bc2ed317dfb171ca7b00172b72f4a91b0a9371b36454627b0bb60895627a4239de18bfe87ec8d1f988c39cd0b06ee5b827eae11a1f0d7b9e4d05';

/** The pinned id + version of the first-party workspace skill. */
export const RECODER_WORKSPACE_SKILL_ID = 'recoder.workspace';
export const RECODER_WORKSPACE_SKILL_VERSION = '1.1.0';

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
      {
        id: 'search_text',
        title: 'Search workspace text with file and line evidence',
        paramsSchema: {
          query: { type: 'string', required: true },
          dir: { type: 'string' },
          caseSensitive: { type: 'boolean' },
          maxResults: { type: 'number' },
        },
        requiredCapabilities: [CAP_WORKSPACE_SEARCH_TEXT],
      },
      {
        id: 'read_diff',
        title: 'Read the working or staged Git diff',
        paramsSchema: {
          path: { type: 'string' },
          scope: { type: 'string', enum: ['working', 'staged'] },
        },
        requiredCapabilities: [CAP_WORKSPACE_READ_DIFF],
      },
    ],
  };
}

/** The pinned {id → version} allow-list entry for the first-party skill. */
export function recoderWorkspaceSkillPin(): Readonly<Record<string, string>> {
  return { [RECODER_WORKSPACE_SKILL_ID]: RECODER_WORKSPACE_SKILL_VERSION };
}

/** The SIGNED first-party manifest (body + committed signature) — trusted by default. */
export function recoderWorkspaceSignedManifest(): SkillManifest {
  return { ...recoderWorkspaceSkillBody(), signature: RECODER_WORKSPACE_SIGNATURE };
}
