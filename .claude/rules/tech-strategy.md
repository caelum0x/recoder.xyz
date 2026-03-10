# Recoder Tech Strategy

This document defines engineering defaults for AI-assisted work in this repository.

## 1) Product and Platform Strategy

1. Ship a unified multi-app platform with `recoder.xyz` as identity and control plane.
2. Optimize for production correctness over local convenience.
3. Prefer deterministic scripts for verification over manual claims.
4. Keep architecture evolvable: shared contracts, isolated app responsibilities.

## 2) Architecture Standards

1. Auth:
   - Better Auth is centralized on `recoder.xyz`.
   - Cross-subdomain session behavior is a release gate.
2. Data:
   - Do not merge `user` and `users` models.
   - Enforce production-safe DB URL validation (no localhost/sqlite drift).
3. Billing:
   - Health endpoints must reflect true provider readiness.
   - Missing keys must degrade safely with explicit errors.
4. Runtime:
   - PM2-first app runtime, Docker for supporting infra.
   - Config and env must be auditable and script-verifiable.

## 3) Implementation Standards

1. Keep changes scoped to the task; avoid opportunistic rewrites.
2. Reuse existing libraries/services before adding new abstractions.
3. Avoid hardcoded domains/localhost in production paths.
4. Keep secrets out of repo; use env vars and templates only.
5. Preserve compatibility contracts for CLI and cross-app integrations.

## 4) Quality and Verification

1. Every non-trivial change must include at least one verification artifact:
   - targeted unit test, or
   - deterministic script run, or
   - reproducible runtime check.
2. For auth/billing/email/monitoring changes, use existing script suite first.
3. Do not mark tasks complete if verification is blocked; report blockers explicitly.

## 5) Operational Guardrails

1. Update status docs when work advances:
   - `plan.md`
   - `tasks/todo.md`
   - `tasks/lessons.md` for recurring patterns/corrections
2. Production checks should be automatable; prefer one-command closeout flows.
3. When external access is required (keys, GSC, mailbox), provide exact runbook steps and env vars.

## 6) Current Priority Order

1. Production stability and auth integrity.
2. Billing and email delivery correctness.
3. Monitoring and alert routing reliability.
4. UX/design consistency only after runtime correctness is secured.
