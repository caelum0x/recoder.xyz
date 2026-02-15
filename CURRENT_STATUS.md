## Recoder Current Status (Mirror)

Last updated: 2026-02-14

This file is mirror-only.

Canonical tracker:
- `/Users/arhansubasi/recoder.xyz/plan.md`

Use `plan.md` for:
1. Subagent status and ownership
2. Active blockers and mitigations
3. Production closeout checklist across all repos
4. Go/no-go decisions

Operational commands:
1. `pnpm run af:preflight`
2. `BILLING_ACTIONS_ENABLED=false pnpm run af:networked`
3. `BILLING_ACTIONS_ENABLED=false pnpm run af:handoff`


<!-- AF_AUTO_STATUS_START -->
### AF Auto Sync (latest)

- Generated (UTC): 2026-02-13T22:02:54Z
- AF run status: skipped
- Billing mode: false
- Overall: FAIL (6 failing step(s))
- Source AF log: `/Users/arhansubasi/recoder.xyz/logs/af-networked/20260214-005537.log`
- Handoff markdown: `/Users/arhansubasi/recoder.xyz/logs/af-networked/handoff/20260213-220254Z-summary.md`
- Handoff json: `/Users/arhansubasi/recoder.xyz/logs/af-networked/handoff/20260213-220254Z-summary.json`

Failing steps:
- [BLK-L0-01][A0] AF preflight network+auth
- [BLK-L1-01][A1] A1 smoke:phase1
- [BLK-L2-01][A2] A2 gh auth status
- [BLK-L2-02][A2] A2 gh user
- [BLK-L2-02][A2] A2 create/update production-promotion environment
- [BLK-L3-01][A3] A3 pm migrate
<!-- AF_AUTO_STATUS_END -->
