import { createHash, createPublicKey } from 'node:crypto';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillLoadOutcome, SkillManifest } from './skill.types.js';

export type SkillPublisherSource = 'first_party' | 'environment' | 'operator';

export interface StoredSkillPublisher {
  readonly keyId: string;
  readonly publicKey: string;
  readonly addedBy: string;
  readonly addedAt: string;
}

export interface StoredSkillManifest {
  readonly manifest: SkillManifest;
  readonly addedBy: string;
  readonly addedAt: string;
}

export interface SkillTrustStore {
  listPublishers(): Promise<readonly StoredSkillPublisher[]>;
  listManifests(): Promise<readonly StoredSkillManifest[]>;
  putPublisher(publisher: StoredSkillPublisher): Promise<void>;
  deletePublisher(keyId: string): Promise<void>;
  putManifest(manifest: StoredSkillManifest): Promise<void>;
  deleteManifest(skillId: string): Promise<void>;
  isDurable(): boolean;
}

export interface TrustedPublisherRecord {
  readonly keyId: string;
  readonly publicKey: string;
  readonly source: SkillPublisherSource;
  readonly addedBy?: string;
  readonly addedAt?: string;
}

export interface SkillPublisherView {
  readonly keyId: string;
  readonly fingerprint: string;
  readonly source: SkillPublisherSource;
  readonly removable: boolean;
  readonly skillCount: number;
  readonly addedAt?: string;
}

export interface SkillTrustView {
  readonly durable: boolean;
  readonly publishers: readonly SkillPublisherView[];
  readonly admissions: readonly SkillLoadOutcome[];
}

export interface SkillTrustServiceDeps {
  readonly registry: SkillRegistry;
  /** Mutable maps shared with the registry verifier and pin resolver. */
  readonly publisherKeys: Record<string, string>;
  readonly pins: Record<string, string>;
  readonly publishers: readonly TrustedPublisherRecord[];
  readonly loadReport: readonly SkillLoadOutcome[];
  readonly store: SkillTrustStore;
}

function validKeyId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function rawEd25519Spki(raw: Buffer): Buffer {
  return Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
}

