# Search Submission Runbook (owner-only manual submits)

Scope: the one-time / occasional **manual** steps an owner must perform to get
`recoder.xyz` verified and submitted to search engines, plus the env values the
already-shipped code reads. Everything here is **Bucket B** — it needs an owner
account, a self-generated key, or a search-engine console toggle. None of it can
be done autonomously by an agent, and **no code in `app/` ever claims one of
these submissions happened** — IndexNow performs only real POSTs and reports the
upstream status verbatim (see §4). IndexNow itself now ships live-by-default with
a committed **public** key, so no owner step is required to enable it; the owner
steps below are for rotation and the other search consoles.

This runbook is the counterpart to the shipped Bucket-A code:

| Code artifact (already merged) | What it does | What the owner still does (this doc) |
|---|---|---|
| `app/app/robots.ts` | Emits `robots.txt` with `Sitemap:` directive + disallows authed/utility paths | Nothing — automatic |
| `app/app/sitemap.ts` | Emits `sitemap.xml` (real routes + hreflang) | Submit its URL to GSC / Bing (§1, §2) |
| `app/lib/analytics/ga.ts` `resolveSiteVerification()` | Renders GSC/Bing verification `<meta>` from env | Provide the tokens (§1, §2) |
| `app/lib/analytics/ga.ts` `resolveGaMeasurementId()` | Loads GA4 from `NEXT_PUBLIC_GA_ID` | Confirm/rotate id + mark conversions (§5) |
| `app/lib/seo/indexnow.ts` (+ `app/app/api/indexnow/route.ts`, `app/scripts/ping-indexnow.mjs`) | Submits URLs to IndexNow (fans out to Bing/Yandex/Seznam) with a committed public key | Nothing to enable; only **rotate** the key if desired (§4) |

**Honesty contract:** these are the *manual* halves of otherwise-automated flows.
Do not mark a step done until the search-engine console itself confirms it. The
code cannot and does not report "submitted to Bing/Brave/Google" — those are
owner-observed.

---

## 1. Google Search Console (GSC)

**Goal:** verify ownership of `https://recoder.xyz` and submit the sitemap.

1. Sign in at <https://search.google.com/search-console> and add a property.
   Use the **URL-prefix** property `https://recoder.xyz` (or a Domain property
   if you prefer DNS-based verification).
2. Choose the **HTML tag** verification method. Google shows a `<meta
   name="google-site-verification" content="...">` tag — copy only the
   `content` token.
3. Set the token in the deploy env (do **not** commit it):

   ```
   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<token>
   ```

   The code (`app/lib/analytics/ga.ts` → `resolveSiteVerification()`, consumed by
   `app/app/layout.tsx` metadata `verification.google`) renders the meta tag only
   when this env is non-empty. An unset token emits **no** tag (no empty meta) —
   so you can add it later without a code change. Redeploy so the tag is live.
   - Alternative: DNS TXT verification via the Domain property (no env needed).
4. Back in GSC, click **Verify**.
5. Once verified, go to **Sitemaps** and submit:

   ```
   https://recoder.xyz/sitemap.xml
   ```

   This URL is produced by `app/app/sitemap.ts` (real routes + hreflang
   alternates). No manual per-URL submission is required.

**Code vs manual:** the meta tag + sitemap are code; adding the property,
pasting the token into env, and clicking Verify/Submit are manual owner steps.

---

## 2. Bing Webmaster Tools

**Goal:** claim the property and submit the sitemap. (Crawl coverage is also fed
automatically by IndexNow — see §4 — but a property claim adds Bing's analytics
and manual-submit UI.)

1. Sign in at <https://www.bing.com/webmasters> and **Add a site**:
   `https://recoder.xyz`.
2. Fastest path: **Import from Google Search Console** (available once §1 is
   verified) — Bing imports the property and sitemap in one step. If you do
   this, you can skip steps 3–5.
3. Manual alternative — choose the **HTML Meta Tag** option. Bing shows
   `<meta name="msvalidate.01" content="...">`; copy only the `content` token.
4. Set it in the deploy env (do **not** commit it):

   ```
   NEXT_PUBLIC_BING_SITE_VERIFICATION=<token>
   ```

   The same `resolveSiteVerification()` renders it as the `msvalidate.01` meta
   (metadata `verification.other`). Empty ⇒ omitted. Redeploy so it is live.
5. Click **Verify**, then under **Sitemaps** submit
   `https://recoder.xyz/sitemap.xml`.

**Note on IndexNow:** Bing consumes IndexNow, so the §4 ping already notifies
Bing of changed URLs once `INDEXNOW_KEY` is set — even without this property
claim. The property claim is for Bing's dashboard/analytics and manual submits,
not a prerequisite for IndexNow crawl.

