# Unified Agent Interop Architecture
## Core (A2A) + Adapters (UACB) + Ops (Blueprint)

**Version:** 1.0  
**Date:** 2026-02-15  
**Status:** Active architecture baseline

---

## 1. Purpose

Define one canonical architecture that unifies:
1. Agent runtime collaboration (A2A control plane).
2. Platform interoperability adapters (UACB connector layer).
3. Production release governance and evidence (Ecosystem Blueprint).

This document is the implementation baseline for interop work. Platform-specific PRDs remain as reference detail, not as competing architecture sources.

---

## 2. Hard Decisions (Locked)

1. **One control plane**
A2A registry + task lifecycle + approval/audit is the canonical runtime.

2. **One connector layer**
All external platform integrations are UACB adapters behind the control plane.

3. **One policy plane**
Identity, approvals, sandbox rules, and audit policy are centralized and shared.

4. **One release gate**
No connector is "supported" until it passes blueprint evidence gates.

---

## 3. Architecture Boundaries

### 3.1 Core (A2A Control Plane)

Owns:
1. Agent identity and registration.
2. Capability discovery.
3. Task lifecycle (`submitted`, `working`, `input-required`, `completed`, `cancelled`, `failed`).
4. Approval/audit event model.
5. Collaboration primitives (channels/threads/DMs as control-plane concepts).

Does not own:
1. Vendor-specific protocol details.
2. IDE-specific implementation quirks.

### 3.2 Adapters (UACB Connector Layer)

Owns:
1. Protocol adapters (`MCP`, `JSON-RPC`, `LSP`, `REST`, `File/Git`).
2. Platform connectors implementing a common connector interface.
3. Context extraction and translation from platform-native data to control-plane models.

Does not own:
1. Canonical task state semantics.
2. Canonical policy decisions.
3. Release support status.

### 3.3 Ops (Blueprint Release Plane)

Owns:
1. Deterministic checks and smoke gates.
2. Promotion criteria and evidence bundles.
3. Support-status promotion/demotion decisions.

Does not own:
1. Connector protocol implementation.
2. A2A task runtime internals.

---

## 4. Canonical Planes

### 4.1 Control Plane Services

1. `agent-registry`
2. `task-orchestrator`
3. `approval-policy-engine`
4. `audit-log-service`
5. `collaboration-service`

### 4.2 Connector Plane Services

1. `connector-manager`
2. `mcp-adapter`
3. `jsonrpc-adapter`
4. `lsp-adapter`
5. `rest-adapter`
6. `file-git-adapter`

### 4.3 Policy Plane Services

1. `identity-service` (agent/service authn)
2. `authorization-service` (RBAC/ACL/capabilities)
3. `sandbox-policy-service`
4. `approval-workflow-service`
5. `audit-signing-service`

### 4.4 Release Gate Plane

1. `phase3-production-gates.sh`
2. `a5-release-evidence.sh`
3. `check-phase3-ga-ready.sh`
4. `phase3-evidence-pack.sh`
5. Signoff workflows in GitHub Actions

---

## 5. Connector Tiers

### 5.1 Tier-1 (Active now)

1. `codex`
2. `claude`

Support target:
1. Deterministic CI checks.
2. Contract parity with control-plane models.
3. Production smoke evidence.
4. Approval/policy integration validated.

### 5.2 Tier-2 (Backlog until GA closeout)

1. `cursor`
2. `windsurf`
3. `replit`
4. `vscode-copilot`
5. `jetbrains`
6. Other future connectors

Promotion precondition:
1. No-skip Phase 3 closeout completed.
2. `phase3:assert-ga-ready` passes.
3. Evidence pack generated from no-skip run.

---

## 6. Unified Connector Contract

Every connector must implement:

1. `discoverCapabilities()`
2. `submitTask(task)`
3. `streamTaskUpdates(taskId)`
4. `cancelTask(taskId)`
5. `extractContext(scope)`
6. `mapPlatformActionToPolicyAction(action)`
7. `emitAuditEvent(event)`

Required behavior:
1. Use canonical control-plane task states.
2. Route privileged actions through policy engine.
3. Emit structured audit events for approvals and execution.
4. Return deterministic error taxonomy.

---

## 7. Support Status Rules

A connector is **Supported** only when:
1. Tier is eligible (`Tier-1` now, `Tier-2` after precondition).
2. Contract tests pass.
3. Smoke tests pass.
4. Approval/policy tests pass.
5. Release evidence artifacts are attached.

A connector is **Experimental** when:
1. Integrated but lacking one or more support gates.

A connector is **Backlog** when:
1. Design/prototype exists but promotion precondition is not met.

---

## 8. Migration From Existing PRDs

1. A2A PRD contributes control-plane concepts and agent collaboration runtime.
2. UACB PRD contributes adapter and connector implementation patterns.
3. Blueprint contributes release governance and support gating.

Conflict resolution rule:
1. Runtime semantics -> this document + A2A control-plane sections.
2. Connector mechanics -> this document + UACB adapter sections.
3. Production support decisions -> Blueprint gates and evidence only.

---

## 9. Immediate Implementation Sequence

1. Keep only `codex` and `claude` in active connector execution lanes.
2. Align A2A gateway outputs to unified task + audit models.
3. Align Codex/Claude adapters to shared policy hooks.
4. Add/verify release-gate checks that mark connector support status.
5. Keep Tier-2 connectors as backlog entries until no-skip closeout succeeds.

---

## 10. Ownership

1. Control plane owner: A2A/runtime team.
2. Connector plane owner: interop/adapter team.
3. Policy plane owner: platform security/runtime governance.
4. Release gate owner: production operations/release management.

