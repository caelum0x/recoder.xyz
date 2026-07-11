# P0d — Desktop Managed-Policy Schema + Key-Custody Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Add a fail-closed **Managed Policy** schema + validator to the desktop app so enterprise admins can push signed machine-scoped policy (update-channel allowlist, backend mode, telemetry sink, retention, feature gates) with safe defaults when absent/invalid. (2) Write the **key-custody + rotation + compromise-recovery runbook** (spec PD3) that gates all Phase-1 code signing.

**Architecture:** `apps/desktop/managed-policy.js` (CommonJS, matching `main.js`/`backend-supervisor.js`) exposes a PURE `parseManagedPolicy(raw)` that fail-closes each field to a frozen `DEFAULT_POLICY`, plus `managedPolicyPath(platform)` (per-OS location) and a thin `loadManagedPolicy(deps)` that reads + parses with total fail-closed behavior. The runbook is a markdown deliverable. Spec: `docs/superpowers/specs/2026-07-11-recoder-desktop-enterprise-architecture-design.md` §3.9, §3.10, PD3.

**Tech Stack:** CommonJS JS (`require`/`module.exports`), **vitest ^3** (`import { describe, it, expect } from 'vitest'`; load the CJS module via `createRequire`), markdown.

## Global Constraints

- `apps/desktop` is CommonJS; the module under test uses `module.exports`. Tests are ESM `.js` in `apps/desktop/__tests__/` loaded with `createRequire(import.meta.url)`. Run: `cd apps/desktop && npx vitest run __tests__/managed-policy.test.js`.
- `parseManagedPolicy` MUST be **pure** and **fail-closed**: any missing/invalid field falls back to its conservative `DEFAULT_POLICY` value; the return is `Object.freeze`d (deep). MDM/managed policy overrides user — but an ABSENT policy yields the safe default, never an unlocked/permissive state.
- Conservative defaults: `updateChannels: ['stable']` only; `backendMode: 'embedded'`; `telemetry.enabled: false`; `features: {}` (nothing unlocked); `retentionDays: 90`.
- Known update channels are exactly `stable | beta | enterprise`; known backend modes are exactly `embedded | self_host | fleet`.
- No secrets in the runbook — it describes custody, not key material.

---

### Task 1: Managed Policy schema + fail-closed validator

**Files:**
- Create: `apps/desktop/managed-policy.js`
- Create (test): `apps/desktop/__tests__/managed-policy.test.js`

**Interfaces:**
- Produces (CommonJS exports): `DEFAULT_POLICY` (frozen), `parseManagedPolicy(raw): ManagedPolicy`, `managedPolicyPath(platform): string`, `loadManagedPolicy(deps): ManagedPolicy` where `deps = { readFileSync, platform }`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/__tests__/managed-policy.test.js`:

```javascript
/**
 * managed-policy tests — pure, fail-closed policy parsing + per-OS path + load.
 * No Electron, no real fs.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { DEFAULT_POLICY, parseManagedPolicy, managedPolicyPath, loadManagedPolicy } = require('../managed-policy.js');

describe('parseManagedPolicy (fail-closed)', () => {
  it('returns conservative defaults for empty/absent input', () => {
    const p = parseManagedPolicy(undefined);
    expect(p.updateChannels).toEqual(['stable']);
    expect(p.backendMode).toBe('embedded');
    expect(p.telemetry.enabled).toBe(false);
    expect(p.features).toEqual({});
    expect(p.retentionDays).toBe(90);
    expect(p.source).toBe('default');
  });

  it('marks source "managed" and keeps valid fields', () => {
    const p = parseManagedPolicy({
      updateChannels: ['stable', 'enterprise'],
      backendMode: 'fleet',
      fleetEndpoint: 'https://fleet.acme.internal',
      telemetry: { enabled: true, otlpEndpoint: 'https://otlp.acme', siemSink: 'splunk' },
      retentionDays: 365,
      features: { advancedAnalytics: true },
    });
    expect(p.source).toBe('managed');
    expect(p.updateChannels).toEqual(['stable', 'enterprise']);
    expect(p.backendMode).toBe('fleet');
    expect(p.telemetry.enabled).toBe(true);
    expect(p.retentionDays).toBe(365);
  });

  it('drops unknown update channels and never yields an empty allowlist', () => {
    const p = parseManagedPolicy({ updateChannels: ['stable', 'nightly', 'canary'] });
    expect(p.updateChannels).toEqual(['stable']);
    const q = parseManagedPolicy({ updateChannels: ['bogus'] });
    expect(q.updateChannels).toEqual(['stable']); // fail-closed to stable, not empty
  });

  it('falls back to embedded for an unknown backend mode', () => {
    expect(parseManagedPolicy({ backendMode: 'root' }).backendMode).toBe('embedded');
  });

  it('coerces invalid telemetry/retention to safe defaults', () => {
    const p = parseManagedPolicy({ telemetry: 'yes', retentionDays: -5 });
    expect(p.telemetry.enabled).toBe(false);
    expect(p.retentionDays).toBe(90);
  });

  it('returns a deeply frozen policy', () => {
    const p = parseManagedPolicy({ backendMode: 'self_host' });
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.telemetry)).toBe(true);
    expect(() => { p.backendMode = 'x'; }).toThrow();
  });
});

describe('managedPolicyPath', () => {
  it('returns per-OS machine-scoped paths', () => {
    expect(managedPolicyPath('darwin')).toContain('/Library/Managed Preferences/');
    expect(managedPolicyPath('linux')).toBe('/etc/recoder/managed-policy.json');
    expect(managedPolicyPath('win32').toLowerCase()).toContain('programdata');
  });
});

describe('loadManagedPolicy (fail-closed on any error)', () => {
  it('returns DEFAULT_POLICY when the file is missing', () => {
    const p = loadManagedPolicy({
      platform: 'linux',
      readFileSync: () => { throw new Error('ENOENT'); },
    });
    expect(p).toEqual(DEFAULT_POLICY);
  });

  it('parses a present, valid policy file', () => {
    const p = loadManagedPolicy({
      platform: 'linux',
      readFileSync: () => JSON.stringify({ backendMode: 'self_host' }),
    });
    expect(p.backendMode).toBe('self_host');
    expect(p.source).toBe('managed');
  });

  it('returns DEFAULT_POLICY on malformed JSON (never throws)', () => {
    const p = loadManagedPolicy({
      platform: 'linux',
      readFileSync: () => '{ not json',
    });
    expect(p).toEqual(DEFAULT_POLICY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && npx vitest run __tests__/managed-policy.test.js`
Expected: FAIL — cannot find module `../managed-policy.js`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/managed-policy.js`:

```javascript
/**
 * Managed Policy — the signed, machine-scoped enterprise policy the desktop
 * reads before its first window. Fail-closed: an absent or invalid policy
 * yields conservative defaults, never a permissive/unlocked state. MDM overrides
 * user settings; this module only parses + validates. (Spec §3.10.)
 *
 * @typedef {Object} ManagedPolicy
 * @property {string[]} updateChannels   Allowlisted update channels (subset of stable|beta|enterprise).
 * @property {'embedded'|'self_host'|'fleet'} backendMode
 * @property {string|null} fleetEndpoint
 * @property {{enabled:boolean, otlpEndpoint:string|null, siemSink:string|null}} telemetry
 * @property {number} retentionDays
 * @property {Object} features           Feature gates; empty = nothing unlocked.
 * @property {'default'|'managed'} source
 */