---

## 3. Brave Search

**Goal:** notify Brave's independent index of the site.

- There is **no public API** and no env/token. Submit the site once via the
  manual web form:

  ```
  https://search.brave.com/submit-url
  ```

  Enter `https://recoder.xyz` and submit. This is a one-time owner action; the
  code has no Brave integration and makes no Brave claim.

---

## 4. IndexNow (live by default; only rotate if you want a new key)

**Goal:** notify participating search engines (Bing, Yandex, Seznam, …) when
URLs change. A single POST to `https://api.indexnow.org/indexnow` fans out to
all participating engines. This is **already live** — no owner setup required.

### What ships (and why the key is committed)

The IndexNow key is **public by design**: the protocol requires it to be served
at `https://recoder.xyz/<key>.txt` for anyone to read. So it is committed, and
the site works out of the box. The committed artifacts are:

| File | Role |
|---|---|
| `app/lib/seo/indexnow.ts` | Single source of truth: `DEFAULT_INDEXNOW_KEY`, key/origin resolution, payload builder, `submitUrls`/`submitUrl` (real POST, verbatim status, never throws) |
| `app/public/fc855a24fb8ed402c70b39f17fe8b444.txt` | The key validation file (body = the key exactly), served at `https://recoder.xyz/fc855a24fb8ed402c70b39f17fe8b444.txt` |
| `app/public/INDEXNOW_KEY.txt` | Human-readable pointer only — **not** a key file |
| `app/app/api/indexnow/route.ts` | `POST /api/indexnow` (auth-gated) so a content-change flow or owner can trigger a submit |
| `app/scripts/ping-indexnow.mjs` | Post-deploy sitemap-driven submit (also `pnpm seo:indexnow`) |

**Current committed key:** `fc855a24fb8ed402c70b39f17fe8b444`

### Verify it is live

```bash
curl -s https://recoder.xyz/fc855a24fb8ed402c70b39f17fe8b444.txt
# must print exactly: fc855a24fb8ed402c70b39f17fe8b444
```

### Trigger a submission

- **Post-deploy script** (reads the live sitemap and submits every URL):

  ```bash
  pnpm --dir app seo:indexnow      # or: node app/scripts/ping-indexnow.mjs
  # real POST to https://api.indexnow.org/indexnow; prints the upstream status
  # verbatim (non-2xx = failure, not success). Origin override:
  # NEXT_PUBLIC_SITE_URL / SITE_URL (must be https://…; default https://recoder.xyz)
  ```

- **API route** (`POST /api/indexnow`), for server-side content-change flows:

  ```
  Body: { "urls": ["https://recoder.xyz/pricing", ...] }   # legacy "urlList" also accepted
  Auth (required): one of
    - internal service signature headers (x-internal-service-key + x-internal-timestamp
      + x-internal-nonce + x-internal-signature), OR
    - x-admin-secret: <ADMIN_SECRET>
  ```

  Unauthenticated ⇒ `401 { submitted: false, reason: "Unauthorized" }`, no
  network call. Invalid/empty body ⇒ `400` (zod-validated). `submitted: true` is
  returned **only** on a real 2xx from IndexNow; upstream failures return the
  upstream status verbatim.

### Rotate the key

1. Pick a new key (8–128 chars, `[a-zA-Z0-9-]`), e.g. `openssl rand -hex 16`.
2. Set it in the deploy env: `INDEXNOW_KEY=<new-key>` (a valid value here wins
   over the committed default — see `resolveIndexNowKey()`).
3. Serve a matching file: replace `app/public/<new-key>.txt` (body = the new key
   exactly) and remove the old one. If you want the new key to also be the
   committed default, update `DEFAULT_INDEXNOW_KEY` in `app/lib/seo/indexnow.ts`
   **and** the duplicated constant in `app/scripts/ping-indexnow.mjs` (kept in
   lockstep on purpose — the `.mjs` runs without a TS build).
4. `curl` the new file to confirm it serves the exact key, then run the script.

**Truthfulness:** every path performs a real HTTP POST and reports the upstream
status verbatim; nothing is ever fabricated. There is no longer an "unset ⇒
no-op" state because the key always resolves (env override or committed public
default).

---

## 5. GA4 conversions + optional server sink

**Goal:** confirm the measurement id and mark the two revenue events as
conversions so the funnel is countable in GA4.

