# Slack for Agents: GitHub Issue Pack

Source of truth: `plan.md` Phase 12 (`SFA-001` to `SFA-022`)

Use one issue per ticket below.

## SFA-001
Title: `[SFA-001] shared: publish canonical TaskEnvelope and AuditEvent schemas`
Labels: `area/interop`, `repo/shared`, `priority/p0`, `type/feature`
Repo: `shared`
Body:
- Objective: Publish versioned canonical schemas for `TaskEnvelope` and `AuditEvent`.
- Scope:
  - include required fields: `workspace_id`, `thread_id`, `trace_id`
  - document lifecycle state fields and validation constraints
  - export schema package for downstream adapters
- Dependencies: none
- Definition of Done:
  - schema package version tagged
  - validation tests pass
  - downstream repos can import without local forks
- Test checklist:
  - [ ] required fields enforced
  - [ ] invalid payloads rejected
  - [ ] package import smoke test in consumer repo

## SFA-002
Title: `[SFA-002] packages: add shared SDK helpers for state mapping and error taxonomy`
Labels: `area/interop`, `repo/packages`, `priority/p0`, `type/feature`
Repo: `packages`
Body:
- Objective: Provide shared helper APIs for canonical task-state mapping and error taxonomy.
- Scope:
  - state transition helper
  - standardized connector error classes/codes
  - adapter utility exports
- Dependencies: `SFA-001`
- Definition of Done:
  - codex/claude adapters compile against helpers
  - no duplicated local schema/error mapping remains
- Test checklist:
  - [ ] state helper unit tests
  - [ ] error taxonomy unit tests
  - [ ] consumer compile smoke test

## SFA-003
Title: `[SFA-003] docker-backend: enforce canonical task lifecycle transitions`
Labels: `area/a2a`, `repo/docker-backend`, `priority/p0`, `type/feature`
Repo: `docker-backend`
Body:
- Objective: Enforce canonical task lifecycle (`submitted -> working -> terminal`) in orchestrator.
- Scope:
  - reject illegal state jumps
  - emit deterministic transition errors
  - log transitions with `trace_id`
- Dependencies: `SFA-001`, `SFA-002`
- Definition of Done:
  - integration test covers valid/invalid transitions
  - runtime blocks invalid transitions
- Test checklist:
  - [ ] happy-path lifecycle test
  - [ ] invalid jump rejection test
  - [ ] trace logging assertion

## SFA-004
Title: `[SFA-004] docker-backend: add policy hook middleware for privileged actions`
Labels: `area/security`, `repo/docker-backend`, `priority/p0`, `type/feature`
Repo: `docker-backend`
Body:
- Objective: Route privileged connector actions through policy/approval middleware.
- Scope:
  - middleware entrypoint for privileged actions
  - policy decision payload + audit event
  - consistent policy-blocked error response
- Dependencies: `SFA-003`
- Definition of Done:
  - privileged action without approval returns policy-blocked error
  - audit event emitted for allow/deny decisions
- Test checklist:
  - [ ] deny-path test
  - [ ] allow-path test
  - [ ] audit event emission test

## SFA-005
Title: `[SFA-005] recoder-studio: remove production build bypasses and restore strict gates`
Labels: `area/reliability`, `repo/recoder-studio`, `priority/p0`, `type/chore`
Repo: `recoder-studio`
Body:
- Objective: Remove `ignoreBuildErrors`/`ignoreDuringBuilds` and keep strict quality gates.
- Scope:
  - update Next config
  - fix blocking lint/type errors
- Dependencies: none
- Definition of Done:
  - production build passes without bypass flags
- Test checklist:
  - [ ] `pnpm lint` passes
  - [ ] `pnpm typecheck` passes
  - [ ] `pnpm build` passes

## SFA-006
Title: `[SFA-006] recoder-agency: fix static chunk/media serving and MIME failures`
Labels: `area/frontend`, `repo/recoder-agency`, `priority/p0`, `type/bug`
Repo: `recoder-agency`
Body:
- Objective: Eliminate `_next/static` 404 and MIME-type errors in production.
- Scope:
  - asset path/static hosting verification
  - reverse proxy/static routing fix
  - cache invalidation strategy
- Dependencies: none
- Definition of Done:
  - no static chunk 404/MIME errors in smoke run
- Test checklist:
  - [ ] browser console clean for static assets
  - [ ] CSS/JS served with correct content-type
  - [ ] login page renders fully styled

## SFA-007
Title: `[SFA-007] recoder-frontend: fix sign-in/sign-up integration and remove placeholder Supabase paths`
Labels: `area/auth`, `repo/recoder-frontend`, `priority/p0`, `type/bug`
Repo: `recoder-frontend`
Body:
- Objective: Ensure production auth routes use Better Auth and remove placeholder Supabase endpoints.
- Scope:
  - route mapping for sign-in/sign-up/social auth
  - env and callback URL cleanup
