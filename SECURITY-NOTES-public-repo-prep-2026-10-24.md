# Security notes — public-repo prep, 2026-10-24

Context: owner approved open-sourcing this repo (`caelum0x/recoder.xyz`) on 2026-10-24
(see `~/products/PORTFOLIO-PRIORITIES-2026-10-23.md`, "DECISION — web traffic triage,
2026-10-24"). Before flipping visibility, ran a full `git log --all` secrets scan
(working tree + entire history, not just HEAD).

## RESULT: repo stays PRIVATE — real, specific-format secrets found in history

## Critical finding: `UNIFIED_AUTH_CONFIG.env`

File `UNIFIED_AUTH_CONFIG.env` was committed at the repo root across several early
commits (`303b90738f`, `7aa8940a30`, `eb3e23c190`), then partially redacted in three
later "Sanitize committed production config artifacts" commits (`9e984b12d7`,
`be02c8caa9`, `50398bb1f8` — these only replaced the Stripe placeholder lines, not
the real secrets below), and finally deleted entirely in `b01c2e2276`/`8ef42392ad`.
**The file is not in the current working tree or current HEAD, but the original
plaintext values are still fully readable in `git log --all` / any clone of the
repo's history.**

Real-shaped secrets found in the original commit (`303b90738f:UNIFIED_AUTH_CONFIG.env`):

| Variable | Value (redacted — full value found in git history, not reproduced here) | Risk |
|---|---|---|
| `NEXTAUTH_SECRET` | `[REDACTED, 64-char hex]` | Session/JWT signing — anyone with this can forge auth sessions |
| `UNIFIED_AUTH_SECRET` | `[REDACTED, 64-char hex]` | Cross-platform auth signing |
| `JWT_SECRET` | `[REDACTED, 64-char hex]` | JWT signing (also reused as `API_ENCRYPTION_KEY` — see below) |
| `SESSION_SYNC_SECRET` | `[REDACTED, 64-char hex]` | Cross-platform session sync |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-[REDACTED]` | Real Google OAuth client secret format (`GOCSPX-` prefix). Paired with client ID `716966330476-q7kh...apps.googleusercontent.com` (client IDs are not secret) |
| `GITHUB_SECRET` | `[REDACTED, 40-char hex]` | GitHub OAuth App secret, paired with `GITHUB_ID="Ov23liaX8cGXq7VGX3bP"` (app IDs are not secret) |
| `DATABASE_URL` / `DIRECT_URL` / `POSTGRES_URL` | `postgresql://neondb_owner:npg_[REDACTED]@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?...` | Full Neon Postgres connection string with real-shaped password (`npg_` prefix is Neon's real password format) |
| `DODO_PAYMENTS_API_KEY` | `[REDACTED]` | Real-shaped Dodo Payments API key |
| `API_ENCRYPTION_KEY` | same value as `JWT_SECRET` above, redacted | API auth |
| `RECODER_API_KEY` | `recoder_sk_live_[REDACTED]` | Internal API key, `_live_` in the name |

**Redaction note (2026-10-24, later pass):** the first version of this file reproduced several of the above values in full (not actually truncated despite the column header), which handed GitGuardian a *fresh, current, easily-scraped* copy of live-shaped secrets in HEAD — worse than the original problem of them being buried in old deleted-file history. This revision strips the actual values. The original full values are still recoverable from this file's own git history (`303b90738f` etc. for the original leak, and this file's first commit `43ee0b62b3` for the re-exposure) — rotation is the only real fix, not redaction after the fact.

**Why I believe this may still be live, not just historical noise:** `plans/recoder.md`
(line 9, dated 2026-10-21) independently documents that the live production box
(`92.5.156.133:/opt/recoder/app.env.local`) currently uses a **real** Google OAuth
`client_id` beginning `716966330476-...apps.googleusercontent.com` — the same Google
Cloud project number (`716966330476`) as the leaked `GOOGLE_CLIENT_ID` above. I cannot
confirm from this machine whether it's the *exact same* OAuth client, but the project
match makes "already fully rotated and unrelated" an unsafe assumption.

