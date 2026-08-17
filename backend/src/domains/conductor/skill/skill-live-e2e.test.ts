/**
 * LIVE end-to-end proof of the governed skill model (recoder-ubyg/ne6o): a freshly
 * minted ed25519 publisher key SIGNS the first-party `recoder.workspace` manifest,
 * the REAL verifier admits it into the REAL registry, and the REAL service invokes
 * a read_file action through the REAL capability-dispatch executor + REAL built-in
 * handler against a REAL temp worktree — end to end, no fakes on the trust,
 * execution, or crypto seams. This is the exact composition bootstrap wires; a
 * deployment only supplies the publisher public key + a signed manifest.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluatePolicy } from '@recoder/agent-policy';
import { createSkillRegistry } from './skill-registry.js';
import { createSkillActionService, type SkillApprovalPort } from './skill-action.service.js';
import { createEd25519SkillSignatureVerifier } from './skill-signature-verifier.js';
import { createCapabilityDispatchExecutor } from './skill-executor.js';
import { builtinReadOnlyWorkspaceCapabilities } from './skill-capabilities.js';
import {
  recoderWorkspaceSkillBody,
  recoderWorkspaceSkillPin,
  RECODER_BUILTIN_PUBLISHER_KEY_ID,
} from './skill-builtin-manifest.js';
import { generateSkillPublisherKeypair, signManifest } from './skill-manifest-signer.js';
import type { SkillWorkspaceResolver } from './skill-workspace-resolver.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as never;

/** Approval port that would open a request — never reached on the allow path here. */
const approval: SkillApprovalPort = { async request() { return { id: 'appr-x' }; } };

describe('governed skill model — LIVE end-to-end', () => {
  let worktree: string;

  beforeAll(async () => {
    worktree = await mkdtemp(join(tmpdir(), 'recoder-skill-'));
    await writeFile(join(worktree, 'README.md'), '# hello\nsecond line\n', 'utf8');
    await mkdir(join(worktree, 'src'), { recursive: true });
    await writeFile(join(worktree, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  });

  afterAll(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  /** Compose the full live stack over a signed manifest + the real worktree. */
  async function liveService() {
    const { publicKeyHex, privateKeyPem } = generateSkillPublisherKeypair();
    const signed = signManifest(recoderWorkspaceSkillBody(), privateKeyPem);

    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: (id) => (id === RECODER_BUILTIN_PUBLISHER_KEY_ID ? publicKeyHex : null),
    });
    const registry = createSkillRegistry({ verifier, pinned: recoderWorkspaceSkillPin(), logger: log });
    const report = await registry.load([signed]);
    expect(report).toEqual([{ id: 'recoder.workspace', ok: true }]);

    const executor = createCapabilityDispatchExecutor({
      handlers: builtinReadOnlyWorkspaceCapabilities(),
      logger: log,
    });
    // Resolve the caller's workspace token to the REAL temp worktree checkout.
    const resolveWorkspace: SkillWorkspaceResolver = {
      resolve: ({ workspace }) =>
        workspace === 'ws-1' ? { ok: true, path: worktree } : { ok: false, reason: 'unknown workspace' },
    };
    return createSkillActionService({
      registry,
      evaluatePolicy,
      approval,
      resolveWorkspace,
      executor,
      logger: log,
    });
  }

  it('signs → verifies → resolves → policy-allows → executes read_file against the real worktree', async () => {
    const service = await liveService();
    const out = await service.invoke({
      skillId: 'recoder.workspace',
      actionId: 'read_file',
      params: { path: 'README.md' },
      actorId: 'user-1',
      workspace: 'ws-1',
    });
    expect(out.status).toBe('executed');
    if (out.status === 'executed') {
      expect(out.result.ok).toBe(true);
      const output = out.result.output as { content: string; bytes: number };
      expect(output.content).toContain('# hello');
      expect(output.bytes).toBeGreaterThan(0);
    }
  });

  it('executes list_files and returns worktree entries', async () => {
    const service = await liveService();
    const out = await service.invoke({
      skillId: 'recoder.workspace',
      actionId: 'list_files',
      params: {},
      actorId: 'user-1',
      workspace: 'ws-1',
    });
    expect(out.status).toBe('executed');
    if (out.status === 'executed' && out.result.ok) {
      const output = out.result.output as { entries: Array<{ name: string; kind: string }> };
      const names = output.entries.map((e) => e.name).sort();
      expect(names).toContain('README.md');
      expect(names).toContain('src');
    }
  });

  it('SANDBOX: a traversal path outside the worktree is refused, never read', async () => {
    const service = await liveService();
    const out = await service.invoke({
      skillId: 'recoder.workspace',
      actionId: 'read_file',
      params: { path: '../../../../etc/passwd' },
      actorId: 'user-1',
      workspace: 'ws-1',
    });
    // Executed (policy allowed the benign read capability) but the handler refuses
    // the out-of-sandbox target — never a read outside the worktree.
    expect(out.status).toBe('executed');
    if (out.status === 'executed') {
      expect(out.result.ok).toBe(false);
      expect(out.result.error).toMatch(/outside the workspace|does not exist/);
    }
  });

  it('TRUST: a manifest signed by a DIFFERENT key is rejected (unknown/bad signature)', async () => {
    const foreign = generateSkillPublisherKeypair();
    const trusted = generateSkillPublisherKeypair();
    // Sign with the foreign key, but the registry only trusts `trusted`.
    const signed = signManifest(recoderWorkspaceSkillBody(), foreign.privateKeyPem);
    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: (id) => (id === RECODER_BUILTIN_PUBLISHER_KEY_ID ? trusted.publicKeyHex : null),
    });
    const registry = createSkillRegistry({ verifier, pinned: recoderWorkspaceSkillPin(), logger: log });
    const report = await registry.load([signed]);
    expect(report).toEqual([{ id: 'recoder.workspace', ok: false, reason: 'bad_signature' }]);
    // And it is NOT resolvable → never invocable.
    expect(registry.resolveAction('recoder.workspace', 'read_file')).toBeNull();
  });
});
