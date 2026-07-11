# Key Custody, Rotation & Compromise Recovery Runbook

> **Status:** Draft — the sign-off table in §7 must be filled before any Phase‑1 signing ships.
> **Owner:** Security / Release Engineering
> **Spec:** `docs/superpowers/specs/2026-07-11-recoder-desktop-enterprise-architecture-design.md` — PD3, §3.9 (code-signing supply chain), §3.10 (fleet policy).
> **No secrets in this file.** It describes *custody*, not key material. Never paste keys, passwords, or API tokens here.

## 1. Purpose & Scope

This runbook is the **gate for all Phase‑1 code signing**. Nothing signed — desktop installers, auto‑update payloads, offline licenses, or fleet policy bundles — ships until every key in the inventory (§2) has a named owner and a custody entry, and the sign‑off table (§7) is complete.

It covers the full lifecycle for each trust key: where it lives, who owns it, how often it rotates, and exactly what to do when one is compromised. The governing principles (PD3):

- **No key ever lives on a build laptop.** CI signs by calling a KMS/HSM API; the private key never leaves the custody boundary.
- **Cloud KMS is the baseline; HSM is for high‑assurance keys** (license authority + any FedRAMP‑scoped key).
- **High‑assurance keys require M‑of‑N quorum** to use or rotate.
- **Trust is decoupled from transport** — a signed artifact is verified at install and at runtime, independent of how it was delivered.
- **Rotation must never brick the fielded fleet** — every pinned/trusted key rotates through a dual‑key transition window (§4).

## 2. Key Inventory

| Key | Purpose | Algorithm | Custody (target) | Owner | Rotation |
|---|---|---|---|---|---|
| macOS Developer ID Application | Sign `.app`/`.dmg`; required for Gatekeeper | Apple‑issued (P‑256) | Apple‑issued cert; API key in cloud KMS/secrets vault | *(fill §7)* | On Apple expiry (~yearly) or on compromise |
| macOS notarization (App Store Connect API key) | Notarize builds for Gatekeeper | Apple API key | Cloud KMS / secrets vault (CI‑only IAM) | *(fill §7)* | Yearly or on compromise |
| Windows Authenticode (or Azure Trusted Signing) | Sign `.exe`/`.msi`; removes SmartScreen warning | RSA‑3072 / EV cert | Azure Trusted Signing (HSM‑backed) or cloud KMS | *(fill §7)* | On CA expiry or on compromise |
| Linux GPG (`.deb`/`.rpm`) | Sign apt/yum repo packages | RSA‑4096 / Ed25519 | Cloud KMS or HSM | *(fill §7)* | 2 years or on compromise |
| AppImage signature key | Sign `.AppImage` `.sig` | Ed25519 | Cloud KMS | *(fill §7)* | 2 years or on compromise |
| **Update‑manifest key** | Sign the auto‑update manifest (`electron-updater` payload); **public key is PINNED in shipped clients** | Ed25519 | Cloud KMS (HSM if FedRAMP) | *(fill §7)* | 1 year, **dual‑key window mandatory** (§4) |
| **License‑authority key** | Sign offline license files (air‑gapped entitlement) | Ed25519 | **Dedicated HSM**, M‑of‑N quorum | *(fill §7)* | 1 year + short‑TTL revocation list |
| Fleet‑policy signing key | Sign machine‑scoped Managed Policy bundles pushed to desktops | Ed25519 | Cloud KMS (HSM if FedRAMP) | *(fill §7)* | 1 year, dual‑key window |

## 3. Custody Model (PD3)

- **Cloud KMS baseline.** AWS KMS / GCP KMS / Azure Key Vault holds the signing keys. CI has a narrowly‑scoped IAM role that can *invoke sign* but cannot *export* the private key. Every sign call is logged (who/what/when) to the tamper‑evident audit ledger.
- **Dedicated HSM for high assurance.** The license‑authority key and any FedRAMP‑scoped key live in a hardware HSM (CloudHSM / YubiHSM). These never touch cloud KMS in exportable form.
- **M‑of‑N quorum.** Using or rotating a high‑assurance key requires M‑of‑N approver quorum (e.g., 2‑of‑3). Quorum members are named in §7.
- **Separation of duties.** The engineer who triggers a signed release is not the same principal who holds a quorum share for the license‑authority key.
- **Auditability.** Every signing operation records: key id, principal, artifact hash, timestamp, and a "who triggered this build" provenance record (SLSA/in‑toto attestation).

