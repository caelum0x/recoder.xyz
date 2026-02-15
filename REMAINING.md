# Remaining Work (Mirror)

Last updated: 2026-02-14

This file is mirror-only.

Canonical remaining-work tracker:
- `/Users/arhansubasi/recoder.xyz/plan.md`

Use `plan.md` sections:
1. `0.1) Repo Closure Board (8 Repos)`
2. `0.3) Remaining to Production (Actionable, Owner-Mapped)`
3. `16) Open Blockers`
4. `19) AF Checkpoint (Latest)`

Operational commands:
1. `pnpm run af:preflight`
2. `BILLING_ACTIONS_ENABLED=false pnpm run af:networked`
3. `BILLING_ACTIONS_ENABLED=false pnpm run af:handoff`


<!-- AF_AUTO_REMAINING_START -->
## AF Auto Remaining (latest)

- Generated (UTC): 2026-02-13T22:02:54Z
- Overall: FAIL (6 failing step(s))

Outstanding failing steps:
- [BLK-L0-01][A0] AF preflight network+auth
- [BLK-L1-01][A1] A1 smoke:phase1
- [BLK-L2-01][A2] A2 gh auth status
- [BLK-L2-02][A2] A2 gh user
- [BLK-L2-02][A2] A2 create/update production-promotion environment
- [BLK-L3-01][A3] A3 pm migrate

Next commands:
1. `pnpm run af:preflight`
2. `BILLING_ACTIONS_ENABLED=false pnpm run smoke:phase1`
3. `gh auth login -h github.com`
4. `gh api user`
5. `gh api repos/caelum0x/recoder.xyz/environments/production-promotion -X PUT`
6. `set -a; source recoder-pm/.env.docker; set +a; pnpm -C recoder-pm migrate`
<!-- AF_AUTO_REMAINING_END -->
