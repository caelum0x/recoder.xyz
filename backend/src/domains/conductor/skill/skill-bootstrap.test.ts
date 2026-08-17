/**
 * `createGovernedSkillModel` composer tests — the single seam bootstrap calls.
 * Proves: OFF (null) with no publisher keys; ON with keys + a signed manifest,
 * admitting the first-party skill and invoking it through the fully-composed stack
 * against a real temp worktree; and a truthful load report on a bad-signature
 * manifest.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGovernedSkillModel } from './skill-bootstrap.js';
import {
  recoderWorkspaceSkillBody,
  RECODER_BUILTIN_PUBLISHER_KEY_ID,
} from './skill-builtin-manifest.js';
import { generateSkillPublisherKeypair, signManifest } from './skill-manifest-signer.js';
import type { SkillApprovalPort } from './skill-action.service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as never;
const approval: SkillApprovalPort = { async request() { return { id: 'appr-x' }; } };

describe('createGovernedSkillModel', () => {
  let worktree: string;

  beforeAll(async () => {
    worktree = await mkdtemp(join(tmpdir(), 'recoder-skill-boot-'));
    await writeFile(join(worktree, 'README.md'), 'boot readme\n', 'utf8');
  });
  afterAll(async () => { await rm(worktree, { recursive: true, force: true }); });

  const getWorkspace = async (id: string) =>
    id === 'ws-1' ? { createdBy: 'user-1', worktreePath: worktree } : null;

  it('is OFF (null) only when first-party is disabled AND no publisher keys are configured', async () => {
    const model = await createGovernedSkillModel({
      publisherKeys: {}, manifests: [], includeFirstParty: false, getWorkspace, approval, logger: log,
    });
    expect(model).toBeNull();
  });

  it('trusts the FIRST-PARTY recoder.workspace by DEFAULT and invokes it end-to-end (no env config)', async () => {
    // No publisher keys / manifests supplied — the committed first-party key+manifest
    // are batteries-included.
    const model = await createGovernedSkillModel({
      publisherKeys: {}, manifests: [], getWorkspace, approval, logger: log,
    });
    expect(model).not.toBeNull();
    expect(model!.loadReport).toEqual([{ id: 'recoder.workspace', ok: true }]);
    expect(model!.registry.list().map((s) => s.manifest.id)).toEqual(['recoder.workspace']);

    const out = await model!.service.invoke({
      skillId: 'recoder.workspace', actionId: 'read_file',
      params: { path: 'README.md' }, actorId: 'user-1', workspace: 'ws-1',
    });
    expect(out.status).toBe('executed');
    if (out.status === 'executed') {
      expect(out.result.ok).toBe(true);
      expect((out.result.output as { content: string }).content).toContain('boot readme');
    }
  });

  it('records a truthful load report and admits nothing for a manifest signed by an untrusted key', async () => {
    const foreign = generateSkillPublisherKeypair();
    const trusted = generateSkillPublisherKeypair();
    const signed = signManifest(recoderWorkspaceSkillBody(), foreign.privateKeyPem);
    const model = await createGovernedSkillModel({
      // Disable first-party so this tests ONLY the env manifest's rejection.
      includeFirstParty: false,
      publisherKeys: { [RECODER_BUILTIN_PUBLISHER_KEY_ID]: trusted.publicKeyHex },
      manifests: [signed],
      getWorkspace, approval, logger: log,
    });
    expect(model).not.toBeNull();
    expect(model!.loadReport).toEqual([{ id: 'recoder.workspace', ok: false, reason: 'bad_signature' }]);
    expect(model!.registry.list()).toHaveLength(0);
  });
});