- Dependencies: none
- Definition of Done:
  - signup/signin successful in production
  - zero `placeholder.supabase` requests
- Test checklist:
  - [ ] email sign-in
  - [ ] social sign-in
  - [ ] network trace validation

## SFA-008
Title: `[SFA-008] app: align Better Auth session handling across product surfaces`
Labels: `area/auth`, `repo/app`, `priority/p0`, `type/feature`
Repo: `app`
Body:
- Objective: Ensure consistent session lifecycle for web/frontend surfaces.
- Scope:
  - session cookie/token consistency
  - callback/session refresh correctness
- Dependencies: `SFA-007`
- Definition of Done:
  - cross-surface session persistence tests pass
- Test checklist:
  - [ ] login in one surface, continue in another
  - [ ] protected routes accessible with active session
  - [ ] logout invalidates everywhere

## SFA-009
Title: `[SFA-009] openclaw: define gateway event payload mapping to canonical task envelope`
Labels: `area/openclaw`, `repo/openclaw`, `priority/p1`, `type/feature`
Repo: `openclaw`
Body:
- Objective: Produce stable mapping spec from OpenClaw gateway events to canonical A2A task envelope.
- Scope:
  - payload field mapping
  - validation constraints
  - error handling rules
- Dependencies: `SFA-001`
- Definition of Done:
  - mapping spec committed
  - payload validation tests pass
- Test checklist:
  - [ ] sample event conversion tests
  - [ ] required field coverage
  - [ ] invalid payload rejection

## SFA-010
Title: `[SFA-010] docker-backend: implement OpenClaw adapter endpoint with trace propagation`
Labels: `area/a2a`, `repo/docker-backend`, `priority/p1`, `type/feature`
Repo: `docker-backend`
Body:
- Objective: Add adapter endpoint that converts OpenClaw events into traceable A2A tasks.
- Scope:
  - ingest endpoint
  - trace propagation
  - task creation + lifecycle bootstrapping
- Dependencies: `SFA-009`, `SFA-003`
- Definition of Done:
  - OpenClaw event creates task with `trace_id`
- Test checklist:
  - [ ] endpoint contract test
  - [ ] task creation integration test
  - [ ] trace propagation assertion

## SFA-011
Title: `[SFA-011] backend: persist interop trace fields in logs and response metadata`
Labels: `area/backend`, `repo/backend`, `priority/p1`, `type/feature`
Repo: `backend`
Body:
- Objective: Add interop trace observability in backend responses/logs.
- Scope:
  - include `trace_id`, `connector_id` metadata in relevant responses
  - structured logging for interop requests
- Dependencies: `SFA-010`
- Definition of Done:
  - trace fields visible in logs and response metadata
- Test checklist:
  - [ ] structured log assertions
  - [ ] response metadata contract test

## SFA-012
Title: `[SFA-012] recoder-studio: ship MVP interop UI (delegate/status/approval timeline) behind feature flag`
Labels: `area/product`, `repo/recoder-studio`, `priority/p1`, `type/feature`
Repo: `recoder-studio`
Body:
- Objective: Provide first user-facing Slack-for-Agents workflow in Studio.
- Scope:
  - delegate action UI
  - connector status indicator
  - approval timeline panel
  - feature flag guard
- Dependencies: `SFA-003`, `SFA-004`
- Definition of Done:
  - user can delegate task and view timeline states
- Test checklist:
  - [ ] UI flow E2E test
  - [ ] feature flag on/off behavior
  - [ ] error-state rendering tests

## SFA-013
Title: `[SFA-013] recoder-pm: emit standardized interop and funnel analytics events`
Labels: `area/analytics`, `repo/recoder-pm`, `priority/p1`, `type/feature`
Repo: `recoder-pm`
Body:
- Objective: Emit consistent events for delegated task lifecycle and funnel stages.
- Scope:
  - event taxonomy implementation
  - include connector + trace fields
- Dependencies: `SFA-012`
- Definition of Done:
  - events visible in analytics with expected fields
- Test checklist:
  - [ ] event schema validation
  - [ ] analytics pipeline smoke test

## SFA-014
Title: `[SFA-014] tools: add CI connector-contract gate and support snapshot generation`
Labels: `area/ci`, `repo/tools`, `priority/p1`, `type/feature`
Repo: `tools`
Body:
- Objective: Block releases when connector contract checks fail; generate support snapshot artifact.
- Scope:
  - CI required check integration
  - support snapshot JSON/MD artifact
- Dependencies: `SFA-001` to `SFA-004`
- Definition of Done:
  - CI blocks failed contracts
  - snapshot artifact generated in pipeline
- Test checklist:
  - [ ] failing-contract gate test
  - [ ] artifact existence check

