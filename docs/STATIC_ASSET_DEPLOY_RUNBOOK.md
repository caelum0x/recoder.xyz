# Static Asset Deploy Runbook (recoder.xyz)

Last updated: 2026-02-10

## Purpose

Use this runbook when production serves broken frontend assets, such as:

- `/_next/static/*` returns `404`
- CSS/JS blocked due to wrong `Content-Type` (served as `text/plain`)
- `logo.png` or other `public/` assets return `404`

## Fast Triage

1. Check homepage status and headers:

```bash
curl -I https://recoder.xyz/
```

2. Check key public assets:

```bash
curl -I https://recoder.xyz/logo.png
curl -I https://recoder.xyz/favicon.ico
```

3. Run static smoke:

```bash
cd app
BASE_URL="https://recoder.xyz" npm run smoke:static
```

## Immediate Recovery Steps

1. Redeploy app with a fresh build artifact from latest main.
2. Purge Cloudflare cache for static paths (or full purge once).
3. Re-run static smoke and verify all `/_next/static/*` URLs in homepage HTML return `200`.

## Cloudflare Purge Commands

Set your values:

```bash
export CF_API_TOKEN="__TOKEN_WITH_CACHE_PURGE_PERMISSION__"
export CF_ZONE_ID="__RECODER_XYZ_ZONE_ID__"
```

Purge `/_next/*` and key public files:

```bash
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "files": [
      "https://recoder.xyz/_next/static/",
      "https://recoder.xyz/logo.png",
      "https://recoder.xyz/favicon.ico"
    ]
  }'
```

If path purge is not sufficient, do one full purge:

```bash
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

## Verification Checklist

1. `https://recoder.xyz/logo.png` returns `200` and `Content-Type: image/png`.
2. `BASE_URL=https://recoder.xyz npm run smoke:static` passes.
3. Browser hard-refresh loads without:
   - chunk/font `404`
   - CSS/JS MIME mismatch errors
4. `https://recoder.xyz/api/health` returns `200`.

## Queue Backend Verification (Redis)

After docker-backend deploy, verify prompt task queue backend is actually Redis:

```bash
cd docker-backend
BACKEND_URL="https://api.recoder.xyz" EXPECTED_QUEUE_BACKEND="redis" npm run smoke:queue
```

Expected output includes:
- `selectedBackend=redis`
- `hasRedisUrl=true`
- backend `GET /api/health/byok-readiness` reports `overallReady=true`

## Root-Cause Prevention

1. Keep static smoke in CI (`Static Assets Smoke` workflow) and post-deploy monitor.
2. Keep stable Next.js build IDs (no timestamp-based custom `generateBuildId`).
3. Ensure deploy artifact includes:
   - `.next/static`
   - `public/`
4. Avoid mixed old/new containers during rollout without cache strategy.