function validEd25519PublicKey(value: string): boolean {
  try {
    const clean = value.trim();
    let key;
    if (clean.includes('BEGIN PUBLIC KEY')) {
      key = createPublicKey(clean);
    } else {
      const raw = /^[0-9a-fA-F]{64}$/.test(clean)
        ? Buffer.from(clean, 'hex')
        : Buffer.from(clean, 'base64');
      if (raw.length !== 32) return false;
      key = createPublicKey({ key: rawEd25519Spki(raw), format: 'der', type: 'spki' });
    }
    return key.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

function fingerprint(publicKey: string): string {
  return createHash('sha256').update(publicKey.trim()).digest('hex').slice(0, 20);
}

export class SkillTrustService {
  private readonly registry: SkillRegistry;
  private readonly publisherKeys: Record<string, string>;
  private readonly pins: Record<string, string>;
  private readonly store: SkillTrustStore;
  private readonly publishers = new Map<string, TrustedPublisherRecord>();
  private readonly admissions: SkillLoadOutcome[];

  constructor(deps: SkillTrustServiceDeps) {
    this.registry = deps.registry;
    this.publisherKeys = deps.publisherKeys;
    this.pins = deps.pins;
    this.store = deps.store;
    this.admissions = [...deps.loadReport];
    for (const publisher of deps.publishers) this.publishers.set(publisher.keyId, publisher);
  }

  view(): SkillTrustView {
    const skillCounts = new Map<string, number>();
    for (const { manifest } of this.registry.list()) {
      skillCounts.set(manifest.publisherKeyId, (skillCounts.get(manifest.publisherKeyId) ?? 0) + 1);
    }
    const publishers = [...this.publishers.values()]
      .map((publisher): SkillPublisherView => ({
        keyId: publisher.keyId,
        fingerprint: fingerprint(publisher.publicKey),
        source: publisher.source,
        removable: publisher.source === 'operator',
        skillCount: skillCounts.get(publisher.keyId) ?? 0,
        ...(publisher.addedAt ? { addedAt: publisher.addedAt } : {}),
      }))
      .sort((a, b) => a.keyId.localeCompare(b.keyId));
    return {
      durable: this.store.isDurable(),
      publishers,
      admissions: [...this.admissions],
    };
  }

  async trustPublisher(input: {
    readonly keyId: string;
    readonly publicKey: string;
    readonly actorId: string;
  }): Promise<SkillPublisherView> {
    const keyId = input.keyId?.trim();
    const publicKey = input.publicKey?.trim();
    if (!validKeyId(keyId)) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'publisher key id must use letters, numbers, dot, colon, dash, or underscore');
    }
    if (!validEd25519PublicKey(publicKey)) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'publisher public key must be a valid ed25519 public key');
    }
    const existing = this.publishers.get(keyId);
    if (existing) {
      if (existing.publicKey !== publicKey) {
        throw createError(ErrorCode.CONFLICT, `publisher '${keyId}' already resolves to a different key`);
      }
      return this.view().publishers.find((publisher) => publisher.keyId === keyId)!;
    }
    const addedAt = new Date().toISOString();
    const stored: StoredSkillPublisher = {
      keyId,
      publicKey,
      addedBy: input.actorId,
      addedAt,
    };
    await this.store.putPublisher(stored);
    this.publisherKeys[keyId] = publicKey;
    this.publishers.set(keyId, { ...stored, source: 'operator' });
    return this.view().publishers.find((publisher) => publisher.keyId === keyId)!;
  }

  async admitManifest(input: {
    readonly manifest: SkillManifest;
    readonly actorId: string;
  }): Promise<SkillLoadOutcome> {
    const manifest = input.manifest;
    if (!manifest || typeof manifest !== 'object') {
      throw createError(ErrorCode.VALIDATION_ERROR, 'a signed skill manifest is required');
    }
    if (!this.publishers.has(manifest.publisherKeyId)) {
      throw createError(ErrorCode.VALIDATION_ERROR, `publisher '${manifest.publisherKeyId}' is not trusted`);
    }
    if (this.registry.list().some(({ manifest: admitted }) => admitted.id === manifest.id)) {
      throw createError(ErrorCode.CONFLICT, `skill '${manifest.id}' is already admitted`);
    }
    const previousPin = this.pins[manifest.id];
    if (previousPin && previousPin !== manifest.version) {
      throw createError(ErrorCode.CONFLICT, `skill '${manifest.id}' is pinned to ${previousPin}`);
    }
    this.pins[manifest.id] = manifest.version;
    const [outcome] = await this.registry.load([manifest]);
    this.admissions.push(outcome);
    if (!outcome.ok) {
      if (previousPin === undefined) delete this.pins[manifest.id];
      return outcome;
    }
    const stored: StoredSkillManifest = {
      manifest,
      addedBy: input.actorId,
      addedAt: new Date().toISOString(),
    };
    try {
      await this.store.putManifest(stored);
    } catch (error) {
      this.registry.remove(manifest.id);
      if (previousPin === undefined) delete this.pins[manifest.id];
      throw error;
    }
    return outcome;
  }

  async revokePublisher(keyIdInput: string): Promise<number> {
    const keyId = keyIdInput.trim();
    const publisher = this.publishers.get(keyId);
    if (!publisher) throw createError(ErrorCode.NOT_FOUND, 'publisher not found');
    if (publisher.source !== 'operator') {
      throw createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'built-in and environment publishers cannot be removed at runtime');
    }
    const skillIds = this.registry.list()
      .filter(({ manifest }) => manifest.publisherKeyId === keyId)
      .map(({ manifest }) => manifest.id);
    await Promise.all(skillIds.map(skillId => this.store.deleteManifest(skillId)));
    await this.store.deletePublisher(keyId);
    for (const skillId of skillIds) {
      this.registry.remove(skillId);
      delete this.pins[skillId];
    }
    delete this.publisherKeys[keyId];
    this.publishers.delete(keyId);
    return skillIds.length;
  }
}