const path = require('path');

const KNOWN_CHANNELS = ['stable', 'beta', 'enterprise'];
const KNOWN_BACKEND_MODES = ['embedded', 'self_host', 'fleet'];

/** @type {ManagedPolicy} */
const DEFAULT_POLICY = Object.freeze({
  updateChannels: Object.freeze(['stable']),
  backendMode: 'embedded',
  fleetEndpoint: null,
  telemetry: Object.freeze({ enabled: false, otlpEndpoint: null, siemSink: null }),
  retentionDays: 90,
  features: Object.freeze({}),
  source: 'default',
});

function toChannelAllowlist(value) {
  if (!Array.isArray(value)) return ['stable'];
  const filtered = value.filter((c) => KNOWN_CHANNELS.includes(c));
  return filtered.length > 0 ? filtered : ['stable'];
}

function toBackendMode(value) {
  return KNOWN_BACKEND_MODES.includes(value) ? value : 'embedded';
}

function toTelemetry(value) {
  const t = value && typeof value === 'object' ? value : {};
  return {
    enabled: t.enabled === true,
    otlpEndpoint: typeof t.otlpEndpoint === 'string' ? t.otlpEndpoint : null,
    siemSink: typeof t.siemSink === 'string' ? t.siemSink : null,
  };
}

function toRetentionDays(value) {
  return Number.isInteger(value) && value > 0 ? value : 90;
}

/**
 * Parse + validate a raw managed-policy object, fail-closed per field.
 * @param {unknown} raw
 * @returns {ManagedPolicy}
 */
function parseManagedPolicy(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_POLICY;
  const telemetry = toTelemetry(raw.telemetry);
  return Object.freeze({
    updateChannels: Object.freeze(toChannelAllowlist(raw.updateChannels)),
    backendMode: toBackendMode(raw.backendMode),
    fleetEndpoint: typeof raw.fleetEndpoint === 'string' ? raw.fleetEndpoint : null,
    telemetry: Object.freeze(telemetry),
    retentionDays: toRetentionDays(raw.retentionDays),
    features: Object.freeze(raw.features && typeof raw.features === 'object' ? { ...raw.features } : {}),
    source: 'managed',
  });
}

/**
 * The machine-scoped managed-policy location per OS.
 * @param {string} platform  process.platform value.
 * @returns {string}
 */
function managedPolicyPath(platform) {
  if (platform === 'darwin') {
    return '/Library/Managed Preferences/xyz.recoder.desktop.plist';
  }
  if (platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(programData, 'Recoder', 'managed-policy.json');
  }
  return '/etc/recoder/managed-policy.json';
}