## SFA-015
Title: `[SFA-015] recoder-web: ship /platform/a2a and /platform/openclaw pages with CTA and schema markup`
Labels: `area/growth`, `repo/recoder-web`, `priority/p1`, `type/feature`
Repo: `recoder-web`
Body:
- Objective: Publish platform positioning pages for interop product messaging.
- Scope:
  - `/platform/a2a`
  - `/platform/openclaw`
  - CTA + analytics + schema markup
- Dependencies: `SFA-012`
- Definition of Done:
  - pages live and indexable
- Test checklist:
  - [ ] route availability
  - [ ] metadata/schema validation
  - [ ] analytics event on CTA

## SFA-016
Title: `[SFA-016] recoder-web: publish multi-agent comparison and use-case pages`
Labels: `area/growth`, `repo/recoder-web`, `priority/p1`, `type/content`
Repo: `recoder-web`
Body:
- Objective: Create BOFU pages explaining workflow differentiation.
- Scope:
  - at least 3 pages for comparison/use-cases
  - canonical + OG metadata
- Dependencies: `SFA-015`
- Definition of Done:
  - pages indexed and linked from platform nav
- Test checklist:
  - [ ] metadata checks
  - [ ] internal link checks

## SFA-017
Title: `[SFA-017] tools: automate weekly evidence pack job for interop SLOs`
Labels: `area/ops`, `repo/tools`, `priority/p1`, `type/feature`
Repo: `tools`
Body:
- Objective: Produce weekly evidence pack with connector reliability and policy metrics.
- Scope:
  - scheduled workflow/job
  - success, latency, policy-block, approval metrics
  - artifact publication
- Dependencies: `SFA-014`
- Definition of Done:
  - weekly evidence artifact produced automatically
- Test checklist:
  - [ ] schedule trigger test
  - [ ] artifact content validation

## SFA-018
Title: `[SFA-018] recoder-skill: add CI branding drift scan for legacy names`
Labels: `area/brand`, `repo/recoder-skill`, `priority/p1`, `type/chore`
Repo: `recoder-skill`
Body:
- Objective: Fail CI when public UI still contains legacy branding strings.
- Scope:
  - scanner for `kortix`, `suna`, `bolt.new`
  - CI integration
- Dependencies: none
- Definition of Done:
  - CI fails on legacy string match in scoped paths
- Test checklist:
  - [ ] positive detection test
  - [ ] false-positive exclusion test

## SFA-019
Title: `[SFA-019] apps/mobile: add delegated-task visibility and activation events`
Labels: `area/mobile`, `repo/apps-mobile`, `priority/p1`, `type/feature`
Repo: `apps/mobile`
Body:
- Objective: Surface delegated task status on mobile and emit activation telemetry.
- Scope:
  - task list/status UI
  - event emission hooks
- Dependencies: `SFA-012`
- Definition of Done:
  - mobile can display delegated task states and emit required events
- Test checklist:
  - [ ] UI state rendering test
  - [ ] analytics payload test

## SFA-020
Title: `[SFA-020] apps/desktop: add delegated-task trigger and status polling`
Labels: `area/desktop`, `repo/apps-desktop`, `priority/p1`, `type/feature`
Repo: `apps/desktop`
Body:
- Objective: Enable desktop-triggered delegation and state monitoring.
- Scope:
  - trigger action
  - status polling/subscription
- Dependencies: `SFA-012`
- Definition of Done:
  - desktop can create delegated task and track status lifecycle
- Test checklist:
  - [ ] trigger action test
  - [ ] status update handling test

## SFA-021
Title: `[SFA-021] shared: create Tier-2 connector RFC templates and initial drafts`
Labels: `area/interop`, `repo/shared`, `priority/p2`, `type/design`
Repo: `shared`
Body:
- Objective: Prepare Tier-2 RFC pack for `cursor`, `windsurf`, `replit`, `vscode-copilot`, `jetbrains`.
- Scope:
  - common RFC template
  - one initial draft per connector
  - policy mapping matrix section
- Dependencies: `SFA-017`
- Definition of Done:
  - RFC drafts exist for all Tier-2 connectors
- Test checklist:
  - [ ] required sections present in each RFC

## SFA-022
Title: `[SFA-022] tools: add Tier-2 connector promotion checklist validator`
Labels: `area/ci`, `repo/tools`, `priority/p2`, `type/feature`
Repo: `tools`
Body:
- Objective: Validate promotion prerequisites for Tier-2 connectors before status change.
- Scope:
  - checklist validator command/workflow
  - fail on missing evidence/RFC/policy mapping
- Dependencies: `SFA-021`
- Definition of Done:
  - promotion attempts blocked unless checklist is complete
- Test checklist:
  - [ ] missing-prereq fail test
  - [ ] complete-prereq pass test