## Other patterns checked (all false positives / already clean)

Ran `git log --all -G<pattern>` for `AKIA...`, `sk_live_`/`pk_live_`/`rk_live_`,
`-----BEGIN ... PRIVATE KEY-----`, `postgres(ql)://user:pass@host`,
`mongodb(+srv)://user:pass@host`, `whsec_...` across the full history. Everything
else found was one of:
- Vendored upstream OSS test fixtures/docs (this repo vendors large chunks of
  dagster, prefect, litellm, langfuse, phoenix, firecrawl, temporal, crewai,
  langgraph, llama_index, lance, etc. under paths later reorganized/removed —
  e.g. `AKIAIOSFODNN7EXAMPLE` is AWS's own public documentation placeholder,
  `temporal/common/auth/testdata/*.key` are Temporal's own public test certs).
- `.env.example`/`.env.*.example`/`.env.*.template` files — placeholder values only
  (`CHANGE_ME_...`, `your-...`, `xxxxxxxx`).
- One genuine Stripe-style test fixture (`whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` in
  `py/recoder-billing/tests/test_webhook_engine.py`) — a local-only HMAC test value
  used to unit-test a signature-verification function, never sent to any real
  Stripe/Polar endpoint; the entire Polar billing feature it belonged to was later
  removed (`e41c2bb25d`).
- `pk_live_Y2xlcmsudDMuY29kZXMk` — Clerk publishable key vendored from t3.chat
  (upstream project this repo forked); publishable keys are designed to be public,
  and there's already a sanitization script (`sed ... pk_live_REPLACE_WITH_RECODER_KEY_NOT_T3`)
  in the repo's own history showing this was already treated as a template to swap.

No committed `.pem`/`.p12`/real private key files were found (`services/postal/docker/ci-config/signing.key`
only exists in the *other* repo, vcpeer — see that repo's notes).

## Action taken

- Did **not** rotate any of the above. No Neon API token, Google Cloud Console
  access, Groq/GitHub-App-admin, or Dodo dashboard credential exists anywhere in
  this environment's accessible env/secrets that would let me rotate these safely
  and re-verify the result without risking breaking a live service I can't check.
- Did **not** force-push or rewrite git history (standing rule).
- Did **not** flip repo visibility to public.

## Owner-only follow-up required before this repo can safely go public

1. Rotate in Google Cloud Console: OAuth client secret for client ID
   `716966330476-q7khujpttocjrgl3qils6b5aegef93jj.apps.googleusercontent.com`
   (and double-check whether `716966330476-...` is the same client currently live
   on `recoder.xyz`'s production box — if so, rotate there too and redeploy).
2. Rotate the GitHub OAuth App secret for client ID `Ov23liaX8cGXq7VGX3bP`.
3. Rotate/reset the Neon Postgres password for `neondb_owner` on project
   `ep-rapid-queen-abgrjesz` (eu-west-2), or confirm the project/branch was already
   deleted.
4. Rotate the Dodo Payments API key `walGG6HxdNDTWvKX...` in the Dodo dashboard.
5. Regenerate `NEXTAUTH_SECRET`, `UNIFIED_AUTH_SECRET`, `JWT_SECRET` /
   `API_ENCRYPTION_KEY`, `SESSION_SYNC_SECRET`, `RECODER_API_KEY` in whatever live
   config currently backs recoder.xyz's production auth, then redeploy.
6. Once rotated, re-run a secrets scan (or just re-check this file's list) and this
   repo is clear to go public — the git history itself does not need to be rewritten
   once the underlying credentials are dead, since a dead secret in old history is
   no longer exploitable.

Logged as an owner-only blocker in `~/products/PORTFOLIO-PRIORITIES-2026-10-23.md`
and in `~/products/plans/recoder.md`.
