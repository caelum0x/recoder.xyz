# Slack for Agents Issues: tools

Generated from `SLACK_FOR_AGENTS_GITHUB_ISSUES.md`.

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