/**
 * Load + parse the managed policy. Fail-closed: any read/parse error returns
 * DEFAULT_POLICY. Inject fs + platform for testability.
 * @param {{ readFileSync: (p: string) => string, platform: string }} deps
 * @returns {ManagedPolicy}
 */
function loadManagedPolicy(deps) {
  try {
    const raw = deps.readFileSync(managedPolicyPath(deps.platform));
    return parseManagedPolicy(JSON.parse(raw));
  } catch {
    return DEFAULT_POLICY;
  }
}

module.exports = { DEFAULT_POLICY, parseManagedPolicy, managedPolicyPath, loadManagedPolicy };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && npx vitest run __tests__/managed-policy.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/managed-policy.js apps/desktop/__tests__/managed-policy.test.js
git commit -m "feat(desktop): fail-closed Managed Policy schema + validator + per-OS loader

Absent/invalid managed policy yields conservative defaults (stable channel,
embedded backend, telemetry off, no features). MDM machine-scoped path per OS."
```

---

### Task 2: Key-custody + signing runbook (PD3)

**Files:**
- Create: `docs/runbooks/key-custody-and-signing.md`

**Context:** Spec PD3 requires a written key-custody + rotation + compromise-recovery runbook before any Phase-1 signing ships. This is a documentation deliverable — no code, no test. Verification is that it exists and covers the required sections. Do NOT include any real key material or secrets.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/key-custody-and-signing.md` with these sections, each filled with concrete, actionable content (not placeholders):

1. **Purpose & scope** — this runbook gates all Phase-1 code signing; nothing signed ships until each key below has a named owner + custody entry.
2. **Key inventory** — a table of every signing/trust key: macOS Developer ID Application + notarization (Apple ID/API key), Windows Authenticode (or Azure Trusted Signing), Linux GPG (`.deb`/`.rpm`) + AppImage `.sig` key, the **ed25519 update-manifest key** (auto-update payload signature), and the **license-authority key** (offline license ed25519). For each: purpose, algorithm, where it lives (custody), named owner, and rotation cadence.
3. **Custody model (PD3)** — cloud KMS (AWS KMS / GCP KMS / Azure Key Vault) as the baseline for signing keys; dedicated HSM (CloudHSM / YubiHSM) for the license-authority key and any FedRAMP-scoped keys. M-of-N quorum for high-assurance keys. No key ever on a build laptop; CI signs via KMS/HSM API.
4. **Rotation cadence** — per-key rotation schedule + a **dual-key transition window** (publish new public key/manifest signer alongside the old, ship an update that trusts both, then retire the old) so a rotation never bricks the fielded fleet.
5. **Compromise recovery** — per-key runbook: detect → revoke → rotate → re-sign → notify. Include the update-manifest key case (pinned in shipped clients → requires a dual-key-trusting bridge release BEFORE the compromised key can be retired) and the license-authority case (short-TTL revocation list + offline-grace policy).
6. **Update-channel integrity** — version-monotonic signed manifests (reject downgrade), staged rollout, signed kill/rollback command, tested "bad update bricked the fleet" recovery path.
7. **Ownership & sign-off** — a table of key → owner → backup owner, and the gate rule: Phase-1 signing PRs are blocked until this table is filled for every key in the inventory.

- [ ] **Step 2: Verify the runbook covers all required sections**

Run: `grep -cE "^#{1,3} " docs/runbooks/key-custody-and-signing.md`
Expected: at least 7 (the seven top-level sections).
Run: `grep -qiE "dual-key|version-monotonic|compromise|rotation|HSM|KMS" docs/runbooks/key-custody-and-signing.md && echo "COVERS KEY TOPICS"`
Expected: `COVERS KEY TOPICS`.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/key-custody-and-signing.md
git commit -m "docs(runbook): key-custody + rotation + compromise-recovery (PD3) — gates Phase-1 signing"
```

---

## Self-Review

- **Spec coverage:** Task 1 ⇒ §3.10 Managed Policy (signed, machine-scoped, fail-closed, per-OS path, MDM-overrides-user precedence via `source: 'managed'`); Task 2 ⇒ PD3 key-custody runbook + §3.9 update-channel integrity. The signed-manifest *verification code* and MDM *deployment packaging* (MSI/ADMX/Jamf) are Phase-1 build work, deferred.
- **Placeholder scan:** none in the code task — real code + exact commands. Task 2 is a doc whose section list is concrete; the implementer fills each with real content (the verification greps guard against empty sections).
- **Type/behavior consistency:** `DEFAULT_POLICY` shape matches every `parseManagedPolicy` return; `loadManagedPolicy` reuses `managedPolicyPath` + `parseManagedPolicy`; fail-closed on every path (empty, unknown channel, bad mode, bad telemetry, missing file, malformed JSON) is tested.
- **Fail-closed:** absent/invalid policy → conservative defaults; frozen return prevents mutation. Matches Global Constraints.

## Follow-on (deferred)

- **P0d-2:** wire `loadManagedPolicy` into `main.js` boot (before first window), gate `electron-updater` channel selection on `policy.updateChannels`, and gate backend mode on `policy.backendMode`. Plus signed-manifest verification (ed25519, version-monotonic) in the update path.
