# Recoder product site

The site stores design-partner intake and pilot evidence in bounded NDJSON logs. Set `LEADS_DATA_DIR` to a durable writable directory. Set `PILOTS_DATA_DIR` only when pilot records need a separate directory.

## Pilot administration

Set `RECODER_PILOT_ADMIN_SECRET` to enable the admin-only pilot route. A missing secret disables admin reads and writes with HTTP 503. A wrong bearer token returns HTTP 401. `GET`, `POST`, and `PATCH` responses use `Cache-Control: no-store`.

`GET /api/admin/pilots` returns the private records needed for pilot operation after the same bearer check:

- `leadRefs`: design-partner lead `id` and `createdAt` only. Email, company context, workflow text, and intake answers stay in the lead store.
- `pilots`: the current revision of each private pilot record.

The local `/pilot-operations` candidate reads this endpoint and uses the existing `POST` and `PATCH` transitions. It distinguishes locked, loading, unauthorized, unavailable, empty, and success states. The operator can start a pilot from a stored lead ref, complete it with an outcome and public proof URL, then verify or cancel it. The page links verified records to the separate `/proof` aggregate without adding private IDs to that public response.

The operator enters `RECODER_PILOT_ADMIN_SECRET` once for the mounted page. The client keeps it in React memory and sends it only in the bearer header with `cache: "no-store"`; it does not write the secret to a URL, cookie, browser storage, analytics event, or log. Locking, an unauthorized response, or unmounting clears or releases the value.

Create a started pilot linked to a design-partner lead:

```sh
curl -X POST https://recoder.xyz/api/admin/pilots \
  -H "Authorization: Bearer $RECODER_PILOT_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"designPartnerLeadId":"<private-lead-id>","metricName":"Review time","metricUnit":"minutes","metricDirection":"decrease","baselineValue":45,"targetValue":25}'
```

Record the outcome, then move the pilot through `completed` and `verified`:

```sh
curl -X PATCH https://recoder.xyz/api/admin/pilots \
  -H "Authorization: Bearer $RECODER_PILOT_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pilotId":"<private-pilot-id>","status":"completed","outcomeValue":22,"proofUrl":"https://public.example.org/evidence/report"}'

curl -X PATCH https://recoder.xyz/api/admin/pilots \
  -H "Authorization: Bearer $RECODER_PILOT_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pilotId":"<private-pilot-id>","status":"verified"}'
```

Verification requires a public HTTP(S) proof URL. Verified records cannot change. Cancelled records cannot restart.

`GET /api/proof` returns a curated aggregate. It excludes lead and pilot IDs, email, company details, free text, metric values, and proof URLs. Target-attainment totals require a cohort of three verified outcomes. Missing logs mean zero records; unreadable logs return HTTP 503.

## Production containment

`/pilot-operations` is a local production candidate. This change does not deploy or enable it in production. The route is absent from the public navigation and sitemap, and its server layout sets `noindex`, `nofollow`, `noarchive`, `nosnippet`, and `noimageindex` metadata.

Production release requires explicit approval, HTTPS across the operator session, a rotated high-entropy `RECODER_PILOT_ADMIN_SECRET`, durable `LEADS_DATA_DIR` and `PILOTS_DATA_DIR` storage, and real HTTP/browser validation of every authorization and lifecycle state. Bearer credentials must not cross plaintext HTTP.

This cycle did not run a server, build, test, lint, CI, deploy, commit, or push. Remaining validation: missing/wrong/correct secret requests; response cache headers; empty/corrupt/unavailable stores; lead-to-pilot creation; completion with a public URL; verification and cancellation confirmations; terminal-state rejection; refresh after mutation; session-memory clearing; responsive layout; robots output; and proof privacy after real records.