## 4. Rotation Cadence & Dual‑Key Transition

Cadence is in the inventory (§2). The hazard is **pinned/trusted keys** (update‑manifest, license‑authority, fleet‑policy): a naive rotation invalidates trust in the fielded fleet. Every such rotation uses a **dual‑key transition window**:

1. Generate the new key in KMS/HSM; publish its public half.
2. Ship a client release that **trusts BOTH** the old and new public keys.
3. Wait until the trusting release has adequate fleet penetration (staged rollout telemetry).
4. Switch signing to the new key.
5. Only after penetration ≥ threshold: retire the old key and ship a release that trusts the new key only.

Non‑pinned keys (Apple/Windows/GPG certs) rotate on issuer expiry; re‑sign new artifacts with the new cert — no client‑side dual‑trust needed.

## 5. Compromise Recovery

General flow: **detect → revoke → rotate → re‑sign → notify**, tuned per key.

- **Update‑manifest key (pinned).** A leaked key can forge trusted updates. You **cannot** simply retire it — shipped clients pin it. Recovery: (a) immediately halt the compromised key's signing IAM; (b) if a dual‑key‑trusting release is already fielded, sign a version‑monotonic emergency update with the *other* trusted key that removes trust in the compromised key; (c) if no dual‑trust release exists, this is a **fleet‑wide trust incident** — out‑of‑band signed bridge release + customer notification. This is why the update‑manifest key is *always* fielded with a standby co‑trusted key.
- **License‑authority key (HSM).** Publish an updated short‑TTL **revocation list**; online clients pick it up within the TTL. Air‑gapped clients honor the license `notAfter` up to the agreed offline‑grace bound (a product decision, machine‑bound for high‑assurance deals) — document the residual exposure window. Rotate the HSM key under quorum; re‑issue active licenses.
- **Apple / Windows / GPG certs.** Revoke via the issuer (Apple, CA, keyserver), rotate, re‑sign current artifacts. Already‑installed apps keep working; new downloads use the new cert.
- **Fleet‑policy key.** Rotate under the dual‑key window; push a signed policy bundle that a desktop will only apply if the signature verifies against a trusted key — a spoofed bundle is rejected (deny‑by‑default).

Every compromise triggers the incident‑response runbook: forensic preservation of the audit ledger, breach‑notification timers per compliance regime, and a post‑mortem.

## 6. Update‑Channel Integrity

- **Version‑monotonic manifests.** The update manifest carries a monotonic version; `electron-updater` **rejects downgrades** (defends against roll‑back/downgrade attacks). Signature authenticity alone is insufficient — freshness is enforced too.
- **Pinned public key.** The client verifies the payload signature against the pinned update‑manifest public key before applying.
- **Staged rollout + kill switch.** Releases roll out in stages gated by health telemetry; a **signed** kill/rollback command can halt or revert a bad release.
- **Tested recovery.** The "a bad update bricked the fielded fleet" scenario has a tested recovery path (manual verified‑update import for offline/air‑gapped installs; staged emergency release for online).

## 7. Ownership & Sign‑off (GATE)

Phase‑1 signing PRs are **blocked** until every key below has a primary + backup owner and (for high‑assurance keys) named quorum members.

| Key | Primary owner | Backup owner | Quorum (high‑assurance only) |
|---|---|---|---|
| macOS Developer ID + notarization | *(TBD)* | *(TBD)* | n/a |
| Windows Authenticode / Azure Trusted Signing | *(TBD)* | *(TBD)* | n/a |
| Linux GPG + AppImage | *(TBD)* | *(TBD)* | n/a |
| Update‑manifest (Ed25519, pinned) | *(TBD)* | *(TBD)* | *(TBD, M‑of‑N)* |
| License‑authority (Ed25519, HSM) | *(TBD)* | *(TBD)* | *(TBD, M‑of‑N)* |
| Fleet‑policy signing (Ed25519) | *(TBD)* | *(TBD)* | *(TBD, M‑of‑N)* |

**Gate rule:** A Phase‑1 signing change may merge only when (a) this table has no `TBD` for the keys it touches, (b) the touched keys are provably in KMS/HSM custody (not on a build host), and (c) the dual‑key transition (§4) is in place for any pinned key it rotates.