1. **Confirm / rotate the measurement id.** The GA4 id resolves from env
   (`app/lib/analytics/ga.ts` → `resolveGaMeasurementId()`), falling back to the
   current production id `G-V0G79DP41C` (`DEFAULT_GA_MEASUREMENT_ID`) so nothing
   breaks when unset. To rotate to a different property, set:

   ```
   NEXT_PUBLIC_GA_ID=<G-XXXXXXXXXX>
   ```

   (Cloudflare Web Analytics already covers privacy-first pageviews at the CF
   edge — do **not** add a second pageview beacon. GA4 here exists only for the
   typed conversion-event taxonomy in `app/lib/analytics/events.ts`.)

2. **Mark the conversions.** In **GA4 Admin → Events** (or **Key events** in the
   newer console), mark these two events as conversions / key events:

   ```
   signup_completed        (fired by app/api/auth/signup-email/route.ts)
   subscription_created    (fired from the payment webhooks on a REAL webhook)
   ```

   Optionally also mark `checkout_started` if you want to measure checkout
   entry. These event names come from `app/lib/analytics/events.ts`
   (`AnalyticsEvents`). They only fire client-side when `gtag` is loaded (a real
   GA id present) and, for payments, only on a **real** webhook carrying a real
   `userId` / `planId` / amount — never fabricated.

3. **Optional server event sink (`ANALYTICS_INGEST_URL`).** `trackServerEvent`
   (`app/lib/analytics/tracker.ts`) emits a structured log line and, when
   `ANALYTICS_INGEST_URL` is set, fire-and-forget POSTs each server event to
   that external aggregator (Datadog/Loki/CloudWatch/etc.):

   ```
   ANALYTICS_INGEST_URL=https://<your-collector>/ingest
   ```

   Unset ⇒ log-only (no POST, no fabricated event). This is the honest path to a
   **real queryable event store**, which the code currently lacks.

4. **LTV admin view — honest data source (C6).** The internal LTV view
   (`app/app/[locale]/admin/ltv/page.tsx`, API `app/app/api/admin/ltv/route.ts`,
   aggregation `app/lib/analytics/ltv.ts`) does **not** read GA4 or the event
   log — there is no persisted event store in `app/`. It aggregates only the
   genuinely persisted signal in the `users` table (`acquisitionSource` +
   `lastPaymentAmount` + subscription status), grouped by channel. Consequences
   the owner must understand:
   - `recordedRevenue` is a **lower-bound LTV proxy** (last recorded payment per
     user), not a full lifetime payment-history sum.
   - **CAC is never synthesized** — it needs per-channel ad spend, which the
     system does not store, so CAC is always `null` / "requires spend input".
   - With no paying users the report renders an honest empty state, not a
     fabricated zero metric.
   - Full CAC/LTV requires two owner-supplied inputs: (a) a real event store /
     `ANALYTICS_INGEST_URL` sink for per-payment history, and (b) per-channel ad
     spend. Neither is invented by the code.

---

## Env reference (all owner-provided; none committed)

| Env var | Consumed by | Effect when unset |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | `resolveSiteVerification()` → layout metadata | GSC meta tag omitted |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | `resolveSiteVerification()` → `msvalidate.01` | Bing meta tag omitted |
| `NEXT_PUBLIC_GA_ID` | `resolveGaMeasurementId()` | Falls back to `G-V0G79DP41C` |
| `INDEXNOW_KEY` | `resolveIndexNowKey()` (route + `ping-indexnow.mjs`) | Falls back to the committed public default `fc855a24fb8ed402c70b39f17fe8b444` |
| `ADMIN_SECRET` | `POST /api/indexnow` auth (also internal-service signature) | Route rejects owner-triggered submits with 401 |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL` | robots / sitemap origin / ping script | Falls back to `https://recoder.xyz` |
| `ANALYTICS_INGEST_URL` | `trackServerEvent` | Log-only (no external POST) |

**Never commit** GSC/Bing/GA verification tokens or `ADMIN_SECRET`. The IndexNow
key is the one deliberate exception — it is **public by design** and is committed
(`DEFAULT_INDEXNOW_KEY` + `app/public/fc855a24fb8ed402c70b39f17fe8b444.txt`). If
you rotate via `INDEXNOW_KEY` env, commit the matching `<key>.txt` too (it must
be publicly served) — that is expected, not a leak.

---

## What is code vs manual (summary)

- **Automatic (code, already shipped):** `robots.txt`, `sitemap.xml` with
  hreflang, GSC/Bing verification meta rendering, GA4 loader, IndexNow
  endpoint + ping script, LTV aggregation view.
- **Manual (owner, this runbook):** creating GSC/Bing/Brave properties, pasting
  verification tokens into env, submitting the sitemap, the Brave web-form
  submit, and marking GA4 conversions. IndexNow is no longer a manual step — it
  ships live with a committed public key; only key **rotation** is manual (§4).
  These cannot be automated and are not claimed done by any code.
