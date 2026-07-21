# Search Submission Runbook (owner-only manual submits)

Scope: the one-time / occasional **manual** steps an owner must perform to get
`recoder.xyz` verified and submitted to search engines, plus the env values the
already-shipped code reads. Everything here is **Bucket B** — it needs an owner
account, a self-generated key, or a search-engine console toggle. None of it can
be done autonomously by an agent, and **no code in `app/` ever claims one of
these submissions happened** (the IndexNow path degrades to a truthful no-op
until `INDEXNOW_KEY` is set — see §4).

This runbook is the counterpart to the shipped Bucket-A code:

| Code artifact (already merged) | What it does | What the owner still does (this doc) |
|---|---|---|
| `app/app/robots.ts` | Emits `robots.txt` with `Sitemap:` directive + disallows authed/utility paths | Nothing — automatic |
| `app/app/sitemap.ts` | Emits `sitemap.xml` (real routes + hreflang) | Submit its URL to GSC / Bing (§1, §2) |
| `app/lib/analytics/ga.ts` `resolveSiteVerification()` | Renders GSC/Bing verification `<meta>` from env | Provide the tokens (§1, §2) |
| `app/lib/analytics/ga.ts` `resolveGaMeasurementId()` | Loads GA4 from `NEXT_PUBLIC_GA_ID` | Confirm/rotate id + mark conversions (§5) |
| `app/app/api/indexnow/route.ts` + `app/scripts/ping-indexnow.mjs` | Pings IndexNow (feeds Bing) | Generate key, deploy `<key>.txt`, set env (§4) |

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

## 4. IndexNow (generate key, deploy validation file, verify the ping)

**Goal:** make the shipped IndexNow ping live. Until `INDEXNOW_KEY` is set, the
endpoint and script are truthful **no-ops** (they never fabricate a submission).

1. **Generate a key.** IndexNow keys are hex/UUID-like strings (8–128 chars,
   `[a-zA-Z0-9-]`). A UUID works:

   ```bash
   uuidgen | tr 'A-Z' 'a-z'
   # e.g. 3f8c1e42-9a7b-4c1d-8e2f-6b0a5d9c7e11
   ```

2. **Set the env** in the deploy environment (do **not** commit the real value):

   ```
   INDEXNOW_KEY=<the-generated-key>
   ```

3. **Deploy the key validation file.** IndexNow requires a file served at
   `https://recoder.xyz/<key>.txt` whose **body is exactly the key**. The repo
   ships only a documented placeholder:

   ```
   app/public/INDEXNOW_KEY.txt
     └─ body: INDEXNOW_KEY_PLACEHOLDER_DO_NOT_USE_GENERATE_A_REAL_KEY
   ```

   At deploy time, generate the real file from `INDEXNOW_KEY` — e.g. write
   `public/<key>.txt` containing just the key — so it is served at
   `https://recoder.xyz/<key>.txt`. **Never commit the real `<key>.txt` or the
   real key value to git.** (The placeholder filename `INDEXNOW_KEY.txt` is not
   a valid key file itself — IndexNow expects the file named after the actual
   key.)

4. **Verify the file** is public and correct:

   ```bash
   curl -s https://recoder.xyz/<key>.txt   # must print exactly the key
   ```

5. **Verify the ping.** Two entry points, both degrade-truthful:
   - Post-deploy script (reads the live sitemap's URL list and submits):

     ```bash
     node app/scripts/ping-indexnow.mjs
     # key unset  → logs "skipped: no key", exits 0, NO network call
     # key set    → real POST to https://api.indexnow.org/indexnow, prints
     #              the upstream status verbatim (non-2xx = failure, not success)
     ```

     Optional origin override for the script: `NEXT_PUBLIC_SITE_URL` or
     `SITE_URL` (must be `https://…`; falls back to `https://recoder.xyz`).
   - Route (`app/app/api/indexnow/route.ts`): `POST /api/indexnow` with a JSON
     `urlList`. With the key unset it returns
     `501 { submitted: false, reason: "INDEXNOW_KEY not configured" }` and makes
     no network call. `submitted: true` is returned **only** on a real 2xx from
     IndexNow.

**Truthfulness:** neither path claims a submission that did not happen. If the
key is absent, both are silent no-ops; the owner is responsible for the key,
the file, and running the ping (typically wired into the deploy hook).

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
| `INDEXNOW_KEY` | indexnow route + `ping-indexnow.mjs` | Truthful no-op (no ping) |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL` | robots / sitemap origin / ping script | Falls back to `https://recoder.xyz` |
| `ANALYTICS_INGEST_URL` | `trackServerEvent` | Log-only (no external POST) |

**Never commit** any of these real values, and never commit a real
`<key>.txt`. The only committed artifact is the documented placeholder
`app/public/INDEXNOW_KEY.txt`.

---

## What is code vs manual (summary)

- **Automatic (code, already shipped):** `robots.txt`, `sitemap.xml` with
  hreflang, GSC/Bing verification meta rendering, GA4 loader, IndexNow
  endpoint + ping script, LTV aggregation view.
- **Manual (owner, this runbook):** creating GSC/Bing/Brave properties, pasting
  verification tokens into env, submitting the sitemap, the Brave web-form
  submit, generating the IndexNow key + deploying `<key>.txt`, and marking GA4
  conversions. These cannot be automated and are not claimed done by any code.
