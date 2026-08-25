# Pilot evidence release runbook

This slice replaces the separate `site/` NDJSON pilot candidate with the main
Recoder app's authenticated PostgreSQL workflow. It does not authorize or
perform a production deployment.

## Required production configuration

- `DATABASE_URL`: the main app PostgreSQL database.
- `NEXTAUTH_URL=https://recoder.xyz`: canonical same-origin mutation boundary.
- `PILOT_INTAKE_IP_HASH_SECRET`: a dedicated random secret used only to HMAC
  intake IP rate-limit keys. Do not reuse an auth, encryption, or webhook key.
- Optional `PILOT_ADMIN_ALLOWED_ORIGINS`: comma-separated additional exact
  origins for an approved staging environment. Do not use wildcards.

The operator must have `users.role = 'admin'`. The pilot API intentionally does
not accept `ADMIN_SECRET` or any browser-provided service key.

## Data cutover

1. Freeze writes to the legacy `site/` lead and pilot endpoints.
2. Copy the exact preferred and fallback NDJSON files to a protected staging
   directory. Inventory both paths; do not silently concatenate them.
3. Resolve duplicate IDs and decide which source is authoritative.
4. Apply `20260823000000_add_pilot_evidence` through the normal reviewed Prisma
   migration workflow and regenerate the Prisma client.
5. Run the importer without `--apply`. It validates every record and prints
   counts without opening a database connection:

   `pnpm --dir app pilot:evidence:import -- --leads=/absolute/leads.ndjson --pilots=/absolute/pilots.ndjson --actor-user-id=<admin-user-id>`

6. Compare counts to the frozen source and obtain data-owner approval.
7. Run the same command with
   `--apply --confirm=IMPORT_LEGACY_PILOT_EVIDENCE`. The import is one serializable
   transaction and attributes imported history to the named administrator.
8. Compare private admin counts and the public `/api/pilot-proof` aggregate.
   Public target performance remains withheld below three verified outcomes.

## Release checks

- Confirm `recoder.xyz` still routes `/`, `/api/pilot-intake`,
  `/api/admin/pilots`, `/design-partners`, `/proof`, and `/admin/pilots` to the
  main `app/` process.
- Confirm unauthenticated and non-admin sessions cannot read pilot records.
- Confirm cross-origin writes are rejected and same-origin writes require an
  `Idempotency-Key`.
- Replay an identical create and update key; verify no duplicate row/event.
- Reuse a key with a changed body; verify `409`.
- Submit concurrent updates from the same revision; verify one succeeds and one
  returns `409`.
- Verify proof responses contain aggregates only—never email, intake ID, pilot
  ID, individual metric, or proof URL.
- Review the public form and privacy-policy wording with the data owner before
  enabling navigation or deployment.

Build, typecheck, lint, tests, migration execution, import execution, and
deployment are separate release gates and were not run while authoring this
slice.
